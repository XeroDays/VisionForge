(function () {
  const log =
    window.VisionForgeLogger?.create("about-dialog") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
    };

  const SUPPORT_WEBSITE_URL = "https://www.softasium.com";

  const overlay = document.getElementById("about-overlay");
  const versionEl = document.getElementById("about-version");
  const closeBtn = document.getElementById("btn-about-close");
  const okBtn = document.getElementById("btn-about-ok");
  const websiteBtn = document.getElementById("btn-about-website");

  let infoLoaded = false;

  function isOpen() {
    return Boolean(overlay && !overlay.hidden);
  }

  async function loadInfo() {
    if (infoLoaded || !versionEl) return;
    try {
      const info = await window.visionforge?.getAppInfo?.();
      if (!info) return;
      const build = info.build != null && info.build !== "" ? ` (Build ${info.build})` : "";
      versionEl.textContent = `Version v${info.version || "—"}${build} · Electron ${info.electron || "—"}`;
      infoLoaded = true;
    } catch (err) {
      log.error("failed to load app info", { error: String(err?.message || err) });
    }
  }

  function open() {
    if (!overlay) return;
    void loadInfo();
    overlay.hidden = false;
    okBtn?.focus();
    log.debug("about dialog opened");
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
  }

  closeBtn?.addEventListener("click", close);
  okBtn?.addEventListener("click", close);
  websiteBtn?.addEventListener("click", () => {
    void window.visionforge?.openExternalUrl?.(SUPPORT_WEBSITE_URL);
  });
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      close();
    }
  });

  window.openAboutDialog = open;
  window.closeAboutDialog = close;
  window.isAboutDialogOpen = isOpen;
})();
