(function () {
  const log = window.VisionForgeLogger?.create("window-controls") ?? { debug() {}, info() {}, warn() {}, error() {}, enter() { return Date.now(); }, exit() {} };

  const minimizeBtn = document.getElementById("window-minimize-btn");
  const maximizeBtn = document.getElementById("window-maximize-btn");
  const closeBtn = document.getElementById("window-close-btn");
  const chromeHeader = document.getElementById("app-chrome-header");
  const topbar = document.getElementById("app-topbar");

  const maximizeIcon = maximizeBtn?.querySelector("i");

  log.debug("window-controls.js init");

  async function syncMaximizeIcon() {
    if (!maximizeIcon || !window.visionforge?.isWindowMaximized) return;
    const maximized = await window.visionforge.isWindowMaximized();
    maximizeIcon.className = maximized
      ? "fa-regular fa-window-restore"
      : "fa-regular fa-window-maximize";
    if (maximizeBtn) {
      maximizeBtn.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
    }
    log.debug("syncMaximizeIcon", { maximized });
  }

  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      log.info("minimize clicked");
      window.visionforge.minimizeWindow();
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener("click", async () => {
      log.info("maximize clicked");
      await window.visionforge.maximizeWindow();
      await syncMaximizeIcon();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      log.info("close clicked");
      window.visionforge.closeWindow();
    });
  }

  const maximizeTarget = chromeHeader || topbar;
  if (maximizeTarget) {
    maximizeTarget.addEventListener("dblclick", async (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      log.info("titlebar dblclick maximize");
      await window.visionforge.maximizeWindow();
      await syncMaximizeIcon();
    });
  }

  window.addEventListener("resize", () => {
    syncMaximizeIcon();
  });

  syncMaximizeIcon();
})();
