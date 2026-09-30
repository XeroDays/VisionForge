const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { app } = require("electron");
const { setExtraAllowedImagesDir } = require("../services/image-protocol");
const { createLogger } = require("../services/visionforge-logger");

const log = createLogger("video-frames");
const VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".webm"]);

let activeFramesDir = "";

function framesRoot() {
  return path.join(app.getPath("temp"), "VisionForge");
}

function defaultFramesDir() {
  return path.join(framesRoot(), "video-frames");
}

function resolveFfmpegPath() {
  let bin = "";
  try {
    bin = require("ffmpeg-static") || "";
  } catch (err) {
    log.warn("ffmpeg-static missing", { error: String(err?.message || err) });
    return "";
  }
  if (bin.includes("app.asar")) bin = bin.replace("app.asar", "app.asar.unpacked");
  return bin;
}

function safeBaseName(videoPath) {
  const base = path.parse(String(videoPath || "")).name.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "");
  return (base || "frame").slice(0, 40);
}

function normalizeJump(value, jumpMax) {
  let n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) n = 1;
  const cap = Math.round(Number(jumpMax));
  if (Number.isFinite(cap) && cap >= 1) n = Math.min(n, cap);
  return n;
}

function parseProbe(stderr) {
  const text = String(stderr || "");
  const durationMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!durationMatch) return null;
  const durationSeconds = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]);
  const videoLine = text.split(/\r?\n/).find((line) => /Video:/.test(line));
  if (!videoLine) return null;
  const sizeMatch = videoLine.match(/(\d{2,5})x(\d{2,5})/);
  const fpsMatch = videoLine.match(/([\d.]+)\s*fps/);
  if (!sizeMatch || !fpsMatch) return null;
  const fps = Number(fpsMatch[1]);
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
  return {
    duration: `${durationMatch[1]}:${durationMatch[2]}:${durationMatch[3]}`,
    width: Number(sizeMatch[1]),
    height: Number(sizeMatch[2]),
    fps,
    totalFrames,
    jumpMax: Math.max(1, Math.floor(totalFrames / 2)),
  };
}

function removeDir(dir) {
  if (!dir || !fs.existsSync(dir)) return true;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return true;
  } catch (err) {
    log.warn("could not remove frames dir", { dir, error: String(err?.message || err) });
    return false;
  }
}

function resetFramesDir() {
  const root = framesRoot();
  fs.mkdirSync(root, { recursive: true });
  const previous = activeFramesDir;
  let dir = defaultFramesDir();
  if (!removeDir(dir)) {
    dir = path.join(root, `video-frames-${Date.now()}`);
    log.warn("frames dir locked, using a new folder", { dir });
  }
  if (previous && path.resolve(previous) !== path.resolve(dir)) removeDir(previous);
  try {
    const names = fs.readdirSync(root);
    names.forEach((name) => {
      if (name !== "video-frames" && !name.startsWith("video-frames-")) return;
      const candidate = path.join(root, name);
      if (path.resolve(candidate) === path.resolve(dir)) return;
      removeDir(candidate);
    });
  } catch (err) {
    log.warn("could not sweep old frame folders", { error: String(err?.message || err) });
  }
  fs.mkdirSync(dir, { recursive: true });
  activeFramesDir = dir;
  return dir;
}

function clearVideoFrameAccess() {
  setExtraAllowedImagesDir("");
  return { ok: true };
}

function runFfmpeg(bin, args) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    child.on("error", (err) => {
      resolve({ code: 1, stderr: String(err?.message || err) });
    });
    child.on("close", (code) => {
      resolve({ code: code == null ? 1 : code, stderr });
    });
  });
}

async function probeVideo(videoPath) {
  const startedAt = log.enter("probeVideo");
  const source = path.resolve(String(videoPath || "").trim());
  if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
    log.exit("probeVideo", startedAt, { ok: false, reason: "missing-file" });
    return { ok: false, reason: "missing-file" };
  }
  if (!VIDEO_EXTENSIONS.has(path.extname(source).toLowerCase())) {
    log.exit("probeVideo", startedAt, { ok: false, reason: "unsupported-type" });
    return { ok: false, reason: "unsupported-type" };
  }
  const bin = resolveFfmpegPath();
  if (!bin || !fs.existsSync(bin)) {
    log.exit("probeVideo", startedAt, { ok: false, reason: "missing-ffmpeg" });
    return { ok: false, reason: "missing-ffmpeg" };
  }
  const result = await runFfmpeg(bin, ["-hide_banner", "-i", source]);
  const info = parseProbe(result.stderr);
  if (!info) {
    log.exit("probeVideo", startedAt, { ok: false, reason: "unreadable" });
    return { ok: false, reason: "unreadable" };
  }
  log.exit("probeVideo", startedAt, { ok: true, totalFrames: info.totalFrames });
  return { ok: true, ...info };
}

async function extractVideoFrames(videoPath, frameJump) {
  const startedAt = log.enter("extractVideoFrames");
  const source = path.resolve(String(videoPath || "").trim());
  if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
    log.exit("extractVideoFrames", startedAt, { ok: false, reason: "missing-file" });
    return { ok: false, reason: "missing-file" };
  }
  if (!VIDEO_EXTENSIONS.has(path.extname(source).toLowerCase())) {
    log.exit("extractVideoFrames", startedAt, { ok: false, reason: "unsupported-type" });
    return { ok: false, reason: "unsupported-type" };
  }
  const bin = resolveFfmpegPath();
  if (!bin || !fs.existsSync(bin)) {
    log.exit("extractVideoFrames", startedAt, { ok: false, reason: "missing-ffmpeg" });
    return { ok: false, reason: "missing-ffmpeg" };
  }

  const probed = await probeVideo(source);
  const jump = normalizeJump(frameJump, probed.ok ? probed.jumpMax : undefined);
  let dir = "";
  try {
    dir = resetFramesDir();
  } catch (err) {
    log.error("could not prepare frames dir", { error: String(err?.message || err) });
    log.exit("extractVideoFrames", startedAt, { ok: false, reason: "frames-locked" });
    return { ok: false, reason: "frames-locked" };
  }
  const base = safeBaseName(source);
  const pattern = path.join(dir, `${base}_%06d.jpg`);
  const args = [
    "-y",
    "-i",
    source,
    "-vf",
    `select=not(mod(n\\,${jump}))`,
    "-vsync",
    "vfr",
    "-q:v",
    "2",
    pattern,
  ];
  log.info("extracting video frames", { source, jump });
  const result = await runFfmpeg(bin, args);
  if (result.code !== 0) {
    setExtraAllowedImagesDir("");
    log.warn("ffmpeg failed", { code: result.code, stderr: result.stderr.slice(-500) });
    log.exit("extractVideoFrames", startedAt, { ok: false, reason: "ffmpeg-failed" });
    return { ok: false, reason: "ffmpeg-failed" };
  }

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".jpg"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((name) => ({ name, filePath: path.join(dir, name) }));
  if (!files.length) {
    setExtraAllowedImagesDir("");
    log.exit("extractVideoFrames", startedAt, { ok: false, reason: "no-frames" });
    return { ok: false, reason: "no-frames" };
  }

  setExtraAllowedImagesDir(dir);
  log.exit("extractVideoFrames", startedAt, { ok: true, count: files.length });
  return { ok: true, files };
}

module.exports = {
  extractVideoFrames,
  probeVideo,
  clearVideoFrameAccess,
};
