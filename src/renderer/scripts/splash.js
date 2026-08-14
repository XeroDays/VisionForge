(function () {
  if (!window.visionforge) return;

  const closeBtn = document.getElementById("splash-close-btn");
  const statusText = document.getElementById("splash-status-text");
  const spinner = document.querySelector(".splash-spinner");
  const versionLabel = document.getElementById("splash-version-label");
  const supportWebsite = document.getElementById("splash-support-website");

  const SUPPORT_WEBSITE_URL = "https://www.softasium.com";

  async function loadVersionLabel() {
    try {
      const info = await window.visionforge.getAppInfo();
      if (!info || !versionLabel) return;
      const version = info.version || "—";
      const build =
        info.build != null && info.build !== "" ? ` (Build ${info.build})` : "";
      versionLabel.textContent = `Version v${version}${build}`;
    } catch (err) {
      console.error("[splash] failed to load app info", err);
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      if (typeof window.visionforge.quitApp === "function") {
        window.visionforge.quitApp();
      }
    });
  }

  if (supportWebsite) {
    supportWebsite.addEventListener("click", () => {
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
