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
  const detectInput = document.getElementById("import-video-detect");
  const importBtn = document.getElementById("btn-import-video-import");
  const pathInput = document.getElementById("import-video-path");
  const jumpInput = document.getElementById("import-video-jump");
  const statusEl = document.getElementById("import-video-status");
  const emptyEl = document.getElementById("import-video-empty");
  const gridPane = document.getElementById("import-video-grid-pane");
  const gridEl = document.getElementById("import-video-grid");
  const infoEl = document.getElementById("import-video-info");
  const canvas = document.getElementById("workspace-canvas");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorResizeHandle = document.getElementById("inspector-resize-handle");

  if (!screen) return;

  log.debug("import-from-video-screen.js init");

  const CELL_MIN = 80;
  const CELL_MAX = 360;
  const CELL_STEP = 24;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MODEL_STOP_REASONS = new Set(["missing-model", "invalid-model"]);
  const DETECT_ERRORS = {
    "missing-model": "Select an AI model in Settings first.",
    "invalid-model": "Could not load the ONNX model.",
  };

  let videoPath = "";
  let videoInfo = null;
  let frames = [];
  const selected = new Set();
  let busy = false;
  let cellSize = 140;

  function isOpen() {
    return !screen.hidden;
  }

  function frameJump() {
    let n = Math.round(Number(jumpInput?.value));
    if (!Number.isFinite(n) || n < 1) n = 1;
    const cap = Number(videoInfo?.jumpMax);
    if (Number.isFinite(cap) && cap >= 1) n = Math.min(n, cap);
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

  function modelCanDetect() {
    const model = window.getWorkspaceModel?.() || {};
    const modelPath = String(model.path || "").trim();
    const modelType = model.type || window.VisionForgeAiModelTypes?.DEFAULT_TYPE;
    return Boolean(modelPath && window.VisionForgeAiModelTypes?.supportsDetection?.(modelType));
  }

  function syncDetectCheckbox() {
    if (!detectInput) return;
    const ready = modelCanDetect();
    detectInput.disabled = busy || !ready;
    if (!ready) detectInput.checked = false;
  }

  function updateActions() {
    if (processBtn) processBtn.disabled = busy || !videoPath || !videoInfo;
    if (browseBtn) browseBtn.disabled = busy;
    if (jumpInput) jumpInput.disabled = busy;
    syncDetectCheckbox();
    if (importBtn) {
      importBtn.hidden = selected.size < 1;
      importBtn.disabled = busy;
    }
  }

  function renderInfo(info) {
    if (!infoEl) return;
    infoEl.replaceChildren();
    if (!info) {
      infoEl.hidden = true;
      return;
    }
    infoEl.hidden = false;
    [
      `Duration: ${info.duration}`,
      `Size: ${info.width}×${info.height}`,
      `Frame rate: ${info.fps} fps`,
      `Total frames: ${info.totalFrames}`,
    ].forEach((text) => {
      const line = document.createElement("p");
      line.textContent = text;
      infoEl.appendChild(line);
    });
  }

  function fittedImageRect(img, media) {
    const boxW = media?.clientWidth || 0;
    const boxH = media?.clientHeight || 0;
    const nw = img?.naturalWidth || 0;
    const nh = img?.naturalHeight || 0;
    if (!nw || !nh || boxW <= 0 || boxH <= 0) return null;
    const scale = Math.min(boxW / nw, boxH / nh);
    const w = nw * scale;
    const h = nh * scale;
    return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
  }

  function obbPoints(item) {
    const xc = Number(item.xc);
    const yc = Number(item.yc);
    const w = Number(item.w);
    const h = Number(item.h);
    const rad = ((Number(item.angle) || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = w / 2;
    const hh = h / 2;
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]
      .map(([dx, dy]) => `${xc + dx * cos - dy * sin},${yc + dx * sin + dy * cos}`)
      .join(" ");
  }

  function drawOverlay(svg, detections) {
    svg.replaceChildren();
    svg.setAttribute("viewBox", "0 0 1 1");
    svg.setAttribute("preserveAspectRatio", "none");
    (Array.isArray(detections) ? detections : []).forEach((item) => {
      const xc = Number(item?.xc);
      const yc = Number(item?.yc);
      const w = Number(item?.w);
      const h = Number(item?.h);
      if (![xc, yc, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return;
      const angle = Number(item.angle);
      if (Number.isFinite(angle) && angle !== 0) {
        const polygon = document.createElementNS(SVG_NS, "polygon");
        polygon.setAttribute("points", obbPoints(item));
        svg.appendChild(polygon);
        return;
      }
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(xc - w / 2));
      rect.setAttribute("y", String(yc - h / 2));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
      svg.appendChild(rect);
    });
  }

  function layoutOverlays() {
    if (!gridEl) return;
    gridEl.querySelectorAll(".import-video-grid__item").forEach((button) => {
      const media = button.querySelector(".import-video-grid__media");
      const img = button.querySelector(".import-video-grid__thumb");
      const svg = button.querySelector(".import-video-grid__overlay");
      if (!media || !img || !svg) return;
      const fit = fittedImageRect(img, media);
      if (!fit) {
        svg.hidden = true;
        return;
      }
      svg.hidden = false;
      svg.style.left = `${fit.x}px`;
      svg.style.top = `${fit.y}px`;
      svg.style.width = `${fit.w}px`;
      svg.style.height = `${fit.h}px`;
    });
  }

  function scheduleOverlayLayout() {
    requestAnimationFrame(() => {
      requestAnimationFrame(layoutOverlays);
    });
  }

  function applyCellSize() {
    if (!gridPane) return;
    gridPane.style.setProperty("--import-video-cell", `${cellSize}px`);
    scheduleOverlayLayout();
  }

  function paintOverlay(file) {
    if (!gridEl || !file?.filePath) return;
    const button = gridEl.querySelector(`[data-path="${CSS.escape(file.filePath)}"]`);
    const svg = button?.querySelector(".import-video-grid__overlay");
    if (!svg) return;
    drawOverlay(svg, file.detections);
    layoutOverlays();
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
      button.dataset.path = file.filePath;
      if (selected.has(file.filePath)) button.classList.add("is-selected");
      button.title = file.name;
      const media = document.createElement("span");
      media.className = "import-video-grid__media";
      const img = document.createElement("img");
      img.className = "import-video-grid__thumb";
      img.alt = "";
      img.draggable = false;
      img.addEventListener("load", () => {
        file.width = img.naturalWidth || file.width || 0;
        file.height = img.naturalHeight || file.height || 0;
        layoutOverlays();
      });
      img.src = previewSrc(file.filePath);
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.classList.add("import-video-grid__overlay");
      svg.setAttribute("aria-hidden", "true");
      drawOverlay(svg, file.detections);
      media.append(img, svg);
      const name = document.createElement("span");
      name.className = "import-video-grid__name";
      name.textContent = file.name;
      button.append(media, name);
      button.addEventListener("click", () => {
        if (selected.has(file.filePath)) selected.delete(file.filePath);
        else selected.add(file.filePath);
        button.classList.toggle("is-selected", selected.has(file.filePath));
        updateActions();
      });
      gridEl.appendChild(button);
    });
    updateActions();
    scheduleOverlayLayout();
  }

  function releaseFramePreviews() {
    gridEl?.querySelectorAll("img").forEach((img) => {
      img.removeAttribute("src");
    });
  }

  function waitForPreviewRelease() {
    return new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
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
      videoInfo = null;
      renderInfo(null);
      if (pathInput) pathInput.value = videoPath;
      if (jumpInput) jumpInput.removeAttribute("max");
      busy = true;
      updateActions();
      setStatus("Reading video…");
      const probed = await window.visionforge?.probeVideo?.(videoPath);
      if (!probed?.ok || !probed.totalFrames) {
        setStatus("Could not read this video.", true);
        updateActions();
        log.exit("browseVideo", startedAt, { ok: false, reason: probed?.reason || "unreadable" });
        return;
      }
      videoInfo = probed;
      renderInfo(probed);
      if (jumpInput) jumpInput.max = String(probed.jumpMax);
      snapFrameJump();
      setStatus("");
      updateActions();
      log.exit("browseVideo", startedAt, { ok: true, totalFrames: probed.totalFrames });
    } catch (err) {
      log.error("browseVideo failed", { error: String(err?.message || err) });
      log.exit("browseVideo", startedAt, { error: true });
    } finally {
      busy = false;
      updateActions();
    }
  }

  async function processVideo() {
    if (busy || !videoPath || !videoInfo) return;
    syncDetectCheckbox();
    const jump = snapFrameJump();
    const startedAt = log.enter("processVideo");
    busy = true;
    updateActions();
    setStatus("Extracting frames…");
    releaseFramePreviews();
    clearFrames();
    await waitForPreviewRelease();
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
      frames = (Array.isArray(result.files) ? result.files : []).map((file) => ({
        name: file.name,
        filePath: file.filePath,
        detections: [],
        width: 0,
        height: 0,
      }));
      selected.clear();
      renderGrid();
      log.info("video frames extracted", { count: frames.length, jump });
      if (detectInput?.checked && modelCanDetect()) {
        const detected = await detectExtractedFrames();
        if (!detected.ok) {
          log.exit("processVideo", startedAt, { ok: false, reason: detected.reason, count: frames.length });
          return;
        }
      }
      setStatus("");
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

  async function detectExtractedFrames() {
    const model = window.getWorkspaceModel?.() || {};
    const modelPath = String(model.path || "").trim();
    const labels = window.getWorkspaceLabels?.() || [];
    const confidence = window.getWorkspaceConfidence?.();
    for (let index = 0; index < frames.length; index += 1) {
      const file = frames[index];
      setStatus(`Detecting ${index + 1} of ${frames.length}…`);
      const result = await window.visionforge?.runOnnxDetect?.(
        file.filePath,
        modelPath,
        labels,
        model.type,
        confidence,
      );
      if (!result?.ok) {
        if (MODEL_STOP_REASONS.has(result?.reason)) {
          setStatus(DETECT_ERRORS[result.reason] || "Could not load the ONNX model.", true);
          return { ok: false, reason: result.reason };
        }
        file.detections = [];
      } else {
        file.detections = Array.isArray(result.detections) ? result.detections : [];
      }
      paintOverlay(file);
    }
    return { ok: true };
  }

  async function importSelected() {
    if (busy || selected.size < 1) return;
    const chosen = frames.filter((file) => selected.has(file.filePath));
    const paths = chosen.map((file) => file.filePath);
    const startedAt = log.enter("importSelected");
    busy = true;
    updateActions();
    try {
      const result = await window.importWorkspaceImages?.(paths);
      if (!result?.ok) {
        log.exit("importSelected", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      const imported = new Set(Array.isArray(result.newFiles) ? result.newFiles : []);
      const writeDetections = Boolean(detectInput?.checked) && modelCanDetect();
      const entries = writeDetections
        ? chosen
            .filter((file) => imported.has(file.name) && Array.isArray(file.detections) && file.detections.length)
            .map((file) => ({
              name: file.name,
              detections: file.detections,
              width: file.width || videoInfo?.width || 0,
              height: file.height || videoInfo?.height || 0,
            }))
        : [];
      if (entries.length) {
        const applied = await window.applyImportedAssetDetections?.(entries);
        if (!applied?.ok) {
          setStatus("Could not save detections.", true);
          log.exit("importSelected", startedAt, { ok: false, reason: applied?.reason || "detections" });
          return;
        }
      }
      log.info("video frames imported", { count: paths.length, copied: result.copied, detections: entries.length });
      log.exit("importSelected", startedAt, { ok: true, count: paths.length, detections: entries.length });
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
    if (jumpInput && videoInfo?.jumpMax) jumpInput.max = String(videoInfo.jumpMax);
    renderInfo(videoInfo);
    applyCellSize();
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

  gridPane?.addEventListener(
    "wheel",
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const next = cellSize + (event.deltaY < 0 ? CELL_STEP : -CELL_STEP);
      cellSize = Math.min(CELL_MAX, Math.max(CELL_MIN, next));
      applyCellSize();
    },
    { passive: false },
  );

  if (typeof ResizeObserver === "function" && gridPane) {
    const gridObserver = new ResizeObserver(() => {
      layoutOverlays();
    });
    gridObserver.observe(gridPane);
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

  applyCellSize();
  updateActions();
  window.openImportFromVideoScreen = openImportFromVideoScreen;
  window.closeImportFromVideoScreen = closeImportFromVideoScreen;
  window.isImportFromVideoScreenOpen = isOpen;
  window.syncImportVideoDetect = syncDetectCheckbox;
})();
