const { app, Menu, BrowserWindow } = require("electron");
const { startup: log, initFileLogging } = require("./services/visionforge-logger");
const imageProtocol = require("./services/image-protocol");
const { createSplashWindow } = require("./windows/splash-window");
const { registerSplashHandlers } = require("./ipc/register-splash-handlers");
const channels = require("../shared/ipc/channels");

imageProtocol.registerPrivilegedScheme();

if (process.platform === "win32" && app.isPackaged) {
  app.setAppUserModelId("com.visionforge.app");
}

function sendSplashStatus(splash, text, options = {}) {
  if (splash && !splash.isDestroyed() && splash.webContents && !splash.webContents.isDestroyed()) {
    const loading = options.loading !== false;
    const denied = options.denied === true;
    splash.webContents.send(channels.SPLASH_STATUS, { text, loading, denied });
  }
}

function waitForWebContentsLoad(win) {
  if (win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()) {
    return Promise.resolve();
  }
  if (!win.webContents.isLoading()) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    win.webContents.once("did-finish-load", resolve);
  });
}

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function loadHeavyModules() {
  return new Promise((resolve) => {
    setImmediate(() => {
      const { registerIpcHandlers } = require("./ipc/register");
      const { createMainWindow } = require("./windows/main-window");
      const { getAppIcon } = require("./helpers/app-icon");
      registerIpcHandlers();
      resolve({
        createMainWindow,
        getAppIcon,
      });
    });
  });
}

function getMainWindow() {
  const windows = BrowserWindow.getAllWindows().filter((w) => {
    if (w.isDestroyed()) return false;
    const url = w.webContents?.getURL?.() ?? "";
    return !url.includes("splash.html");
  });
  return windows.length > 0 ? windows[0] : null;
}

async function bootstrap() {
  initFileLogging();
  const bootstrapStartedAt = log.enter("bootstrap");

  let handlersStartedAt = log.enter("registerSplashHandlers");
  registerSplashHandlers();
  log.exit("registerSplashHandlers", handlersStartedAt);

  let splashCreateStartedAt = log.enter("createSplashWindow");
  const splash = createSplashWindow();
  log.exit("createSplashWindow", splashCreateStartedAt);

  if (!splash.isDestroyed()) {
    splash.show();
    log.mark("splash.show");
  }

  await yieldToEventLoop();
  sendSplashStatus(splash, "Starting…");
  log.mark('sendSplashStatus "Starting…"');

  const licenseService = require("./services/license-service");
  const prefetchPromise = licenseService.prefetchRegistrationData();

  let heavyStartedAt = log.enter("loadHeavyModules");
  const { createMainWindow, getAppIcon } = await loadHeavyModules();
  log.exit("loadHeavyModules", heavyStartedAt);

  const icon = getAppIcon();
  if (icon && typeof app.setIcon === "function") {
    app.setIcon(icon);
    log.mark("app.setIcon");
  }

  const main = createMainWindow();

  sendSplashStatus(splash, "Checking for updates…");
  log.mark('sendSplashStatus "Checking for updates…"');

  log.mark("Promise.all: license.register + main did-finish-load");

  const [licenseResult] = await Promise.all([
    (async () => {
      await prefetchPromise;
      const registerStartedAt = log.enter("licenseService.register");
      const result = await licenseService.register();
      log.exit("licenseService.register", registerStartedAt, {
        accessGranted: result.accessGranted,
        fromCache: result.fromCache,
        updateAvailable: result.updateAvailable,
        localBuild: result.localBuild,
        remoteBuild: result.remoteBuild,
        forceUpdate: result.forceUpdate,
      });
      return result;
    })(),
    (async () => {
      const mainLoadStartedAt = log.enter("waitForWebContentsLoad(main)");
      await waitForWebContentsLoad(main);
      log.exit("waitForWebContentsLoad(main)", mainLoadStartedAt);
    })(),
  ]);

  if (!licenseResult.accessGranted) {
    log.warn("access denied — staying on splash", {
      fromCache: licenseResult.fromCache,
      error: licenseResult.error || null,
    });
    sendSplashStatus(splash, "Access denied, please contact customer service.", {
      loading: false,
      denied: true,
    });
    if (!main.isDestroyed()) main.destroy();
    log.exit("bootstrap", bootstrapStartedAt, { outcome: "access-denied" });
    return;
  }

  sendSplashStatus(splash, "Loading workspace…");
  log.mark('sendSplashStatus "Loading workspace…"');

  if (!main.isDestroyed() && main.webContents && !main.webContents.isDestroyed()) {
    main.webContents.send(channels.LICENSE_UPDATE, licenseResult);
    log.mark("LICENSE_UPDATE sent to main renderer", {
      updateAvailable: licenseResult.updateAvailable,
      localBuild: licenseResult.localBuild,
      remoteBuild: licenseResult.remoteBuild,
      forceUpdate: licenseResult.forceUpdate,
    });
  }

  if (!splash.isDestroyed()) {
    splash.close();
    log.mark("splash.close");
  }

  if (!main.isDestroyed()) {
    main.maximize();
    main.show();
    main.focus();
    log.mark("main.maximize + show + focus");
  }

  log.exit("bootstrap", bootstrapStartedAt, { outcome: "success" });
}

app.whenReady().then(() => {
  log.mark("app.whenReady");
  imageProtocol.registerHandler();
  Menu.setApplicationMenu(null);
  bootstrap();

  app.on("activate", () => {
    const mainWin = getMainWindow();
    if (!mainWin) {
      bootstrap();
    } else if (!mainWin.isDestroyed()) {
      mainWin.show();
      mainWin.focus();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
