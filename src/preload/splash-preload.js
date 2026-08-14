const { contextBridge, ipcRenderer } = require("electron");

const CH = {
  GET_APP_INFO: "visionforge:get-app-info",
  SPLASH_STATUS: "visionforge:splash-status",
  SPLASH_LOG: "visionforge:splash-log",
  QUIT_APP: "visionforge:quit-app",
  OPEN_EXTERNAL_URL: "visionforge:open-external-url",
};

contextBridge.exposeInMainWorld("visionforge", {
  getAppInfo: () => ipcRenderer.invoke(CH.GET_APP_INFO),
  quitApp: () => ipcRenderer.invoke(CH.QUIT_APP),
  openExternalUrl: (url) => ipcRenderer.invoke(CH.OPEN_EXTERNAL_URL, url),
  log(level, namespace, message, meta) {
    ipcRenderer.send(CH.SPLASH_LOG, { level, namespace, message, meta });
  },
  onSplashStatus(callback) {
    const subscription = (_event, payload) => callback(payload);
    ipcRenderer.on(CH.SPLASH_STATUS, subscription);
    return () => ipcRenderer.removeListener(CH.SPLASH_STATUS, subscription);
  },
});
