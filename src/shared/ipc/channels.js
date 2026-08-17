/** IPC channel names — keep in sync if preload exposes invoke(). */
module.exports = {
  PING: "visionforge:ping",
  OPEN_DEVTOOLS: "visionforge:open-devtools",
  GET_APP_INFO: "visionforge:get-app-info",
  OPEN_EXTERNAL_URL: "visionforge:open-external-url",
  SPLASH_STATUS: "visionforge:splash-status",
  /** Splash renderer → main: `{ level, namespace, message, meta? }` */
  SPLASH_LOG: "visionforge:splash-log",
  QUIT_APP: "visionforge:quit-app",
  WINDOW_MINIMIZE: "visionforge:window-minimize",
  WINDOW_MAXIMIZE: "visionforge:window-maximize",
  WINDOW_CLOSE: "visionforge:window-close",
  WINDOW_IS_MAXIMIZED: "visionforge:window-is-maximized",
  LICENSE_UPDATE: "visionforge:license-update",
  GET_LICENSE_UPDATE: "visionforge:get-license-update",
  DOWNLOAD_UPDATE: "visionforge:download-update",
  LICENSE_DOWNLOAD_PROGRESS: "visionforge:license-download-progress",
  INSTALL_UPDATE: "visionforge:install-update",
  CHECK_UPDATE_FILE: "visionforge:check-update-file",
  SELECT_PROJECT_FOLDER: "visionforge:select-project-folder",
  CREATE_PROJECT: "visionforge:create-project",
};
