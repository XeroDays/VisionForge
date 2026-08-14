const { BrowserWindow } = require("electron");
const path = require("path");
const { getAppIcon } = require("../helpers/app-icon");
const { startup: log } = require("../services/visionforge-logger");

function createMainWindow() {
  const startedAt = log.enter("createMainWindow");
  const icon = getAppIcon();
  const indexHtml = path.join(__dirname, "../../renderer/index.html");

  const win = new BrowserWindow({
    width: 640,
    height: 480,
    ...(icon && { icon }),
    frame: false,
    backgroundColor: "#0b0b0d",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/index.js"),
      contextIsolation: true,
    },
  });

  if (process.platform === "win32" && icon) {
    win.setIcon(icon);
  }

  win.setMenuBarVisibility(false);
  log.info("loading index.html", { file: indexHtml });
  win.loadFile(indexHtml);
  log.exit("createMainWindow", startedAt);

  return win;
}

module.exports = { createMainWindow };
