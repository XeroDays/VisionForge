const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { createLogger } = require("../services/visionforge-logger");
const { isAllowedImagePath } = require("../services/image-protocol");

const log = createLogger("image-service");

async function rotateImage(filePath) {
  const startedAt = log.enter("rotateImage");
  const resolved = path.resolve(String(filePath || ""));

  if (!resolved) {
    log.exit("rotateImage", startedAt, { ok: false, reason: "missing-file" });
    return { ok: false, reason: "missing-file" };
  }

  if (!isAllowedImagePath(resolved)) {
    log.exit("rotateImage", startedAt, { ok: false, reason: "forbidden" });
    return { ok: false, reason: "forbidden" };
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    log.exit("rotateImage", startedAt, { ok: false, reason: "missing-file" });
    return { ok: false, reason: "missing-file" };
  }

  const ext = path.extname(resolved) || ".png";
  const tempPath = path.join(
    path.dirname(resolved),
    `.vf-rot-${process.pid}-${Date.now()}${ext}`,
  );

  try {
    await sharp(resolved).rotate(90).toFile(tempPath);
    try {
      fs.unlinkSync(resolved);
      fs.renameSync(tempPath, resolved);
    } catch {
      fs.copyFileSync(tempPath, resolved);
      fs.unlinkSync(tempPath);
    }
    log.info("rotated image 90 CW", { filePath: resolved });
    log.exit("rotateImage", startedAt, { ok: true });
    return { ok: true, filePath: resolved };
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // ignore temp cleanup
    }
    log.error("rotateImage failed", { filePath: resolved, error: String(err.message || err) });
    log.exit("rotateImage", startedAt, { ok: false, reason: "rotate-failed" });
    return { ok: false, reason: "rotate-failed" };
  }
}

module.exports = {
  rotateImage,
};
