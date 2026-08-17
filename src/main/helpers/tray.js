const { Tray, Menu, nativeImage } = require("electron");
const { getAppIcon } = require("./app-icon");
const { createLogger } = require("../services/visionforge-logger");

const log = createLogger("tray");

let tray = null;

function getTrayIcon() {
  const icon = getAppIcon();
  if (!icon) return nativeImage.createEmpty();
  const size = process.platform === "win32" ? 16 : 22;
  return icon.resize({ width: size, height: size });
}

function createTray({ onShow, onQuit }) {
  if (tray) return tray;

  tray = new Tray(getTrayIcon());
  tray.setToolTip("VisionForge");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show", click: () => onShow && onShow() },
      { type: "separator" },
      { label: "Quit", click: () => onQuit && onQuit() },
    ])
  );

  tray.on("click", () => {
    if (onShow) onShow();
  });

  tray.on("double-click", () => {
    if (onShow) onShow();
  });

  log.info("tray created");
  return tray;
}

function destroyTray() {
  if (!tray) return;
  tray.destroy();
  tray = null;
  log.info("tray destroyed");
}

function hideToTray(win) {
  if (!win || win.isDestroyed()) return;
  win.setSkipTaskbar(true);
  win.hide();
  log.debug("window hidden to tray");
}

function showFromTray(win) {
  if (!win || win.isDestroyed()) return;
  win.setSkipTaskbar(false);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  log.debug("window shown from tray");
}

module.exports = {
  createTray,
  destroyTray,
  hideToTray,
  showFromTray,
};
