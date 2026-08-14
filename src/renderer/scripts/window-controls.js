(function () {
  const minimizeBtn = document.getElementById("window-minimize-btn");
  const maximizeBtn = document.getElementById("window-maximize-btn");
  const closeBtn = document.getElementById("window-close-btn");
  const chromeHeader = document.getElementById("app-chrome-header");
  const topbar = document.getElementById("app-topbar");

  const maximizeIcon = maximizeBtn?.querySelector("i");

  async function syncMaximizeIcon() {
    if (!maximizeIcon || !window.visionforge?.isWindowMaximized) return;
    const maximized = await window.visionforge.isWindowMaximized();
    maximizeIcon.className = maximized
      ? "fa-regular fa-window-restore"
      : "fa-regular fa-window-maximize";
    if (maximizeBtn) {
      maximizeBtn.setAttribute("aria-label", maximized ? "Restore" : "Maximize");
    }
  }

  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      window.visionforge.minimizeWindow();
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener("click", async () => {
      await window.visionforge.maximizeWindow();
      await syncMaximizeIcon();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.visionforge.closeWindow();
    });
  }

  const maximizeTarget = chromeHeader || topbar;
  if (maximizeTarget) {
    maximizeTarget.addEventListener("dblclick", async (event) => {
      if (event.target.closest("button, a, input, select, textarea")) return;
      await window.visionforge.maximizeWindow();
      await syncMaximizeIcon();
    });
  }

  window.addEventListener("resize", () => {
    syncMaximizeIcon();
  });

  syncMaximizeIcon();
})();
