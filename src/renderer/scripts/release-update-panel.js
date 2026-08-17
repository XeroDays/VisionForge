(function () {
  const log = window.VisionForgeLogger?.create("release") ?? { debug() {}, info() {}, warn() {}, error() {}, enter() { return Date.now(); }, exit() {} };

  const state = {
    payload: null,
    filename: null,
    installerExists: false,
    forceUpdate: false,
    downloading: false,
    mode: "download",
  };

  let unsubscribeProgress = null;
  let uiWired = false;

  function els() {
    return {
      btnNewRelease: document.getElementById("btn-new-release"),
      overlay: document.getElementById("release-overlay"),
      title: document.getElementById("release-title"),
      notes: document.getElementById("release-notes"),
      btnClose: document.getElementById("btn-release-close"),
      btnAction: document.getElementById("btn-release-download"),
      progress: document.getElementById("release-download-progress"),
      progressBar: document.getElementById("release-progress-bar"),
      percent: document.getElementById("release-download-percent"),
    };
  }

  function payloadField(payload, camelKey, pascalKey) {
    if (!payload) return undefined;
    const value = payload[camelKey] ?? payload[pascalKey];
    return value == null ? undefined : value;
  }

  function isForceUpdate(payload) {
    return payloadField(payload, "forceUpdate", "ForceUpdate") === true;
  }

  function setProgress(percent) {
    const { progressBar, percent: percentEl } = els();
    const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    if (progressBar) progressBar.style.width = `${value}%`;
    if (percentEl) percentEl.textContent = `${value}%`;
  }

  function setProgressVisible(visible, percent) {
    const { progress } = els();
    if (progress) progress.hidden = !visible;
    if (visible) setProgress(percent ?? 0);
  }

  function setActionMode(mode) {
    const { btnAction } = els();
    state.mode = mode;
    if (!btnAction) return;

    if (mode === "downloading") {
      btnAction.hidden = true;
      setProgressVisible(true, 0);
      return;
    }

    setProgressVisible(false);
    btnAction.hidden = false;
    btnAction.disabled = false;
    btnAction.textContent = mode === "install" ? "Install Now" : "Download Now";
    btnAction.dataset.mode = mode;
  }

  function applyForceChrome(force) {
    state.forceUpdate = force;
    const { overlay } = els();
    if (overlay) overlay.classList.toggle("is-force-update", force);
  }

  async function quitApplication() {
    try {
      await window.visionforge?.quitApp?.();
    } catch (err) {
      log.error("quitApp failed", { error: String(err?.message || err) });
    }
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
    const { title, notes } = els();
    if (title) title.textContent = formatReleaseTitle(payload);

    if (notes) {
      const raw = payloadField(payload, "releaseNotes", "ReleaseNotes");
      const text = raw != null ? String(raw) : "No release notes provided.";
      notes.textContent = text;
    }
  }

  async function refreshInstallerState() {
    if (!state.filename) {
      setActionMode("download");
      return;
    }

    try {
      const result = await window.visionforge?.checkUpdateFile?.(state.filename);
      state.filename = result?.filename || state.filename;
      state.installerExists = !!(result && result.installerExists);
      if (!state.downloading) {
        setActionMode(state.installerExists ? "install" : "download");
      }
    } catch (err) {
      log.error("checkUpdateFile failed", { error: String(err?.message || err) });
      state.installerExists = false;
      setActionMode("download");
    }
  }

  function closeReleaseModal() {
    if (state.forceUpdate) return;
    const { overlay } = els();
    if (overlay) overlay.hidden = true;
  }

  async function openReleaseModal() {
    if (!state.payload) return;

    const { overlay } = els();
    if (!overlay) return;

    fillModalFromPayload(state.payload);
    applyForceChrome(isForceUpdate(state.payload));

    if (!state.downloading) {
      await refreshInstallerState();
    }

    overlay.hidden = false;
  }

  async function startDownload() {
    if (!state.payload || state.downloading) return;

    const url = payloadField(state.payload, "downloadUrl", "DownloadUrl");
    if (!url) {
      log.error("download URL missing from license server");
      return;
    }

    log.info("download started", { filename: state.filename });

    state.downloading = true;
    setActionMode("downloading");

    unsubscribeProgress?.();
    unsubscribeProgress = window.visionforge?.onLicenseDownloadProgress?.((data) => {
      setProgressVisible(true, data?.percent ?? 0);
    }) ?? null;

    try {
      const result = await window.visionforge?.downloadUpdate?.(url, state.filename);

      if (!result?.ok) {
        throw new Error(result?.error || result?.reason || "Download failed.");
      }

      state.filename = result.filename || state.filename;
      state.installerExists = true;
      log.info("download completed", { filename: state.filename });
      setActionMode("install");
    } catch (err) {
      log.error("download failed", { error: String(err?.message || err) });
      setActionMode("download");
    } finally {
      unsubscribeProgress?.();
      unsubscribeProgress = null;
      state.downloading = false;
    }
  }

  async function startInstall() {
    if (!state.filename) {
      await refreshInstallerState();
      if (!state.filename) {
        log.error("installer file not found in Downloads");
        return;
      }
    }

    log.info("install started", { filename: state.filename });

    const { btnAction } = els();
    if (btnAction) btnAction.disabled = true;

    try {
      const result = await window.visionforge?.installUpdate?.(state.filename);
      if (!result?.ok) {
        throw new Error(result?.error || result?.reason || "Install failed.");
      }
    } catch (err) {
      log.error("install failed", { error: String(err?.message || err) });
      if (btnAction) btnAction.disabled = false;
    }
  }

  async function onActionClick() {
    if (state.mode === "install") {
      await startInstall();
      return;
    }
    await startDownload();
  }

  function wireReleaseUiOnce() {
    if (uiWired) return;
    uiWired = true;

    const { btnNewRelease, overlay, btnClose, btnAction } = els();

    btnNewRelease?.addEventListener("click", () => {
      openReleaseModal();
    });

    btnClose?.addEventListener("click", () => {
      if (state.forceUpdate) {
        void quitApplication();
        return;
      }
      closeReleaseModal();
    });

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay && !state.forceUpdate) {
        closeReleaseModal();
      }
    });

    btnAction?.addEventListener("click", () => {
      onActionClick();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!overlay || overlay.hidden || state.forceUpdate) return;
      closeReleaseModal();
    });
  }

  function applyLicenseResult(result) {
    const { btnNewRelease, overlay } = els();

    if (!result || !result.updateAvailable || !result.payload) {
      if (btnNewRelease) btnNewRelease.hidden = true;
      state.payload = null;
      state.filename = null;
      state.installerExists = false;
      if (overlay && !overlay.hidden && !state.forceUpdate) {
        overlay.hidden = true;
      }
      return;
    }

    state.payload = result.payload;
    state.filename = result.filename || null;
    state.installerExists = !!result.installerExists;

    if (btnNewRelease) btnNewRelease.hidden = false;

    log.info("update available", {
      latestVersion: payloadField(result.payload, "latestVersion", "LatestVersion"),
      forceUpdate: isForceUpdate(result.payload),
    });

    if (isForceUpdate(result.payload)) {
      openReleaseModal();
    }
  }

  async function initReleaseUpdate() {
    log.debug("initReleaseUpdate");
    wireReleaseUiOnce();

    if (typeof window.visionforge?.onLicenseUpdate === "function") {
      window.visionforge.onLicenseUpdate((result) => applyLicenseResult(result));
    }

    try {
      const result = await window.visionforge?.getLicenseUpdate?.();
      applyLicenseResult(result);
    } catch (err) {
      log.error("initReleaseUpdate failed", { error: String(err?.message || err) });
      const { btnNewRelease } = els();
      if (btnNewRelease) btnNewRelease.hidden = true;
    }
  }

  window.initReleaseUpdate = initReleaseUpdate;
})();
