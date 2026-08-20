const { BrowserWindow, ipcMain } = require("electron");
const channels = require("../../shared/ipc/channels");
const licenseService = require("../services/license-service");
const projectService = require("../middleware/project-service");
const imageService = require("../middleware/image-service");
const exportService = require("../middleware/export-service");
const onnxDetectService = require("../middleware/onnx-detect-service");
const historyStore = require("../services/history-solutions-store");
const configurationStore = require("../services/configuration-store");
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
    log.debug("WINDOW_MINIMIZE");
    if (win) win.minimize();
    return { ok: true };
  });

  ipcMain.handle(channels.WINDOW_MAXIMIZE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false };
    const wasMaximized = win.isMaximized();
    if (wasMaximized) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    log.debug("WINDOW_MAXIMIZE", { maximized: win.isMaximized() });
    return { ok: true, maximized: win.isMaximized() };
  });

  ipcMain.handle(channels.WINDOW_CLOSE, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    log.debug("WINDOW_CLOSE");
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
    log.info("DOWNLOAD_UPDATE", { filename });
    return licenseService.downloadUpdate(downloadUrl, filename, event.sender);
  });

  ipcMain.handle(channels.INSTALL_UPDATE, async (_event, filename) => {
    log.info("INSTALL_UPDATE", { filename });
    return licenseService.installUpdate(filename);
  });

  ipcMain.handle(channels.CHECK_UPDATE_FILE, async (_event, filename) => {
    log.debug("CHECK_UPDATE_FILE", { filename });
    return licenseService.checkUpdateFile(filename);
  });

  ipcMain.handle(channels.SELECT_PROJECT_FOLDER, async (event) => {
    log.debug("SELECT_PROJECT_FOLDER");
    return projectService.selectProjectFolder(event.sender);
  });

  ipcMain.handle(channels.SELECT_PROJECT_FILE, async (event) => {
    log.debug("SELECT_PROJECT_FILE");
    return projectService.selectProjectFile(event.sender);
  });

  ipcMain.handle(channels.GET_SOLUTION_HISTORY, async () => {
    log.debug("GET_SOLUTION_HISTORY");
    return historyStore.readHistory();
  });

  ipcMain.handle(channels.GET_CONFIGURATION, async () => {
    log.debug("GET_CONFIGURATION");
    return configurationStore.readConfiguration();
  });

  ipcMain.handle(channels.UPDATE_CONFIGURATION, async (_event, patch) => {
    log.info("UPDATE_CONFIGURATION");
    return configurationStore.updateConfiguration(patch);
  });

  ipcMain.handle(channels.CREATE_PROJECT, async (_event, name, location, annotation) => {
    log.info("CREATE_PROJECT", {
      name,
      location,
      annotationType: annotation?.type,
      annotationMode: annotation?.mode,
    });
    return projectService.createProject(name, location, annotation);
  });

  ipcMain.handle(channels.SELECT_IMAGES_FOLDER, async (event, defaultPath) => {
    log.debug("SELECT_IMAGES_FOLDER");
    return projectService.selectImagesFolder(event.sender, defaultPath);
  });

  ipcMain.handle(channels.LIST_IMAGE_FOLDER, async (_event, folderPath) => {
    log.debug("LIST_IMAGE_FOLDER", { folderPath });
    return projectService.listImageFolder(folderPath);
  });

  ipcMain.handle(channels.LOAD_PROJECT, async (_event, filePath) => {
    log.info("LOAD_PROJECT", { filePath });
    return projectService.loadProject(filePath);
  });

  ipcMain.handle(channels.UPDATE_PROJECT, async (_event, filePath, patch) => {
    log.info("UPDATE_PROJECT", { filePath });
    return projectService.updateProject(filePath, patch);
  });

  ipcMain.handle(channels.ROTATE_IMAGE, async (_event, filePath) => {
    log.info("ROTATE_IMAGE", { filePath });
    return imageService.rotateImage(filePath);
  });

  ipcMain.handle(channels.CLOSE_PROJECT, async () => {
    log.info("CLOSE_PROJECT");
    return projectService.closeProject();
  });

  ipcMain.handle(channels.EXPORT_ANNOTATIONS, async (event, filePath, destFolder, mode) => {
    log.info("EXPORT_ANNOTATIONS", { destFolder, mode });
    return exportService.exportAnnotations(filePath, destFolder, mode, (progress) => {
      event.sender.send(channels.EXPORT_PROGRESS, progress);
    });
  });

  ipcMain.handle(channels.SELECT_OPEN_FILE, async (event, options) => {
    log.debug("SELECT_OPEN_FILE");
    return projectService.selectOpenFile(event.sender, options);
  });

  ipcMain.handle(channels.RUN_ONNX_DETECT, async (_event, imagePath, modelPath, labels) => {
    log.info("RUN_ONNX_DETECT");
    return onnxDetectService.runOnnxDetect(imagePath, modelPath, labels);
  });
}

module.exports = { registerIpcHandlers };
