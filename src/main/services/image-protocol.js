const path = require("path");
const { protocol, net } = require("electron");
const { pathToFileURL } = require("url");
const { createLogger } = require("./visionforge-logger");

const log = createLogger("image-protocol");

const SCHEME = "vfimg";

let allowedDir = "";
let extraAllowedDir = "";
let handlerRegistered = false;

function isUnderDir(root, filePath) {
  if (!root) return false;
  const resolvedFile = path.resolve(String(filePath || ""));
  const rel = path.relative(root, resolvedFile);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  return true;
}

function registerPrivilegedScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
  log.debug("vfimg scheme registered as privileged");
}

function setAllowedImagesDir(dir) {
  allowedDir = dir ? path.resolve(String(dir)) : "";
  log.debug("allowed images dir", { allowedDir: allowedDir || "(none)" });
}

function setExtraAllowedImagesDir(dir) {
  extraAllowedDir = dir ? path.resolve(String(dir)) : "";
  log.debug("extra allowed images dir", { extraAllowedDir: extraAllowedDir || "(none)" });
}

function getAllowedImagesDir() {
  return allowedDir;
}

function isAllowedImagePath(filePath) {
  return isUnderDir(allowedDir, filePath) || isUnderDir(extraAllowedDir, filePath);
}

function registerHandler() {
  if (handlerRegistered) return;
  handlerRegistered = true;

  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get("p") || "";
      if (!isAllowedImagePath(filePath)) {
        log.warn("vfimg forbidden", { filePath });
        return new Response("Forbidden", { status: 403 });
      }
      return net.fetch(pathToFileURL(path.resolve(filePath)).href);
    } catch (err) {
      log.warn("vfimg fetch failed", { error: String(err.message || err) });
      return new Response("Not Found", { status: 404 });
    }
  });

  log.info("vfimg protocol handler registered");
}

module.exports = {
  SCHEME,
  registerPrivilegedScheme,
  registerHandler,
  setAllowedImagesDir,
  setExtraAllowedImagesDir,
  getAllowedImagesDir,
  isAllowedImagePath,
};
