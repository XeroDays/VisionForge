const { BrowserWindow, ipcMain } = require("electron");
const channels = require("../../shared/ipc/channels");
const licenseService = require("../services/license-service");
const { hideToTray } = require("../helpers/tray");
const { ipc: log } = require("../services/visionforge-logger");

let ipcHandlersRegistered = false;

function registerIpcHandlers() {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  log.info("main IPC handlers registered");

  ipcMain.handle(channels.PING, async () => "pong");

  ipcMain.handle(channels.OPEN_DEVTOOLS, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.webContents.openDevTools({ mode: "detach" });
  });

  ipcMain.handle(channels.WINDOW_MINIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) hideToTray(win);
    return { ok: true };
  });

  ipcMain.handle(channels.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false };
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return { ok: true, maximized: win.isMaximized() };
  });

  ipcMain.handle(channels.WINDOW_CLOSE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
    return { ok: true };
  });

  ipcMain.handle(channels.WINDOW_IS_MAXIMIZED, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });

  ipcMain.handle(channels.GET_LICENSE_UPDATE, async () => {
    return licenseService.getCachedUpdate();
  });

  ipcMain.handle(channels.DOWNLOAD_UPDATE, async (event, downloadUrl, filename) => {
    return licenseService.downloadUpdate(downloadUrl, filename, event.sender);
  });

  ipcMain.handle(channels.INSTALL_UPDATE, async (_event, filename) => {
    return licenseService.installUpdate(filename);
  });

  ipcMain.handle(channels.CHECK_UPDATE_FILE, async (_event, filename) => {
    return licenseService.checkUpdateFile(filename);
  });
}

module.exports = { registerIpcHandlers };
