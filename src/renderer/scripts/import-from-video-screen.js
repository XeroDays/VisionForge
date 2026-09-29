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

  const VIDEO_FILTERS = [{ name: "Video", extensions: ["mp4", "m4v", "webm"] }];

  const screen = document.getElementById("import-from-video-screen");
  const backBtn = document.getElementById("btn-import-from-video-back");
  const browseBtn = document.getElementById("btn-import-video-browse");
  const processBtn = document.getElementById("btn-import-video-process");
  const importBtn = document.getElementById("btn-import-video-import");
  const pathInput = document.getElementById("import-video-path");
  const jumpInput = document.getElementById("import-video-jump");
  const statusEl = document.getElementById("import-video-status");
  const emptyEl = document.getElementById("import-video-empty");
  const gridEl = document.getElementById("import-video-grid");
  const canvas = document.getElementById("workspace-canvas");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorResizeHandle = document.getElementById("inspector-resize-handle");

  if (!screen) return;

  log.debug("import-from-video-screen.js init");

  let videoPath = "";
  let frames = [];
  const selected = new Set();
  let busy = false;

  function isOpen() {
    return !screen.hidden;
  }

  function frameJump() {
    const n = Math.round(Number(jumpInput?.value));
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  }

  function snapFrameJump() {
    const next = frameJump();
    if (jumpInput) jumpInput.value = String(next);
    return next;
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    const text = String(message || "");
    statusEl.hidden = !text;
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", Boolean(isError && text));
  }

  function updateActions() {
    if (processBtn) processBtn.disabled = busy || !videoPath;
    if (browseBtn) browseBtn.disabled = busy;
    if (jumpInput) jumpInput.disabled = busy;
    if (importBtn) {
      importBtn.hidden = selected.size < 2;
      importBtn.disabled = busy;
    }
  }

  function previewSrc(filePath) {
    return `vfimg://local/?p=${encodeURIComponent(filePath)}`;
  }

  function renderGrid() {
    if (!gridEl || !emptyEl) return;
    gridEl.replaceChildren();
    if (!frames.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = "No frames yet";
      gridEl.hidden = true;
      updateActions();
      return;
    }
    emptyEl.hidden = true;
    gridEl.hidden = false;
    frames.forEach((file) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "import-video-grid__item";
      if (selected.has(file.filePath)) button.classList.add("is-selected");
      button.title = file.name;
      const img = document.createElement("img");
      img.className = "import-video-grid__thumb";
      img.alt = "";
      img.draggable = false;
      img.src = previewSrc(file.filePath);
      const name = document.createElement("span");
      name.className = "import-video-grid__name";
      name.textContent = file.name;
      button.append(img, name);
      button.addEventListener("click", () => {
        if (selected.has(file.filePath)) selected.delete(file.filePath);
        else selected.add(file.filePath);
        button.classList.toggle("is-selected", selected.has(file.filePath));
        updateActions();
      });
      gridEl.appendChild(button);
    });
    updateActions();
  }

  function clearFrames() {
    frames = [];
    selected.clear();
    renderGrid();
  }

  async function browseVideo() {
    if (busy) return;
    const startedAt = log.enter("browseVideo");
    try {
      const result = await window.visionforge?.selectOpenFile?.({
        title: "Select video",
        filters: VIDEO_FILTERS,
        defaultPath: videoPath,
      });
      if (!result?.ok || result.canceled || !result.filePath) {
        log.exit("browseVideo", startedAt, { canceled: true });
        return;
      }
      videoPath = result.filePath;
      if (pathInput) pathInput.value = videoPath;
      updateActions();
      log.exit("browseVideo", startedAt, { ok: true });
    } catch (err) {
      log.error("browseVideo failed", { error: String(err?.message || err) });
      log.exit("browseVideo", startedAt, { error: true });
    }
  }

  async function processVideo() {
    if (busy || !videoPath) return;
    const jump = snapFrameJump();
    const startedAt = log.enter("processVideo");
    busy = true;
    updateActions();
    setStatus("Extracting frames…");
    clearFrames();
    try {
      const result = await window.visionforge?.extractVideoFrames?.(videoPath, jump);
      if (!result?.ok) {
        const message =
          result?.reason === "missing-ffmpeg"
            ? "Frame extraction is unavailable."
            : result?.reason === "unsupported-type"
              ? "Choose an MP4, M4V, or WebM file."
              : "Could not extract frames.";
        setStatus(message, true);
        log.exit("processVideo", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      frames = Array.isArray(result.files) ? result.files : [];
      selected.clear();
      renderGrid();
      setStatus("");
      log.info("video frames extracted", { count: frames.length, jump });
      log.exit("processVideo", startedAt, { ok: true, count: frames.length });
    } catch (err) {
      setStatus("Could not extract frames.", true);
      log.error("processVideo failed", { error: String(err?.message || err) });
      log.exit("processVideo", startedAt, { error: true });
    } finally {
      busy = false;
      updateActions();
    }
  }

  async function importSelected() {
    if (busy || selected.size < 2) return;
    const paths = frames.filter((file) => selected.has(file.filePath)).map((file) => file.filePath);
    const startedAt = log.enter("importSelected");
    busy = true;
    updateActions();
    try {
      const result = await window.importWorkspaceImages?.(paths);
      if (!result?.ok) {
        log.exit("importSelected", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      log.info("video frames imported", { count: paths.length, copied: result.copied });
      log.exit("importSelected", startedAt, { ok: true, count: paths.length });
    } catch (err) {
      log.error("importSelected failed", { error: String(err?.message || err) });
      log.exit("importSelected", startedAt, { error: true });
    } finally {
      busy = false;
      updateActions();
    }
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
    if (pathInput) pathInput.value = videoPath;
    if (jumpInput && !jumpInput.value) jumpInput.value = "1";
    screen.hidden = false;
    updateActions();
    log.info("import from video screen opened");
    log.exit("openImportFromVideoScreen", startedAt, { ok: true });
  }

  function closeImportFromVideoScreen({ restoreWorkspace = true } = {}) {
    if (!isOpen()) return;
    const startedAt = log.enter("closeImportFromVideoScreen");
    screen.hidden = true;
    void window.visionforge?.extractVideoFrames?.("", 0);
    if (restoreWorkspace && window.isWorkspaceOpen?.()) {
      if (canvas) canvas.hidden = false;
      if (inspectorPanel) inspectorPanel.hidden = false;
      if (inspectorResizeHandle) inspectorResizeHandle.hidden = false;
    }
    log.info("import from video screen closed", { restoreWorkspace });
    log.exit("closeImportFromVideoScreen", startedAt, { restoreWorkspace });
  }

  browseBtn?.addEventListener("click", () => {
    void browseVideo();
  });
  processBtn?.addEventListener("click", () => {
    void processVideo();
  });
  importBtn?.addEventListener("click", () => {
    void importSelected();
  });
  jumpInput?.addEventListener("change", () => {
    snapFrameJump();
  });
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

  updateActions();
  window.openImportFromVideoScreen = openImportFromVideoScreen;
  window.closeImportFromVideoScreen = closeImportFromVideoScreen;
  window.isImportFromVideoScreenOpen = isOpen;
})();
