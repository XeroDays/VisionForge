const { BrowserWindow, screen } = require("electron");
const path = require("path");
const { getAppIcon } = require("../helpers/app-icon");
const { splash: log } = require("../services/visionforge-logger");

function createSplashWindow() {
  const startedAt = log.enter("createSplashWindow");
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.round(workArea.width * 0.448);
  const icon = getAppIcon();
  const splashHtml = path.join(__dirname, "../../renderer/splash.html");

  const win = new BrowserWindow({
    width,
    height: 387,
    useContentSize: true,
    center: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#0a0e14",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "../../preload/splash-preload.js"),
      contextIsolation: true,
    },
  });

  if (process.platform === "win32" && icon) {
    win.setIcon(icon);
  }

  log.info("loading splash.html", { width, height: 387, file: splashHtml });
  win.loadFile(splashHtml);
  log.exit("createSplashWindow", startedAt);

  return win;
}

module.exports = { createSplashWindow };
