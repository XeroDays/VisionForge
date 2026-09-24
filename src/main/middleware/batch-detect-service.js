const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createLogger } = require("../services/visionforge-logger");
const projectService = require("./project-service");
const { runOnnxDetect } = require("./onnx-detect-service");
const { mapModelDetections } = require("../../shared/detection-mapping");

const log = createLogger("batch-detect");

let cancelRequested = false;

function readSolution(filePath) {
  const resolved = path.resolve(String(filePath || "").trim());
  if (!resolved || !fs.existsSync(resolved)) return { ok: false, reason: "missing-file" };
  try {
    const project = JSON.parse(fs.readFileSync(resolved, "utf8"));
    if (!project || project.format !== "VFSln") return { ok: false, reason: "invalid-file" };
    return { ok: true, filePath: resolved, project };
  } catch {
    return { ok: false, reason: "invalid-file" };
  }
}

async function probeSize(filePath) {
  try {
    const meta = await sharp(filePath, { failOn: "none" }).metadata();
    return {
      width: Number(meta?.width) || 0,
      height: Number(meta?.height) || 0,
    };
  } catch {
    return { width: 0, height: 0 };
  }
}

function cancelBatchDetect() {
  cancelRequested = true;
  log.info("batch detect cancel requested");
  return { ok: true };
}

async function runBatchDetect(vfslnPath, options = {}, onProgress) {
  const startedAt = log.enter("runBatchDetect");
  cancelRequested = false;
  const loaded = readSolution(vfslnPath);
  if (!loaded.ok) {
    log.exit("runBatchDetect", startedAt, { ok: false, reason: loaded.reason });
    return loaded;
  }

  const project = loaded.project;
  const imagesFolder = String(project.imagesFolder || "").trim();
  const modelPath = String(project.onnxModelPath || "").trim();
  const modelType = String(project.onnxModelType || "object-detection");
  const confidence = project.onnxConfidence;
  if (!imagesFolder) {
    log.exit("runBatchDetect", startedAt, { ok: false, reason: "missing-images-folder" });
    return { ok: false, reason: "missing-images-folder" };
  }
  if (!modelPath) {
    log.exit("runBatchDetect", startedAt, { ok: false, reason: "missing-model" });
    return { ok: false, reason: "missing-model" };
  }

  const listed = projectService.listImageFolder(imagesFolder);
  if (!listed?.ok) {
    log.exit("runBatchDetect", startedAt, { ok: false, reason: listed?.reason || "invalid-folder" });
    return { ok: false, reason: listed?.reason || "invalid-folder" };
  }

  const labels = Array.isArray(project.labels) ? project.labels : [];
  const assets = Array.isArray(project.assets) ? project.assets.map((row) => ({ ...row })) : [];
  const byName = new Map();
  assets.forEach((row) => {
    if (row?.name) byName.set(String(row.name), row);
  });
  const voc = String(project.annotationMode || "").toLowerCase().includes("voc")
    || String(project.annotationMode || "").toLowerCase().includes("pascal");
  const obb = String(project.annotationType || "") === "oriented-object-detection";
  const skipLabeled = Boolean(options.skipLabeled);
  const files = listed.files;
  const total = files.length;
  const emptyNames = [];
  const touched = [];
  let processed = 0;

  const report = (current, name, count) => {
    if (typeof onProgress === "function") onProgress({ current, total, name, count });
  };
  report(0, "", 0);

  for (const [index, file] of files.entries()) {
    if (cancelRequested) {
      const partial = projectService.updateProject(loaded.filePath, { assets }, { skipPostHooks: true });
      log.exit("runBatchDetect", startedAt, { ok: false, reason: "cancelled", processed });
      return {
        ok: false,
        reason: "cancelled",
        processed,
        emptyNames,
        touched,
        assets: partial?.project?.assets || assets,
        files: listed.files,
        imagesFolder,
      };
    }
    let asset = byName.get(file.name);
    const existing = Array.isArray(asset?.detections) ? asset.detections : [];
    if (skipLabeled && existing.length > 0) {
      report(index + 1, file.name, existing.length);
      continue;
    }

    let width = Number(asset?.width) || 0;
    let height = Number(asset?.height) || 0;
    if (width <= 0 || height <= 0) {
      const probed = await probeSize(file.filePath);
      width = probed.width;
      height = probed.height;
    }

    const result = await runOnnxDetect(file.filePath, modelPath, labels, modelType, confidence);
    if (!result?.ok) {
      log.exit("runBatchDetect", startedAt, { ok: false, reason: result?.reason || "infer-failed", name: file.name });
      return { ok: false, reason: result?.reason || "infer-failed", name: file.name, processed, emptyNames, touched };
    }

    const detections = mapModelDetections(result.detections, { imgW: width, imgH: height, voc, obb });
    const nextAsset = {
      ...(asset || { name: file.name }),
      name: file.name,
      width: width > 0 ? Math.round(width) : 0,
      height: height > 0 ? Math.round(height) : 0,
      detections,
      flagged: Boolean(asset?.flagged),
    };
    if (asset) {
      Object.assign(asset, nextAsset);
    } else {
      assets.push(nextAsset);
      byName.set(file.name, nextAsset);
    }
    processed += 1;
    touched.push(file.name);
    if (!detections.length) emptyNames.push(file.name);
    report(index + 1, file.name, detections.length);
  }

  const updated = projectService.updateProject(loaded.filePath, { assets }, { skipPostHooks: true });
  if (!updated?.ok) {
    log.exit("runBatchDetect", startedAt, { ok: false, reason: updated?.reason || "persist-failed" });
    return { ok: false, reason: updated?.reason || "persist-failed", processed, emptyNames, touched };
  }

  log.info("batch detect finished", { processed, empty: emptyNames.length });
  log.exit("runBatchDetect", startedAt, { ok: true, processed, empty: emptyNames.length });
  return {
    ok: true,
    processed,
    emptyNames,
    touched,
    assets: updated.project?.assets || assets,
    files: listed.files,
    imagesFolder,
    cancelled: false,
  };
}

module.exports = { runBatchDetect, cancelBatchDetect };
