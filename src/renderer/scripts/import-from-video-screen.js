(function () {
  const log =
    window.VisionForgeLogger?.create("import-from-video") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const screen = document.getElementById("import-from-video-screen");
  const backBtn = document.getElementById("btn-import-from-video-back");
  const canvas = document.getElementById("workspace-canvas");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorResizeHandle = document.getElementById("inspector-resize-handle");

  if (!screen) return;

  log.debug("import-from-video-screen.js init");

  function isOpen() {
    return !screen.hidden;
  }

  function openImportFromVideoScreen() {
    const startedAt = log.enter("openImportFromVideoScreen");
    if (!window.isWorkspaceOpen?.()) {
      log.exit("openImportFromVideoScreen", startedAt, { ok: false, reason: "no-project" });
      return;
    }
    window.stopWorkspacePlayback?.();
    if (canvas) canvas.hidden = true;
    if (inspectorPanel) inspectorPanel.hidden = true;
    if (inspectorResizeHandle) inspectorResizeHandle.hidden = true;
    screen.hidden = false;
    log.info("import from video screen opened");
    log.exit("openImportFromVideoScreen", startedAt, { ok: true });
  }

  function closeImportFromVideoScreen({ restoreWorkspace = true } = {}) {
    if (!isOpen()) return;
    const startedAt = log.enter("closeImportFromVideoScreen");
    screen.hidden = true;
    if (restoreWorkspace && window.isWorkspaceOpen?.()) {
      if (canvas) canvas.hidden = false;
      if (inspectorPanel) inspectorPanel.hidden = false;
      if (inspectorResizeHandle) inspectorResizeHandle.hidden = false;
    }
    log.info("import from video screen closed", { restoreWorkspace });
    log.exit("closeImportFromVideoScreen", startedAt, { restoreWorkspace });
  }

  backBtn?.addEventListener("click", () => {
    closeImportFromVideoScreen();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (window.isSettingsOpen?.()) return;
    if (!isOpen()) return;
    event.preventDefault();
    closeImportFromVideoScreen();
  });

  window.openImportFromVideoScreen = openImportFromVideoScreen;
  window.closeImportFromVideoScreen = closeImportFromVideoScreen;
  window.isImportFromVideoScreenOpen = isOpen;
})();
