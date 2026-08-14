const path = require("path");
const fs = require("fs");
const { app, nativeImage } = require("electron");

const devIconPath = path.join(__dirname, "../../renderer/images/logo/VisionForge.png");

function resolveIconPath() {
  if (app.isPackaged) {
    const packagedPath = path.join(process.resourcesPath, "icon.png");
    if (fs.existsSync(packagedPath)) return packagedPath;
  }
  return devIconPath;
}

function getAppIcon() {
  const icon = nativeImage.createFromPath(resolveIconPath());
  return icon.isEmpty() ? undefined : icon;
}

module.exports = { getAppIcon, resolveIconPath, devIconPath };
