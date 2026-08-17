(function () {
  if (!window.visionforge) return;

  const log = window.VisionForgeLogger?.create("splash") ?? { debug() {}, info() {}, warn() {}, error() {}, enter() { return Date.now(); }, exit() {} };

  const closeBtn = document.getElementById("splash-close-btn");
  const statusText = document.getElementById("splash-status-text");
  const spinner = document.querySelector(".splash-spinner");
  const versionLabel = document.getElementById("splash-version-label");
  const supportWebsite = document.getElementById("splash-support-website");

  const SUPPORT_WEBSITE_URL = "https://www.softasium.com";

  log.debug("splash.js init");

  async function loadVersionLabel() {
    const startedAt = log.enter("loadVersionLabel");
    try {
      const info = await window.visionforge.getAppInfo();
      if (!info || !versionLabel) return;
      const version = info.version || "—";
      const build =
        info.build != null && info.build !== "" ? ` (Build ${info.build})` : "";
      versionLabel.textContent = `Version v${version}${build}`;
      log.debug("version label set", { version: info.version, build: info.build });
    } catch (err) {
      log.error("failed to load app info", { error: String(err?.message || err) });
    } finally {
      log.exit("loadVersionLabel", startedAt);
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      log.info("splash close clicked");
      if (typeof window.visionforge.quitApp === "function") {
        window.visionforge.quitApp();
      }
    });
  }

  if (supportWebsite) {
    supportWebsite.addEventListener("click", () => {
      log.info("support website clicked", { url: SUPPORT_WEBSITE_URL });
      if (typeof window.visionforge.openExternalUrl === "function") {
        void window.visionforge.openExternalUrl(SUPPORT_WEBSITE_URL);
      }
    });
  }

  if (typeof window.visionforge.onSplashStatus === "function") {
    window.visionforge.onSplashStatus((payload) => {
      const text = typeof payload === "string" ? payload : payload && payload.text;
      const loading = typeof payload === "string" ? true : payload?.loading !== false;
      const denied = typeof payload === "object" && payload?.denied === true;

      log.debug("onSplashStatus", { text, loading, denied });

      if (statusText && typeof text === "string" && text) {
        statusText.textContent = text;
        statusText.classList.toggle("splash-status-text--denied", denied);
      }
      if (spinner) {
        spinner.classList.toggle("is-hidden", !loading);
      }
    });
  }

  loadVersionLabel();
})();
