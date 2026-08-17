const { contextBridge, ipcRenderer } = require("electron");

// Keep in sync with src/shared/ipc/channels.js (preload cannot reliably require() app files when sandbox is on).
const CH = {
  PING: "visionforge:ping",
  OPEN_DEVTOOLS: "visionforge:open-devtools",
  GET_APP_INFO: "visionforge:get-app-info",
  OPEN_EXTERNAL_URL: "visionforge:open-external-url",
  QUIT_APP: "visionforge:quit-app",
  WINDOW_MINIMIZE: "visionforge:window-minimize",
  WINDOW_MAXIMIZE: "visionforge:window-maximize",
  WINDOW_CLOSE: "visionforge:window-close",
  WINDOW_IS_MAXIMIZED: "visionforge:window-is-maximized",
  GET_LICENSE_UPDATE: "visionforge:get-license-update",
  DOWNLOAD_UPDATE: "visionforge:download-update",
  INSTALL_UPDATE: "visionforge:install-update",
  CHECK_UPDATE_FILE: "visionforge:check-update-file",
  LICENSE_UPDATE: "visionforge:license-update",
  LICENSE_DOWNLOAD_PROGRESS: "visionforge:license-download-progress",
  SELECT_PROJECT_FOLDER: "visionforge:select-project-folder",
  SELECT_PROJECT_FILE: "visionforge:select-project-file",
  GET_SOLUTION_HISTORY: "visionforge:get-solution-history",
  CREATE_PROJECT: "visionforge:create-project",
  SELECT_IMAGES_FOLDER: "visionforge:select-images-folder",
  LIST_IMAGE_FOLDER: "visionforge:list-image-folder",
  LOAD_PROJECT: "visionforge:load-project",
  UPDATE_PROJECT: "visionforge:update-project",
  ROTATE_IMAGE: "visionforge:rotate-image",
  SPLASH_LOG: "visionforge:splash-log",
};

contextBridge.exposeInMainWorld("visionforge", {
  ping: () => ipcRenderer.invoke(CH.PING),
  openDevTools: () => ipcRenderer.invoke(CH.OPEN_DEVTOOLS),
  getAppInfo: () => ipcRenderer.invoke(CH.GET_APP_INFO),
  openExternalUrl: (url) => ipcRenderer.invoke(CH.OPEN_EXTERNAL_URL, url),
  quitApp: () => ipcRenderer.invoke(CH.QUIT_APP),
  minimizeWindow: () => ipcRenderer.invoke(CH.WINDOW_MINIMIZE),
  maximizeWindow: () => ipcRenderer.invoke(CH.WINDOW_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(CH.WINDOW_CLOSE),
  isWindowMaximized: () => ipcRenderer.invoke(CH.WINDOW_IS_MAXIMIZED),
  getLicenseUpdate: () => ipcRenderer.invoke(CH.GET_LICENSE_UPDATE),
  downloadUpdate: (downloadUrl, filename) =>
    ipcRenderer.invoke(CH.DOWNLOAD_UPDATE, downloadUrl, filename),
  installUpdate: (filename) => ipcRenderer.invoke(CH.INSTALL_UPDATE, filename),
  checkUpdateFile: (filename) => ipcRenderer.invoke(CH.CHECK_UPDATE_FILE, filename),
  selectProjectFolder: () => ipcRenderer.invoke(CH.SELECT_PROJECT_FOLDER),
  openProjectFile: () => ipcRenderer.invoke(CH.SELECT_PROJECT_FILE),
  getSolutionHistory: () => ipcRenderer.invoke(CH.GET_SOLUTION_HISTORY),
  createProject: (name, location) => ipcRenderer.invoke(CH.CREATE_PROJECT, name, location),
  selectImagesFolder: (defaultPath) => ipcRenderer.invoke(CH.SELECT_IMAGES_FOLDER, defaultPath),
  listImageFolder: (folderPath) => ipcRenderer.invoke(CH.LIST_IMAGE_FOLDER, folderPath),
  loadProject: (filePath) => ipcRenderer.invoke(CH.LOAD_PROJECT, filePath),
  updateProject: (filePath, patch) => ipcRenderer.invoke(CH.UPDATE_PROJECT, filePath, patch),
  rotateImage: (filePath) => ipcRenderer.invoke(CH.ROTATE_IMAGE, filePath),
  log(level, namespace, message, meta) {
    ipcRenderer.send(CH.SPLASH_LOG, { level, namespace, message, meta });
  },
  onLicenseUpdate(callback) {
    const subscription = (_event, payload) => callback(payload);
    ipcRenderer.on(CH.LICENSE_UPDATE, subscription);
    return () => ipcRenderer.removeListener(CH.LICENSE_UPDATE, subscription);
  },
  onLicenseDownloadProgress(callback) {
    const subscription = (_event, payload) => callback(payload);
    ipcRenderer.on(CH.LICENSE_DOWNLOAD_PROGRESS, subscription);
    return () => ipcRenderer.removeListener(CH.LICENSE_DOWNLOAD_PROGRESS, subscription);
  },
});
