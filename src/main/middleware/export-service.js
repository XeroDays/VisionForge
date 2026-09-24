const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createLogger } = require("../services/visionforge-logger");

const log = createLogger("export");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"]);

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function yoloNorm(pixels, size) {
  const dim = Math.max(Number(size) || 1, 1);
  return Number(clamp01(pixels / dim).toFixed(6));
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const YOLO_TXT_MODES = new Set(["yolo-bounding-box", "center-based-normalized-bounding-boxes"]);
const YOLO_OBB_MODE = "yolo-obb";
const DOTA_MODE = "dota";
const XYWHR_MODE = "rotated-rectangle-obb";
const QUAD_MODE = "4-point-quadrilateral";
const ROTATED_COCO_MODE = "rotated-coco-json";
const VOC_XML_MODE = "pascal-voc-bounding-box";
const COCO_JSON_MODE = "coco-bounding-box";
const CLASSES_TXT_MODES = new Set([...YOLO_TXT_MODES, YOLO_OBB_MODE, XYWHR_MODE, QUAD_MODE]);

function isVocValue(value) {
  if (!value || typeof value !== "object") return false;
  return [value.xmin, value.ymin, value.xmax, value.ymax].every((part) => Number.isFinite(Number(part)));
}

function isYoloValue(value) {
  if (!value || typeof value !== "object") return false;
  return [value.xc, value.yc, value.w, value.h].every((part) => Number.isFinite(Number(part)));
}

function listImageFiles(folderPath) {
  const dir = String(folderPath || "").trim();
  if (!dir) return [];
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(dir, entry.name),
    }))
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

function readSolution(filePath) {
  const resolved = String(filePath || "").trim();
  if (!resolved) return { ok: false, reason: "missing-file" };
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, reason: "missing-file" };
  }

  let project;
  try {
    project = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (err) {
    log.warn("VFSln parse failed", { filePath: resolved, error: String(err.message || err) });
    return { ok: false, reason: "invalid-file" };
  }

  if (!project || typeof project !== "object" || project.format !== "VFSln") {
    return { ok: false, reason: "invalid-file" };
  }

  return { ok: true, filePath: resolved, project };
}

async function probeSize(filePath) {
  try {
    const meta = await sharp(filePath).metadata();
    const width = Number(meta.width) || 0;
    const height = Number(meta.height) || 0;
    if (width > 0 && height > 0) return { width, height };
  } catch (err) {
    log.warn("could not probe image size", { filePath, error: String(err?.message || err) });
  }
  return { width: 0, height: 0 };
}

function labelName(labels, labelid) {
  const id = Number(labelid);
  const found = (Array.isArray(labels) ? labels : []).find((row) => Number(row?.id) === id);
  const name = String(found?.name || "").trim();
  return name || `class_${Number.isFinite(id) ? id : 0}`;
}

function detectionToPixels(value, imgW, imgH) {
  if (isVocValue(value)) {
    const xmin = Math.round(Number(value.xmin));
    const ymin = Math.round(Number(value.ymin));
    const xmax = Math.round(Number(value.xmax));
    const ymax = Math.round(Number(value.ymax));
    return {
      xmin,
      ymin,
      xmax,
      ymax,
    };
  }
  if (!isYoloValue(value) || !imgW || !imgH) return null;
  const xc = Number(value.xc);
  const yc = Number(value.yc);
  const w = Number(value.w);
  const h = Number(value.h);
  return {
    xmin: Math.round((xc - w / 2) * imgW),
    ymin: Math.round((yc - h / 2) * imgH),
    xmax: Math.round((xc + w / 2) * imgW),
    ymax: Math.round((yc + h / 2) * imgH),
  };
}

function detectionToYolo(value, imgW, imgH) {
  if (isYoloValue(value)) {
    return {
      xc: Number(clamp01(Number(value.xc)).toFixed(6)),
      yc: Number(clamp01(Number(value.yc)).toFixed(6)),
      w: Number(clamp01(Number(value.w)).toFixed(6)),
      h: Number(clamp01(Number(value.h)).toFixed(6)),
    };
  }
  if (!isVocValue(value) || !imgW || !imgH) return null;
  const xmin = Number(value.xmin);
  const ymin = Number(value.ymin);
  const xmax = Number(value.xmax);
  const ymax = Number(value.ymax);
  return {
    xc: yoloNorm((xmin + xmax) / 2, imgW),
    yc: yoloNorm((ymin + ymax) / 2, imgH),
    w: yoloNorm(xmax - xmin, imgW),
    h: yoloNorm(ymax - ymin, imgH),
  };
}

function writeYoloTxt(destPath, detections, imgW, imgH) {
  const lines = [];
  for (const detection of detections) {
    const yolo = detectionToYolo(detection?.value, imgW, imgH);
    if (!yolo) continue;
    const labelid = Number.isInteger(Number(detection.labelid)) ? Number(detection.labelid) : 0;
    lines.push(`${labelid} ${yolo.xc} ${yolo.yc} ${yolo.w} ${yolo.h}`);
  }
  fs.writeFileSync(destPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function rotatePoint(pt, cx, cy, angleDeg) {
  const rad = (Number(angleDeg) || 0) * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function detectionToYoloObb(value) {
  if (!isYoloValue(value)) return null;
  const xc = Number(value.xc);
  const yc = Number(value.yc);
  const w = Number(value.w);
  const h = Number(value.h);
  const angle = Number.isFinite(Number(value.angle)) ? Number(value.angle) : 0;
  const hw = w / 2;
  const hh = h / 2;
  return [
    { x: xc - hw, y: yc - hh },
    { x: xc + hw, y: yc - hh },
    { x: xc + hw, y: yc + hh },
    { x: xc - hw, y: yc + hh },
  ].map((pt) => {
    const rotated = rotatePoint(pt, xc, yc, angle);
    return {
      x: Number(clamp01(rotated.x).toFixed(6)),
      y: Number(clamp01(rotated.y).toFixed(6)),
    };
  });
}

function cornersPixels(value, imgW, imgH) {
  const corners = detectionToYoloObb(value);
  if (!corners || !imgW || !imgH) return null;
  return corners.map((pt) => ({
    x: Number((pt.x * imgW).toFixed(2)),
    y: Number((pt.y * imgH).toFixed(2)),
  }));
}

function writeDotaTxt(destPath, detections, imgW, imgH, labels) {
  const lines = [];
  for (const detection of detections) {
    const corners = cornersPixels(detection?.value, imgW, imgH);
    if (!corners) continue;
    const name = labelName(labels, detection?.labelid).replace(/\s+/g, "_");
    const coords = corners.flatMap((pt) => [pt.x, pt.y]).join(" ");
    lines.push(`${coords} ${name} 0`);
  }
  fs.writeFileSync(destPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function writeXywhrTxt(destPath, detections, imgW, imgH) {
  const lines = [];
  for (const detection of detections) {
    const yolo = detectionToYolo(detection?.value, imgW, imgH);
    if (!yolo) continue;
    const labelid = Number.isInteger(Number(detection.labelid)) ? Number(detection.labelid) : 0;
    const degrees = Number.isFinite(Number(detection?.value?.angle)) ? Number(detection.value.angle) : 0;
    const radians = Number(((degrees * Math.PI) / 180).toFixed(6));
    lines.push(`${labelid} ${yolo.xc} ${yolo.yc} ${yolo.w} ${yolo.h} ${radians}`);
  }
  fs.writeFileSync(destPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function writeQuadTxt(destPath, detections, imgW, imgH) {
  const lines = [];
  for (const detection of detections) {
    const corners = cornersPixels(detection?.value, imgW, imgH);
    if (!corners) continue;
    const labelid = Number.isInteger(Number(detection.labelid)) ? Number(detection.labelid) : 0;
    const coords = corners.flatMap((pt) => [pt.x, pt.y]).join(" ");
    lines.push(`${labelid} ${coords}`);
  }
  fs.writeFileSync(destPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function writeYoloObbTxt(destPath, detections) {
  const lines = [];
  for (const detection of detections) {
    const corners = detectionToYoloObb(detection?.value);
    if (!corners) continue;
    const labelid = Number.isInteger(Number(detection.labelid)) ? Number(detection.labelid) : 0;
    lines.push(`${labelid} ${corners.flatMap((pt) => [pt.x, pt.y]).join(" ")}`);
  }
  fs.writeFileSync(destPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

function writeVocXml({ destPath, folder, filename, imagePath, width, height, detections, labels }) {
  const objects = [];
  for (const detection of detections) {
    const box = detectionToPixels(detection?.value, width, height);
    if (!box) continue;
    const xmin = Math.max(0, box.xmin);
    const ymin = Math.max(0, box.ymin);
    const xmax = Math.max(xmin, box.xmax);
    const ymax = Math.max(ymin, box.ymax);
    const truncated = xmin <= 0 || ymin <= 0 || xmax >= width || ymax >= height ? 1 : 0;
    const name = escapeXml(labelName(labels, detection.labelid));
    objects.push(
      [
        "	<object>",
        `		<name>${name}</name>`,
        "		<pose>Unspecified</pose>",
        `		<truncated>${truncated}</truncated>`,
        "		<difficult>0</difficult>",
        "		<bndbox>",
        `			<xmin>${xmin}</xmin>`,
        `			<ymin>${ymin}</ymin>`,
        `			<xmax>${xmax}</xmax>`,
        `			<ymax>${ymax}</ymax>`,
        "		</bndbox>",
        "	</object>",
      ].join("\n"),
    );
  }

  const xml = [
    "<annotation>",
    `	<folder>${escapeXml(folder)}</folder>`,
    `	<filename>${escapeXml(filename)}</filename>`,
    `	<path>${escapeXml(imagePath)}</path>`,
    "	<source>",
    "		<database>Unknown</database>",
    "	</source>",
    "	<size>",
    `		<width>${width}</width>`,
    `		<height>${height}</height>`,
    "		<depth>3</depth>",
    "	</size>",
    "	<segmented>0</segmented>",
    ...objects,
    "</annotation>",
    "",
  ].join("\n");
  fs.writeFileSync(destPath, xml, "utf8");
}

function reportProgress(onProgress, current, total) {
  if (typeof onProgress !== "function") return;
  try {
    onProgress({ current, total });
  } catch {
    // ignore listener errors
  }
}

function writeCocoJson(destPath, images, annotations, labels) {
  const categories = [];
  const seen = new Set();
  (Array.isArray(labels) ? labels : []).forEach((row) => {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id < 0 || seen.has(id)) return;
    seen.add(id);
    categories.push({ id, name: String(row?.name || "").trim() || `class_${id}` });
  });
  categories.sort((a, b) => a.id - b.id);

  const payload = {
    images,
    annotations,
    categories,
  };
  fs.writeFileSync(destPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeClassesTxt(destPath, labels) {
  const rows = Array.isArray(labels) ? labels : [];
  const byId = new Map();
  let maxId = -1;
  rows.forEach((row) => {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id < 0) return;
    byId.set(id, String(row?.name || "").trim());
    if (id > maxId) maxId = id;
  });
  const lines = [];
  for (let id = 0; id <= maxId; id += 1) {
    lines.push(byId.has(id) ? byId.get(id) : "");
  }
  fs.writeFileSync(destPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
}

async function exportAnnotations(vfslnPath, destFolder, mode, onProgress) {
  const startedAt = log.enter("exportAnnotations");
  const dest = String(destFolder || "").trim();
  const exportMode = String(mode || "").trim();

  if (!dest) {
    log.exit("exportAnnotations", startedAt, { ok: false, reason: "missing-folder" });
    return { ok: false, reason: "missing-folder" };
  }
  if (!exportMode) {
    log.exit("exportAnnotations", startedAt, { ok: false, reason: "missing-mode" });
    return { ok: false, reason: "missing-mode" };
  }

  try {
    if (!fs.existsSync(dest) || !fs.statSync(dest).isDirectory()) {
      log.exit("exportAnnotations", startedAt, { ok: false, reason: "invalid-folder" });
      return { ok: false, reason: "invalid-folder" };
    }
  } catch {
    log.exit("exportAnnotations", startedAt, { ok: false, reason: "invalid-folder" });
    return { ok: false, reason: "invalid-folder" };
  }

  const loaded = readSolution(vfslnPath);
  if (!loaded.ok) {
    log.exit("exportAnnotations", startedAt, { ok: false, reason: loaded.reason });
    return loaded;
  }

  const imagesFolder = String(loaded.project?.imagesFolder || "").trim();
  if (!imagesFolder) {
    log.exit("exportAnnotations", startedAt, { ok: false, reason: "missing-images-folder" });
    return { ok: false, reason: "missing-images-folder" };
  }

  const isYoloObbMode = exportMode === YOLO_OBB_MODE;
  const isDotaMode = exportMode === DOTA_MODE;
  const isXywhrMode = exportMode === XYWHR_MODE;
  const isQuadMode = exportMode === QUAD_MODE;
  const isRotatedCocoMode = exportMode === ROTATED_COCO_MODE;
  const isTxtMode = YOLO_TXT_MODES.has(exportMode) || isYoloObbMode;
  const isVocMode = exportMode === VOC_XML_MODE;
  const isCocoMode = exportMode === COCO_JSON_MODE;
  const isObbSidecar = isDotaMode || isXywhrMode || isQuadMode;
  if (!isTxtMode && !isVocMode && !isCocoMode && !isObbSidecar && !isRotatedCocoMode) {
    log.exit("exportAnnotations", startedAt, { ok: false, reason: "invalid-mode" });
    return { ok: false, reason: "invalid-mode" };
  }

  const files = listImageFiles(imagesFolder);
  const writesClasses = CLASSES_TXT_MODES.has(exportMode);
  const extraFiles = writesClasses || isCocoMode || isRotatedCocoMode ? 1 : 0;
  const total = files.length + extraFiles;
  reportProgress(onProgress, 0, total);
  const assetsByName = new Map();
  (Array.isArray(loaded.project?.assets) ? loaded.project.assets : []).forEach((row) => {
    if (row?.name) assetsByName.set(String(row.name), row);
  });
  const labels = Array.isArray(loaded.project?.labels) ? loaded.project.labels : [];
  const folderName = path.basename(imagesFolder);
  const cocoImages = [];
  const cocoAnnotations = [];
  let annotationId = 1;
  let count = 0;

  for (const [index, file] of files.entries()) {
    const asset = assetsByName.get(file.name);
    let width = Number(asset?.width) || 0;
    let height = Number(asset?.height) || 0;
    if (width <= 0 || height <= 0) {
      const probed = await probeSize(file.filePath);
      width = probed.width;
      height = probed.height;
    }
    const detections = Array.isArray(asset?.detections) ? asset.detections : [];
    const base = path.parse(file.name).name;
    if (isYoloObbMode) {
      writeYoloObbTxt(path.join(dest, `${base}.txt`), detections);
      count += 1;
    } else if (isDotaMode) {
      writeDotaTxt(path.join(dest, `${base}.txt`), detections, width, height, labels);
      count += 1;
    } else if (isXywhrMode) {
      writeXywhrTxt(path.join(dest, `${base}.txt`), detections, width, height);
      count += 1;
    } else if (isQuadMode) {
      writeQuadTxt(path.join(dest, `${base}.txt`), detections, width, height);
      count += 1;
    } else if (isTxtMode) {
      writeYoloTxt(path.join(dest, `${base}.txt`), detections, width, height);
      count += 1;
    } else if (isVocMode) {
      writeVocXml({
        destPath: path.join(dest, `${base}.xml`),
        folder: folderName,
        filename: file.name,
        imagePath: file.filePath,
        width,
        height,
        detections,
        labels,
      });
      count += 1;
    } else if (isRotatedCocoMode) {
      const imageId = index + 1;
      cocoImages.push({
        id: imageId,
        file_name: file.name,
        width,
        height,
      });
      for (const detection of detections) {
        const yolo = detectionToYolo(detection?.value, width, height);
        const corners = cornersPixels(detection?.value, width, height);
        if (!yolo || !corners) continue;
        const degrees = Number.isFinite(Number(detection?.value?.angle)) ? Number(detection.value.angle) : 0;
        const categoryId = Number.isInteger(Number(detection.labelid)) ? Number(detection.labelid) : 0;
        cocoAnnotations.push({
          id: annotationId,
          image_id: imageId,
          category_id: categoryId,
          bbox: [
            Number((yolo.xc * width).toFixed(2)),
            Number((yolo.yc * height).toFixed(2)),
            Number((yolo.w * width).toFixed(2)),
            Number((yolo.h * height).toFixed(2)),
            Number(degrees.toFixed(2)),
          ],
          segmentation: [corners.flatMap((pt) => [pt.x, pt.y])],
          area: Number((yolo.w * width * yolo.h * height).toFixed(2)),
          iscrowd: 0,
        });
        annotationId += 1;
      }
    } else {
      const imageId = index + 1;
      cocoImages.push({
        id: imageId,
        file_name: file.name,
        width,
        height,
      });
      for (const detection of detections) {
        const box = detectionToPixels(detection?.value, width, height);
        if (!box) continue;
        const xmin = Math.max(0, box.xmin);
        const ymin = Math.max(0, box.ymin);
        const xmax = Math.max(xmin, box.xmax);
        const ymax = Math.max(ymin, box.ymax);
        const boxW = xmax - xmin;
        const boxH = ymax - ymin;
        const categoryId = Number.isInteger(Number(detection.labelid)) ? Number(detection.labelid) : 0;
        cocoAnnotations.push({
          id: annotationId,
          image_id: imageId,
          category_id: categoryId,
          bbox: [xmin, ymin, boxW, boxH],
          area: boxW * boxH,
          iscrowd: 0,
        });
        annotationId += 1;
      }
    }
    reportProgress(onProgress, isCocoMode || isRotatedCocoMode ? index + 1 : count, total);
  }

  if (writesClasses) {
    writeClassesTxt(path.join(dest, "classes.txt"), labels);
    count += 1;
    reportProgress(onProgress, count, total);
  } else if (isCocoMode || isRotatedCocoMode) {
    writeCocoJson(path.join(dest, "annotations.json"), cocoImages, cocoAnnotations, labels);
    count = 1;
    reportProgress(onProgress, total, total);
  }

  log.info("exported annotations", { dest, mode: exportMode, count });
  log.exit("exportAnnotations", startedAt, { ok: true, count });
  return { ok: true, count };
}

module.exports = { exportAnnotations };
