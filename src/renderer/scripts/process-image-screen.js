(function () {
  const log =
    window.VisionForgeLogger?.create("process-image") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const screen = document.getElementById("process-image-screen");
  const previewEl = document.getElementById("process-image-preview");
  const canvas = document.getElementById("workspace-canvas");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorResizeHandle = document.getElementById("inspector-resize-handle");
  const backBtn = document.getElementById("btn-process-image-back");
  const modelInput = document.getElementById("process-image-model-path");
  const modelBrowseBtn = document.getElementById("btn-process-image-model-browse");
  const classesInput = document.getElementById("process-image-classes-path");
  const classesBrowseBtn = document.getElementById("btn-process-image-classes-browse");
  const processBtn = document.getElementById("btn-process-image-run");

  if (!screen) return;

  const MODEL_FILTERS = [{ name: "ONNX model", extensions: ["onnx"] }];
  const CLASSES_FILTERS = [{ name: "Text", extensions: ["txt"] }];

  let imagePath = "";

  log.debug("process-image-screen.js init");

  function isOpen() {
    return Boolean(screen && !screen.hidden);
  }

  function updateProcessEnabled() {
    if (!processBtn) return;
    const modelPath = modelInput?.value?.trim() || "";
    const classesPath = classesInput?.value?.trim() || "";
    processBtn.disabled = !(modelPath && classesPath);
  }

  function resetPaths() {
    if (modelInput) modelInput.value = "";
    if (classesInput) classesInput.value = "";
    updateProcessEnabled();
  }

  function setPreview(src, alt) {
    if (!previewEl) return;
    if (!src) {
      previewEl.removeAttribute("src");
      previewEl.alt = "";
      return;
    }
    previewEl.src = src;
    previewEl.alt = alt || "";
  }

  function openProcessImageScreen() {
    const startedAt = log.enter("openProcessImageScreen");
    const current = window.getCurrentWorkspaceImage?.();
    if (!current?.filePath || !current?.previewSrc) {
      log.warn("process image open ignored", { reason: "no-canvas-image" });
      log.exit("openProcessImageScreen", startedAt, { ok: false, reason: "no-canvas-image" });
      return;
    }

    window.stopWorkspacePlayback?.();
    imagePath = current.filePath;
    setPreview(current.previewSrc, current.name || "");
    if (canvas) canvas.hidden = true;
    if (inspectorPanel) inspectorPanel.hidden = true;
    if (inspectorResizeHandle) inspectorResizeHandle.hidden = true;
    screen.hidden = false;
    updateProcessEnabled();
    log.info("process image screen opened", { imagePath, name: current.name || "" });
    log.exit("openProcessImageScreen", startedAt, { ok: true });
  }

  function closeProcessImageScreen({ restoreWorkspace = true } = {}) {
    if (!isOpen()) {
      if (!restoreWorkspace) resetPaths();
      return;
    }
    const startedAt = log.enter("closeProcessImageScreen");
    screen.hidden = true;
    setPreview("");
    imagePath = "";
    if (restoreWorkspace && window.isWorkspaceOpen?.()) {
      if (canvas) canvas.hidden = false;
      if (inspectorPanel) inspectorPanel.hidden = false;
      if (inspectorResizeHandle) inspectorResizeHandle.hidden = false;
    }
    if (!restoreWorkspace) resetPaths();
    log.info("process image screen closed", { restoreWorkspace });
    log.exit("closeProcessImageScreen", startedAt, { restoreWorkspace });
  }

  async function pickPath({ title, filters, input }) {
    const startedAt = log.enter("pickPath");
    try {
      const result = await window.visionforge?.selectOpenFile?.({
        title,
        filters,
        defaultPath: input?.value?.trim() || "",
      });
      if (!result?.ok || result.canceled || !result.filePath) {
        log.exit("pickPath", startedAt, { canceled: true });
        return;
      }
      if (input) input.value = result.filePath;
      updateProcessEnabled();
      log.info("path selected", { title, filePath: result.filePath });
      log.exit("pickPath", startedAt, { ok: true });
    } catch (err) {
      log.error("pickPath failed", { title, error: String(err?.message || err) });
      log.exit("pickPath", startedAt, { error: true });
    }
  }

  function pickModel() {
    return pickPath({
      title: "Select ONNX model",
      filters: MODEL_FILTERS,
      input: modelInput,
    });
  }

  function pickClasses() {
    return pickPath({
      title: "Select classes.txt",
      filters: CLASSES_FILTERS,
      input: classesInput,
    });
  }

  function runProcess() {
    const modelPath = modelInput?.value?.trim() || "";
    const classesPath = classesInput?.value?.trim() || "";
    if (!modelPath || !classesPath) return;
    log.info("process requested", { imagePath, modelPath, classesPath });
  }

  backBtn?.addEventListener("click", () => {
    closeProcessImageScreen();
  });

  modelBrowseBtn?.addEventListener("click", () => {
    void pickModel();
  });
  modelInput?.addEventListener("click", () => {
    void pickModel();
  });

  classesBrowseBtn?.addEventListener("click", () => {
    void pickClasses();
  });
  classesInput?.addEventListener("click", () => {
    void pickClasses();
  });

  processBtn?.addEventListener("click", () => {
    runProcess();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!isOpen()) return;
    event.preventDefault();
    closeProcessImageScreen();
  });

  window.openProcessImageScreen = openProcessImageScreen;
  window.closeProcessImageScreen = closeProcessImageScreen;
  window.isProcessImageScreenOpen = isOpen;
})();
