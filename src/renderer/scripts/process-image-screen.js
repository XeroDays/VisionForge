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

  const GOLDEN_ANGLE = 137.508;
  const screen = document.getElementById("process-image-screen");
  const paneEl = document.getElementById("process-image-pane");
  const stageEl = document.getElementById("process-image-stage");
  const previewEl = document.getElementById("process-image-preview");
  const overlayEl = document.getElementById("process-image-overlay");
  const canvas = document.getElementById("workspace-canvas");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorResizeHandle = document.getElementById("inspector-resize-handle");
  const backBtn = document.getElementById("btn-process-image-back");
  const processBtn = document.getElementById("btn-process-image-run");
  const statusEl = document.getElementById("process-image-status");
  const detectionsEmpty = document.getElementById("process-detections-empty");
  const detectionsList = document.getElementById("process-detections-list");
  const tabButtons = Array.from(document.querySelectorAll("[data-process-tab]"));
  const panes = {
    setup: document.getElementById("process-pane-setup"),
    detections: document.getElementById("process-pane-detections"),
  };

  if (!screen) return;

  let imagePath = "";
  let busy = false;
  let detections = [];

  log.debug("process-image-screen.js init");

  function isOpen() {
    return Boolean(screen && !screen.hidden);
  }

  function colorForLabelId(labelid) {
    const id = Number.isFinite(Number(labelid)) ? Math.abs(Number(labelid)) : 0;
    const hue = (id * GOLDEN_ANGLE) % 360;
    const light = 58 + (id % 5) * 3;
    return `hsl(${hue.toFixed(1)}, 72%, ${light}%)`;
  }

  function setStatus(message, isError) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.classList.remove("is-error");
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function selectProcessTab(tabId) {
    tabButtons.forEach((btn) => {
      const selected = btn.dataset.processTab === tabId;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
    });
    Object.entries(panes).forEach(([id, pane]) => {
      if (pane) pane.hidden = id !== tabId;
    });
  }

  function updateProcessEnabled() {
    if (processBtn) processBtn.disabled = busy;
  }

  function clearDetections() {
    detections = [];
    overlayEl?.replaceChildren();
    if (detectionsList) {
      detectionsList.replaceChildren();
      detectionsList.hidden = true;
    }
    if (detectionsEmpty) detectionsEmpty.hidden = false;
  }

  function fitPreview() {
    if (!paneEl || !stageEl || !previewEl?.naturalWidth || !previewEl.naturalHeight) return;
    const paneW = paneEl.clientWidth;
    const paneH = paneEl.clientHeight;
    if (paneW <= 0 || paneH <= 0) return;
    const scale = Math.min(paneW / previewEl.naturalWidth, paneH / previewEl.naturalHeight);
    const width = previewEl.naturalWidth * scale;
    const height = previewEl.naturalHeight * scale;
    stageEl.style.width = `${width}px`;
    stageEl.style.height = `${height}px`;
    overlayEl?.setAttribute("viewBox", `0 0 ${previewEl.naturalWidth} ${previewEl.naturalHeight}`);
  }

  function clearPreviewSize() {
    if (stageEl) {
      stageEl.style.width = "";
      stageEl.style.height = "";
    }
  }

  function drawDetections(items) {
    detections = Array.isArray(items) ? items : [];
    overlayEl?.replaceChildren();
    detectionsList?.replaceChildren();
    fitPreview();

    if (!detections.length) {
      if (detectionsList) detectionsList.hidden = true;
      if (detectionsEmpty) detectionsEmpty.hidden = false;
      return;
    }

    if (detectionsEmpty) detectionsEmpty.hidden = true;
    if (detectionsList) detectionsList.hidden = false;

    detections.forEach((item) => {
      const color = colorForLabelId(item.labelid);
      if (overlayEl) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("class", "process-image-overlay__box");
        rect.setAttribute("x", String(item.xmin));
        rect.setAttribute("y", String(item.ymin));
        rect.setAttribute("width", String(Math.max(1, item.xmax - item.xmin)));
        rect.setAttribute("height", String(Math.max(1, item.ymax - item.ymin)));
        rect.setAttribute("stroke", color);
        overlayEl.appendChild(rect);
      }

      if (!detectionsList) return;
      const li = document.createElement("li");
      li.className = "process-detections-list__item";

      const idEl = document.createElement("span");
      idEl.className = "process-detections-list__id";
      idEl.textContent = String(item.labelid);

      const swatch = document.createElement("span");
      swatch.className = "process-detections-list__swatch";
      swatch.style.background = color;
      swatch.setAttribute("aria-hidden", "true");

      const nameEl = document.createElement("span");
      nameEl.className = "process-detections-list__name";
      nameEl.textContent = item.name || `class_${item.labelid}`;

      const scoreEl = document.createElement("span");
      scoreEl.className = "process-detections-list__score";
      scoreEl.textContent = `${Math.round((Number(item.score) || 0) * 100)}%`;

      li.append(idEl, swatch, nameEl, scoreEl);
      detectionsList.appendChild(li);
    });
  }

  function setPreview(src, alt) {
    if (!previewEl) return;
    if (!src) {
      previewEl.removeAttribute("src");
      previewEl.alt = "";
      clearPreviewSize();
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
    clearDetections();
    setStatus("");
    selectProcessTab("setup");
    setPreview(current.previewSrc, current.name || "");
    if (canvas) canvas.hidden = true;
    if (inspectorPanel) inspectorPanel.hidden = true;
    if (inspectorResizeHandle) inspectorResizeHandle.hidden = true;
    screen.hidden = false;
    updateProcessEnabled();
    if (previewEl?.complete) fitPreview();
    log.info("process image screen opened", { imagePath, name: current.name || "" });
    log.exit("openProcessImageScreen", startedAt, { ok: true });
  }

  function closeProcessImageScreen({ restoreWorkspace = true } = {}) {
    if (!isOpen()) return;
    const startedAt = log.enter("closeProcessImageScreen");
    screen.hidden = true;
    setPreview("");
    imagePath = "";
    clearDetections();
    setStatus("");
    selectProcessTab("setup");
    if (restoreWorkspace && window.isWorkspaceOpen?.()) {
      if (canvas) canvas.hidden = false;
      if (inspectorPanel) inspectorPanel.hidden = false;
      if (inspectorResizeHandle) inspectorResizeHandle.hidden = false;
    }
    log.info("process image screen closed", { restoreWorkspace });
    log.exit("closeProcessImageScreen", startedAt, { restoreWorkspace });
  }

  async function runProcess() {
    if (busy || !imagePath) return;
    const startedAt = log.enter("runProcess");
    let modelPath = "";
    try {
      const config = await window.visionforge?.getConfiguration?.();
      modelPath = String(config?.onnxModelPath || "").trim();
      const modelType = config?.onnxModelType || window.VisionForgeAiModelTypes?.DEFAULT_TYPE;
      if (!modelPath) {
        setStatus("Select an AI model in Settings first.", true);
        log.exit("runProcess", startedAt, { ok: false, reason: "missing-model" });
        return;
      }
      if (!window.VisionForgeAiModelTypes?.supportsDetection?.(modelType)) {
        setStatus("This model type is not supported yet.", true);
        log.exit("runProcess", startedAt, { ok: false, reason: "unsupported-type" });
        return;
      }
    } catch (err) {
      setStatus("Could not read Settings.", true);
      log.error("runProcess config failed", { error: String(err?.message || err) });
      log.exit("runProcess", startedAt, { error: true });
      return;
    }

    const labels = window.getWorkspaceLabels?.() || [];
    busy = true;
    updateProcessEnabled();
    setStatus("Running model…");
    try {
      const result = await window.visionforge?.runOnnxDetect?.(imagePath, modelPath, labels);
      if (!result?.ok) {
        const reasons = {
          "missing-image": "Image file is missing.",
          "missing-model": "ONNX model file is missing.",
          "invalid-model": "Could not load the ONNX model.",
          "invalid-image": "Could not read the image.",
          "infer-failed": "Model inference failed.",
        };
        setStatus(reasons[result?.reason] || "Process failed.", true);
        log.exit("runProcess", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      drawDetections(result.detections);
      const count = result.detections?.length || 0;
      setStatus(count ? `Found ${count} detections.` : "No detections.");
      selectProcessTab("detections");
      log.info("process finished", { imagePath, count });
      log.exit("runProcess", startedAt, { ok: true, count });
    } catch (err) {
      setStatus("Process failed.", true);
      log.error("runProcess failed", { error: String(err?.message || err) });
      log.exit("runProcess", startedAt, { error: true });
    } finally {
      busy = false;
      updateProcessEnabled();
    }
  }

  previewEl?.addEventListener("load", () => {
    fitPreview();
    if (detections.length) drawDetections(detections);
  });

  if (paneEl && typeof ResizeObserver !== "undefined") {
    const paneObserver = new ResizeObserver(() => {
      if (!isOpen()) return;
      fitPreview();
    });
    paneObserver.observe(paneEl);
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectProcessTab(btn.dataset.processTab);
    });
  });

  backBtn?.addEventListener("click", () => {
    closeProcessImageScreen();
  });

  processBtn?.addEventListener("click", () => {
    void runProcess();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (window.isSettingsOpen?.()) return;
    if (!isOpen()) return;
    event.preventDefault();
    closeProcessImageScreen();
  });

  window.openProcessImageScreen = openProcessImageScreen;
  window.closeProcessImageScreen = closeProcessImageScreen;
  window.isProcessImageScreenOpen = isOpen;
})();
