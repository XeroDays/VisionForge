(function () {
  if (!window.visionforge) return;

  const log =
    window.VisionForgeLogger?.create("release") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const newReleaseBtn = document.getElementById("btn-new-release");
  const modal = document.getElementById("release-overlay");
  const closeBtn = document.getElementById("btn-release-close");
  const titleEl = document.getElementById("release-title");
  const notesEl = document.getElementById("release-notes");
  const progressWrap = document.getElementById("release-download-progress");
  const progressBar = document.getElementById("release-progress-bar");
  const progressText = document.getElementById("release-download-percent");
  const actionBtn = document.getElementById("btn-release-download");

  const state = {
    payload: null,
    filename: null,
    installerExists: false,
    forceUpdate: false,
    downloading: false,
    mode: "download",
  };

  function payloadField(payload, camelKey, pascalKey) {
    if (!payload) return undefined;
    const value = payload[camelKey] ?? payload[pascalKey];
    return value == null ? undefined : value;
  }

  function isForceUpdate(payload) {
    return payloadField(payload, "forceUpdate", "ForceUpdate") === true;
  }

  function applyForceChrome(force) {
    state.forceUpdate = force;
    if (modal) {
      modal.classList.toggle("is-force-update", force);
    }
    if (closeBtn) {
      closeBtn.hidden = force;
    }
  }

  function setActionMode(mode) {
    state.mode = mode;
    if (!actionBtn) return;
    actionBtn.hidden = false;
    actionBtn.disabled = false;
    actionBtn.textContent = mode === "install" ? "Install Now" : "Download Now";
  }

  function setProgressVisible(visible, percent) {
    if (!progressWrap) return;
    progressWrap.hidden = !visible;
    const value = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
    if (progressBar) progressBar.style.width = `${value}%`;
    if (progressText) progressText.textContent = `${Math.round(value)}%`;
  }

  function formatReleaseTitle(payload) {
    const latest = payloadField(payload, "latestVersion", "LatestVersion");
    const build = payloadField(payload, "buildVersion", "BuildVersion");

    if (latest == null || latest === "") {
      return "New Release";
    }

    const versionText = `Version ${String(latest)}`;
    if (build != null && build !== "" && Number.isFinite(Number(build))) {
      return `${versionText} (Build ${Number(build)})`;
    }

    return versionText;
  }

  function fillModalFromPayload(payload) {
    if (titleEl) titleEl.textContent = formatReleaseTitle(payload);
    if (notesEl) {
      const notes = payloadField(payload, "releaseNotes", "ReleaseNotes");
      notesEl.textContent = notes != null ? String(notes) : "No release notes provided.";
    }
  }

  async function refreshInstallerState() {
    if (!window.visionforge.checkUpdateFile) return;
    const result = await window.visionforge.checkUpdateFile(state.filename);
    state.filename = result?.filename || state.filename;
    state.installerExists = !!(result && result.installerExists);
    if (!state.downloading) {
      setActionMode(state.installerExists ? "install" : "download");
      setProgressVisible(false);
    }
  }

  async function openModal() {
    if (!modal || !state.payload) return;
    fillModalFromPayload(state.payload);
    applyForceChrome(isForceUpdate(state.payload));
    await refreshInstallerState();
    modal.hidden = false;
  }

  function closeModal() {
    if (state.forceUpdate) return;
    if (modal) modal.hidden = true;
  }

  function applyLicenseResult(result) {
    if (!result || !result.updateAvailable || !result.payload) {
      if (newReleaseBtn) newReleaseBtn.hidden = true;
      state.payload = null;
      state.filename = null;
      state.installerExists = false;
      if (modal && !modal.hidden && !state.forceUpdate) {
        modal.hidden = true;
      }
      return;
    }

    state.payload = result.payload;
    state.filename = result.filename || null;
    state.installerExists = !!result.installerExists;

    if (newReleaseBtn) newReleaseBtn.hidden = false;

    const force = isForceUpdate(result.payload);
    applyForceChrome(force);

    log.info("update available", {
      latestVersion: payloadField(result.payload, "latestVersion", "LatestVersion"),
      forceUpdate: force,
    });

    if (force) {
      void openModal();
    }
  }

  if (newReleaseBtn) {
    newReleaseBtn.addEventListener("click", () => {
      void openModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeModal());
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal && !state.forceUpdate) {
        closeModal();
      }
    });
  }

  if (actionBtn) {
    actionBtn.addEventListener("click", async () => {
      if (!state.payload || state.downloading) return;

      if (state.mode === "install") {
        actionBtn.disabled = true;
        try {
          const result = await window.visionforge.installUpdate(state.filename);
          if (!result || !result.ok) {
            log.error("install failed", { result });
            actionBtn.disabled = false;
          }
        } catch (err) {
          log.error("install error", { error: String(err.message || err) });
          actionBtn.disabled = false;
        }
        return;
      }

      const url = payloadField(state.payload, "downloadUrl", "DownloadUrl");
      if (!url) return;

      state.downloading = true;
      actionBtn.hidden = true;
      setProgressVisible(true, 0);

      try {
        const result = await window.visionforge.downloadUpdate(url, state.filename);
        if (result && result.ok) {
          state.filename = result.filename || state.filename;
          state.installerExists = true;
          setProgressVisible(false);
          setActionMode("install");
        } else {
          log.error("download failed", { result });
          setProgressVisible(false);
          setActionMode("download");
        }
      } catch (err) {
        log.error("download error", { error: String(err.message || err) });
        setProgressVisible(false);
        setActionMode("download");
      } finally {
        state.downloading = false;
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!modal || modal.hidden || state.forceUpdate) return;
    closeModal();
  });

  if (typeof window.visionforge.onLicenseDownloadProgress === "function") {
    window.visionforge.onLicenseDownloadProgress((progress) => {
      if (!progress) return;
      const percent = Number(progress.percent);
      setProgressVisible(true, Number.isFinite(percent) ? percent : 0);
    });
  }

  if (typeof window.visionforge.onLicenseUpdate === "function") {
    window.visionforge.onLicenseUpdate((result) => applyLicenseResult(result));
  }

  if (typeof window.visionforge.getLicenseUpdate === "function") {
    window.visionforge.getLicenseUpdate().then((result) => applyLicenseResult(result)).catch(() => {});
  }

  window.isForceUpdateActive = function isForceUpdateActive() {
    return state.forceUpdate === true;
  };

  window.openReleaseUpdateModal = function openReleaseUpdateModal() {
    void openModal();
  };

  window.blockIfForceUpdate = function blockIfForceUpdate() {
    if (state.forceUpdate !== true) return false;
    void openModal();
    return true;
  };
})();
