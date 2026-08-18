const fs = require("fs");
const path = require("path");
const { createLogger } = require("../services/visionforge-logger");

const log = createLogger("detection-import");

function detectionsEmpty(detections) {
  return detections == null || !Array.isArray(detections) || detections.length === 0;
}

function imageBasename(imageName) {
  return path.parse(String(imageName || "")).name;
}

function preferXml(annotationMode) {
  return /voc|pascal/i.test(String(annotationMode || ""));
}

function sidecarSearchOrder(annotationMode) {
  return preferXml(annotationMode) ? [".xml", ".txt"] : [".txt", ".xml"];
}

function findSidecarPath(imagesFolder, imageName, annotationMode) {
  const folder = String(imagesFolder || "").trim();
  const base = imageBasename(imageName);
  if (!folder || !base) return null;
  const dirs = [folder, path.join(folder, "labels")];
  for (const ext of sidecarSearchOrder(annotationMode)) {
    for (const dir of dirs) {
      const filePath = path.join(dir, `${base}${ext}`);
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return filePath;
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

function parseYoloTxt(content) {
  const detections = [];
  const lines = String(content || "").split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const labelid = Number.parseInt(parts[0], 10);
    const xc = Number(parts[1]);
    const yc = Number(parts[2]);
    const w = Number(parts[3]);
    const h = Number(parts[4]);
    if (!Number.isInteger(labelid) || ![xc, yc, w, h].every(Number.isFinite)) continue;
    detections.push({ labelid, value: { xc, yc, w, h } });
  }
  return detections;
}

function parseTag(block, tag) {
  const match = String(block || "").match(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`, "i"));
  return match ? match[1].trim() : "";
}

function parseVocXml(content, labels) {
  const nameToId = new Map();
  (Array.isArray(labels) ? labels : []).forEach((label) => {
    const key = String(label?.name || "").trim().toLowerCase();
    const id = Number(label?.id);
    if (key && Number.isFinite(id)) nameToId.set(key, id);
  });

  const detections = [];
  const objectRe = /<object>([\s\S]*?)<\/object>/gi;
  let match;
  while ((match = objectRe.exec(String(content || "")))) {
    const block = match[1];
    const className = parseTag(block, "name");
    const xmin = Number(parseTag(block, "xmin"));
    const ymin = Number(parseTag(block, "ymin"));
    const xmax = Number(parseTag(block, "xmax"));
    const ymax = Number(parseTag(block, "ymax"));
    const labelid = nameToId.get(className.toLowerCase());
    if (!Number.isFinite(labelid)) continue;
    if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) continue;
    detections.push({ labelid, value: { xmin, ymin, xmax, ymax } });
  }
  return detections;
}

function parseSidecar(filePath, labels) {
  const content = fs.readFileSync(filePath, "utf8");
  if (filePath.toLowerCase().endsWith(".xml")) {
    return parseVocXml(content, labels);
  }
  return parseYoloTxt(content);
}

function importEmptyDetections(project, imagesFolder) {
  const startedAt = log.enter("importEmptyDetections");
  const folder = String(imagesFolder || "").trim();
  const assets = Array.isArray(project?.assets) ? project.assets : [];
  if (!folder || !assets.length) {
    log.exit("importEmptyDetections", startedAt, { changed: false, reason: "nothing-to-do" });
    return { changed: false, assets };
  }

  let changed = 0;
  const next = assets.map((asset) => {
    const name = String(asset?.name || "").trim();
    if (!name || !detectionsEmpty(asset?.detections)) return asset;
    const sidecar = findSidecarPath(folder, name, project?.annotationMode);
    if (!sidecar) return { ...asset, name, detections: Array.isArray(asset?.detections) ? asset.detections : [] };
    try {
      const parsed = parseSidecar(sidecar, project?.labels);
      if (!parsed.length) {
        return { ...asset, name, detections: [] };
      }
      changed += 1;
      return { ...asset, name, detections: parsed };
    } catch (err) {
      log.warn("sidecar parse failed", { sidecar, error: String(err?.message || err) });
      return { ...asset, name, detections: [] };
    }
  });

  log.exit("importEmptyDetections", startedAt, { changed, total: assets.length });
  return { changed: changed > 0, assets: next };
}

module.exports = {
  importEmptyDetections,
  detectionsEmpty,
};
