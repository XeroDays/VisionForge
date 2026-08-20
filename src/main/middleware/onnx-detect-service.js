const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ort = require("onnxruntime-node");
const { createLogger } = require("../services/visionforge-logger");

const log = createLogger("onnx-detect");

const CONF_THRESHOLD = 0.25;
const NMS_IOU = 0.45;
const MAX_DETECTIONS = 300;
const DEFAULT_SIZE = 640;

const sessions = new Map();

function namesFromLabels(labels) {
  const names = [];
  (Array.isArray(labels) ? labels : []).forEach((row) => {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id < 0) return;
    names[id] = String(row?.name || "").trim();
  });
  return names;
}

function className(names, id) {
  const index = Number(id);
  const name = names[index];
  if (name) return name;
  return `class_${Number.isFinite(index) ? index : 0}`;
}

function inputSize(session) {
  const name = session.inputNames[0];
  const dims = session.inputMetadata?.[name]?.dimensions || [];
  const height = Number(dims[2]);
  const width = Number(dims[3]);
  return {
    name,
    height: height > 0 ? height : DEFAULT_SIZE,
    width: width > 0 ? width : DEFAULT_SIZE,
  };
}

async function getSession(modelPath) {
  const resolved = path.resolve(String(modelPath || "").trim());
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, reason: "missing-model" };
  }
  const cached = sessions.get(resolved);
  if (cached) return { ok: true, session: cached, modelPath: resolved };
  const session = await ort.InferenceSession.create(resolved);
  sessions.set(resolved, session);
  return { ok: true, session, modelPath: resolved };
}

async function letterboxTensor(imagePath, inputW, inputH) {
  const meta = await sharp(imagePath).metadata();
  const origW = Number(meta.width) || 0;
  const origH = Number(meta.height) || 0;
  if (!origW || !origH) return { ok: false, reason: "invalid-image" };

  const scale = Math.min(inputW / origW, inputH / origH);
  const newW = Math.max(1, Math.round(origW * scale));
  const newH = Math.max(1, Math.round(origH * scale));
  const padX = (inputW - newW) / 2;
  const padY = (inputH - newH) / 2;

  const resized = await sharp(imagePath)
    .removeAlpha()
    .resize(newW, newH, { fit: "fill" })
    .raw()
    .toBuffer();

  const canvas = Buffer.alloc(inputW * inputH * 3, 114);
  const left = Math.round(padX);
  const top = Math.round(padY);
  for (let y = 0; y < newH; y += 1) {
    const src = y * newW * 3;
    const dest = ((top + y) * inputW + left) * 3;
    resized.copy(canvas, dest, src, src + newW * 3);
  }

  const tensor = new Float32Array(1 * 3 * inputH * inputW);
  const plane = inputH * inputW;
  for (let i = 0; i < plane; i += 1) {
    tensor[i] = canvas[i * 3] / 255;
    tensor[plane + i] = canvas[i * 3 + 1] / 255;
    tensor[plane * 2 + i] = canvas[i * 3 + 2] / 255;
  }

  return {
    ok: true,
    tensor: new ort.Tensor("float32", tensor, [1, 3, inputH, inputW]),
    origW,
    origH,
    scale,
    padX,
    padY,
    inputW,
    inputH,
  };
}

function mapBox(x1, y1, x2, y2, letter) {
  let left = x1;
  let top = y1;
  let right = x2;
  let bottom = y2;
  const maxSide = Math.max(letter.inputW, letter.inputH);
  if (right <= 2 && bottom <= 2) {
    left *= letter.inputW;
    top *= letter.inputH;
    right *= letter.inputW;
    bottom *= letter.inputH;
  } else if (right > maxSide * 1.5 || bottom > maxSide * 1.5) {
    return null;
  }
  const xmin = Math.round((Math.min(left, right) - letter.padX) / letter.scale);
  const ymin = Math.round((Math.min(top, bottom) - letter.padY) / letter.scale);
  const xmax = Math.round((Math.max(left, right) - letter.padX) / letter.scale);
  const ymax = Math.round((Math.max(top, bottom) - letter.padY) / letter.scale);
  return {
    xmin: Math.max(0, Math.min(letter.origW, xmin)),
    ymin: Math.max(0, Math.min(letter.origH, ymin)),
    xmax: Math.max(0, Math.min(letter.origW, xmax)),
    ymax: Math.max(0, Math.min(letter.origH, ymax)),
  };
}

function iou(a, b) {
  const x1 = Math.max(a.xmin, b.xmin);
  const y1 = Math.max(a.ymin, b.ymin);
  const x2 = Math.min(a.xmax, b.xmax);
  const y2 = Math.min(a.ymax, b.ymax);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.xmax - a.xmin) * Math.max(0, a.ymax - a.ymin);
  const areaB = Math.max(0, b.xmax - b.xmin) * Math.max(0, b.ymax - b.ymin);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function nms(items) {
  const sorted = items.slice().sort((a, b) => b.score - a.score);
  const kept = [];
  for (const item of sorted) {
    if (kept.length >= MAX_DETECTIONS) break;
    if (kept.some((other) => other.labelid === item.labelid && iou(item, other) > NMS_IOU)) continue;
    kept.push(item);
  }
  return kept;
}

function decodeEndToEnd(data, dims, names, letter) {
  const last = dims[dims.length - 1];
  if (last !== 6 && last !== 7) return null;
  const rows = data.length / last;
  const out = [];
  for (let i = 0; i < rows; i += 1) {
    const o = i * last;
    const box = mapBox(data[o], data[o + 1], data[o + 2], data[o + 3], letter);
    const score = data[o + 4];
    const cls = Math.round(data[o + 5]);
    if (!box || score < CONF_THRESHOLD || box.xmax <= box.xmin || box.ymax <= box.ymin) continue;
    out.push({
      labelid: cls,
      name: className(names, cls),
      score: Number(score.toFixed(4)),
      ...box,
    });
  }
  return nms(out);
}

function decodeYoloRaw(data, dims, names, letter) {
  let channels;
  let count;
  let transposed = false;
  if (dims.length >= 3 && dims[1] < dims[2]) {
    channels = dims[1];
    count = dims[2];
    transposed = true;
  } else if (dims.length >= 3) {
    count = dims[1];
    channels = dims[2];
  } else if (dims.length === 2) {
    count = dims[0];
    channels = dims[1];
  } else {
    return [];
  }
  if (channels < 6) return [];

  const hasObjectness = names.length > 0 && channels === names.length + 5;
  const classCount = hasObjectness ? channels - 5 : channels - 4;
  const out = [];

  for (let i = 0; i < count; i += 1) {
    const at = (offset) => (transposed ? data[offset * count + i] : data[i * channels + offset]);
    const cx = at(0);
    const cy = at(1);
    const w = at(2);
    const h = at(3);
    let best = 0;
    let cls = 0;
    const classStart = hasObjectness ? 5 : 4;
    const objectness = hasObjectness ? at(4) : 1;
    for (let c = 0; c < classCount; c += 1) {
      const score = at(classStart + c);
      if (score > best) {
        best = score;
        cls = c;
      }
    }
    const score = objectness * best;
    if (score < CONF_THRESHOLD) continue;
    const box = mapBox(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, letter);
    if (!box || box.xmax <= box.xmin || box.ymax <= box.ymin) continue;
    out.push({
      labelid: cls,
      name: className(names, cls),
      score: Number(score.toFixed(4)),
      ...box,
    });
  }
  return nms(out);
}

function decodeOutputs(results, names, letter) {
  for (const value of Object.values(results)) {
    if (!value?.data || !value.dims) continue;
    const end2end = decodeEndToEnd(value.data, value.dims, names, letter);
    if (end2end) return end2end;
    const raw = decodeYoloRaw(value.data, value.dims, names, letter);
    if (raw.length) return raw;
  }
  return [];
}

async function runOnnxDetect(imagePath, modelPath, labels) {
  const startedAt = log.enter("runOnnxDetect");
  const image = String(imagePath || "").trim();
  if (!image || !fs.existsSync(image) || !fs.statSync(image).isFile()) {
    log.exit("runOnnxDetect", startedAt, { ok: false, reason: "missing-image" });
    return { ok: false, reason: "missing-image" };
  }

  const names = namesFromLabels(labels);

  let loaded;
  try {
    loaded = await getSession(modelPath);
  } catch (err) {
    log.error("could not load ONNX model", { error: String(err?.message || err) });
    log.exit("runOnnxDetect", startedAt, { ok: false, reason: "invalid-model" });
    return { ok: false, reason: "invalid-model" };
  }
  if (!loaded.ok) {
    log.exit("runOnnxDetect", startedAt, { ok: false, reason: loaded.reason });
    return loaded;
  }

  const size = inputSize(loaded.session);
  let letter;
  try {
    letter = await letterboxTensor(image, size.width, size.height);
  } catch (err) {
    log.error("could not prepare image", { error: String(err?.message || err) });
    log.exit("runOnnxDetect", startedAt, { ok: false, reason: "invalid-image" });
    return { ok: false, reason: "invalid-image" };
  }
  if (!letter.ok) {
    log.exit("runOnnxDetect", startedAt, { ok: false, reason: letter.reason });
    return letter;
  }

  try {
    const results = await loaded.session.run({ [size.name]: letter.tensor });
    const detections = decodeOutputs(results, names, letter);
    log.info("onnx detect finished", { count: detections.length, modelPath: loaded.modelPath });
    log.exit("runOnnxDetect", startedAt, { ok: true, count: detections.length });
    return { ok: true, detections };
  } catch (err) {
    log.error("onnx infer failed", { error: String(err?.message || err) });
    log.exit("runOnnxDetect", startedAt, { ok: false, reason: "infer-failed" });
    return { ok: false, reason: "infer-failed" };
  }
}

module.exports = { runOnnxDetect };
