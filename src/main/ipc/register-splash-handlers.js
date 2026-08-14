const { ipcMain, app, shell } = require("electron");
const channels = require("../../shared/ipc/channels");
const { buildAppInfo } = require("./app-info");
const { ipc: log, logFromRenderer } = require("../services/visionforge-logger");

let splashHandlersRegistered = false;

function registerSplashHandlers() {
  if (splashHandlersRegistered) return;
  splashHandlersRegistered = true;

  log.info("splash IPC handlers registered");

  ipcMain.handle(channels.GET_APP_INFO, async () => {
    log.debug("GET_APP_INFO");
    return buildAppInfo();
  });

  ipcMain.handle(channels.QUIT_APP, async () => {
    log.info("QUIT_APP");
    app.quit();
    return { ok: true };
  });

  ipcMain.handle(channels.OPEN_EXTERNAL_URL, async (_event, url) => {
    log.info("OPEN_EXTERNAL_URL", { url });
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return { ok: false };
    }
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.on(channels.SPLASH_LOG, (_event, payload) => {
    if (!payload || typeof payload !== "object") return;
    logFromRenderer(payload.level, payload.namespace, payload.message, payload.meta);
  });
}

module.exports = { registerSplashHandlers };
