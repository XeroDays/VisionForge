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
      const licenseService = require("./services/license-service");
      const { getAppIcon } = require("./helpers/app-icon");
      const { createTray, destroyTray, showFromTray } = require("./helpers/tray");
      registerIpcHandlers();
      resolve({
        createMainWindow,
        licenseService,
        getAppIcon,
        createTray,
        destroyTray,
        showFromTray,
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

function showAppWindow(deps) {
  let win = getMainWindow();
  if (!win || win.isDestroyed()) {
    win = deps.createMainWindow();
  }
  deps.showFromTray(win);
  if (!win.isMaximized()) {
    win.maximize();
  }
}

function quitApp(deps) {
  deps.destroyTray();
  app.quit();
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

  const splashLoadStartedAt = log.enter("waitForWebContentsLoad(splash)");
  await waitForWebContentsLoad(splash);
  log.exit("waitForWebContentsLoad(splash)", splashLoadStartedAt);

  if (!splash.isDestroyed()) {
    splash.show();
    log.mark("splash.show");
  }

  await yieldToEventLoop();
  await yieldToEventLoop();

  sendSplashStatus(splash, "Starting…");
  log.mark('sendSplashStatus "Starting..."');
  await yieldToEventLoop();

  let heavyStartedAt = log.enter("loadHeavyModules");
  const deps = await loadHeavyModules();
  log.exit("loadHeavyModules", heavyStartedAt);

  const icon = deps.getAppIcon();
  if (icon && typeof app.setIcon === "function") {
    app.setIcon(icon);
    log.mark("app.setIcon");
  }

  const main = deps.createMainWindow();

  log.mark("Promise.all: license.register + main did-finish-load");

  const [licenseResult] = await Promise.all([
    (async () => {
      sendSplashStatus(splash, "Checking for updates…");
      log.mark('sendSplashStatus "Checking for updates..."');
      const registerStartedAt = log.enter("licenseService.register");
      const result = await deps.licenseService.register();
      log.exit("licenseService.register", registerStartedAt, {
        accessGranted: result.accessGranted,
        fromCache: result.fromCache,
        updateAvailable: result.updateAvailable,
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
  log.mark('sendSplashStatus "Loading workspace..."');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (!main.isDestroyed() && main.webContents && !main.webContents.isDestroyed()) {
    main.webContents.send(channels.LICENSE_UPDATE, licenseResult);
    log.mark("LICENSE_UPDATE sent to main renderer");
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

  deps.createTray({
    onShow: () => showAppWindow(deps),
    onQuit: () => quitApp(deps),
  });
  log.mark("tray.create");

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

app.on("before-quit", () => {
  try {
    const { destroyTray } = require("./helpers/tray");
    destroyTray();
  } catch {
    // ignore if tray not initialized
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
