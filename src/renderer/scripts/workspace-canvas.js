(function () {
  const log =
    window.VisionForgeLogger?.create("workspace") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const PLAY_INTERVAL_MS = 100;
  const SKIP_STEP = 10;
  const ZOOM_IN = 1.25;
  const ZOOM_OUT = 0.8;
  const MAX_ZOOM = 16;
  const FRAME_WHEEL_COOLDOWN_MS = 80;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const GOLDEN_ANGLE = 137.508;
  const BOX_HANDLE_PX = 8;
  const BOX_MIN_SIZE = 4;
  const labelColorCache = new Map();

  const startPage = document.getElementById("start-page");
  const canvas = document.getElementById("workspace-canvas");
  const stage = document.getElementById("workspace-stage");
  const workspaceView = document.getElementById("workspace-view");
  const imageEl = document.getElementById("workspace-image");
  const detectionOverlay = document.getElementById("detection-overlay");
  const boxGuides = document.getElementById("box-guides");
  const boxGuidesH = document.getElementById("box-guides-h");
  const boxGuidesV = document.getElementById("box-guides-v");
  const boxDraft = document.getElementById("box-draft");
  const boxDraftRect = document.getElementById("box-draft-rect");
  const boxDraftDiagonal = document.getElementById("box-draft-diagonal");
  const boxDraftOrigin = document.getElementById("box-draft-origin");
  const boxDraftHatch = document.getElementById("box-draft-hatch");
  const boxDraftHatchPath = document.getElementById("box-draft-hatch-path");
  const boxDraftHatchPathB = document.getElementById("box-draft-hatch-path-b");
  const loadingOverlay = document.getElementById("loading-project-overlay");
  const viewToolbar = document.getElementById("view-toolbar");
  const breadcrumb = document.getElementById("app-breadcrumb");
  const selectImagesBtn = document.getElementById("tool-select-images");
  const toolsDivider = document.getElementById("tools-rail-divider");
  const toolsRail = document.getElementById("tools-rail");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorResizeHandle = document.getElementById("inspector-resize-handle");
  const fileMenuBtn = document.getElementById("btn-file-menu");
  const fileMenuDropdown = document.getElementById("file-menu-dropdown");
  const selectFolderMenuItem = document.getElementById("btn-select-image-folder");
  const exportMenuItem = document.getElementById("btn-export");
  const gotoStartupMenuItem = document.getElementById("btn-goto-startup");
  const skipStartBtn = document.getElementById("playback-skip-start");
  const rewindBtn = document.getElementById("playback-rewind");
  const stepBackBtn = document.getElementById("playback-step-back");
  const playBtn = document.getElementById("playback-play");
  const playIcon = document.getElementById("playback-play-icon");
  const stepForwardBtn = document.getElementById("playback-step-forward");
  const forwardBtn = document.getElementById("playback-forward");
  const skipEndBtn = document.getElementById("playback-skip-end");
  const slider = document.getElementById("playback-slider");
  const frameInput = document.getElementById("playback-frame");
  const assetsEmpty = document.getElementById("assets-empty");
  const assetsList = document.getElementById("assets-list");
  const detectionsEmpty = document.getElementById("detections-empty");
  const detectionsList = document.getElementById("detections-list");
  const labelsEmpty = document.getElementById("labels-empty");
  const labelsList = document.getElementById("labels-list");
  const labelsAddBtn = document.getElementById("btn-labels-add");
  const labelsComposer = document.getElementById("labels-composer");
  const labelsComposerInput = document.getElementById("labels-composer-input");
  const labelsConfirmBtn = document.getElementById("btn-labels-confirm");
  const labelsCancelBtn = document.getElementById("btn-labels-cancel");
  const deleteLabelOverlay = document.getElementById("delete-label-overlay");
  const deleteLabelMessage = document.getElementById("delete-label-message");
  const deleteLabelCloseBtn = document.getElementById("btn-delete-label-close");
  const deleteLabelCancelBtn = document.getElementById("btn-delete-label-cancel");
  const deleteLabelConfirmBtn = document.getElementById("btn-delete-label-confirm");

  if (!canvas) return;

  const state = {
    filePath: "",
    name: "",
    imagesFolder: "",
    files: [],
    frameIndex: 0,
    playing: false,
    playTimer: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    previewToken: 0,
    currentTool: "cursor",
    rotating: false,
    labels: [],
    addingLabel: false,
    editingLabelId: null,
    pendingDeleteId: null,
    savingLabel: false,
    selectedLabelId: null,
    selectedDetectionIndex: null,
    annotationMode: "",
    assets: [],
    assetsByName: new Map(),
  };

  let fitScale = 1;
  let panning = false;
  let panLastX = 0;
  let panLastY = 0;
  let lastFrameWheelAt = 0;
  let boxEdit = null;
  let boxDraw = null;
  let lastStagePointer = null;

  log.debug("workspace-canvas.js init");

  function lastFrameIndex() {
    return Math.max(0, state.files.length - 1);
  }

  function currentFile() {
    return state.files[state.frameIndex] || null;
  }

  function currentScale() {
    return fitScale * state.zoom;
  }

  function applyView() {
    if (!workspaceView) return;
    const scale = currentScale();
    workspaceView.style.transform = `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px) scale(${scale})`;
    refreshHandleSizes();
    if (boxDraw) {
      layoutDrawPreview(boxDraw.currentRect, boxDraw.startPt, boxDraw.pointerPt);
    }
  }

  function computeFitScale() {
    if (!stage || !imageEl || !imageEl.naturalWidth || !imageEl.naturalHeight) {
      fitScale = 1;
      return;
    }
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    if (stageW <= 0 || stageH <= 0) {
      fitScale = 1;
      return;
    }
    fitScale = Math.min(stageW / imageEl.naturalWidth, stageH / imageEl.naturalHeight);
  }

  function previewSrc(filePath, token) {
    return `vfimg://local/?p=${encodeURIComponent(filePath)}&t=${encodeURIComponent(String(token || 0))}`;
  }

  function setViewToolbarVisible(visible) {
    if (viewToolbar) viewToolbar.hidden = !visible;
  }

  function loadPreview() {
    if (!imageEl) return;
    const file = currentFile();
    if (!file) {
      if (workspaceView) workspaceView.hidden = true;
      imageEl.removeAttribute("src");
      clearDetectionOverlay();
      hideCrosshair();
      setViewToolbarVisible(false);
      return;
    }
    if (workspaceView) workspaceView.hidden = false;
    imageEl.src = previewSrc(file.filePath, state.previewToken);
    setViewToolbarVisible(true);
    if (imageReady()) {
      computeFitScale();
      applyView();
      drawDetectionBoxes();
      void persistCurrentAssetSize();
    }
  }

  function closeFileMenu() {
    if (!fileMenuDropdown || !fileMenuBtn) return;
    fileMenuDropdown.hidden = true;
    fileMenuBtn.classList.remove("is-open");
    fileMenuBtn.setAttribute("aria-expanded", "false");
  }

  function toggleFileMenu() {
    if (!fileMenuDropdown || !fileMenuBtn) return;
    const open = fileMenuDropdown.hidden;
    fileMenuDropdown.hidden = !open;
    fileMenuBtn.classList.toggle("is-open", open);
    fileMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function setWorkspaceChrome(visible) {
    if (toolsRail) toolsRail.hidden = !visible;
    if (inspectorPanel) inspectorPanel.hidden = !visible;
    if (inspectorResizeHandle) inspectorResizeHandle.hidden = !visible;
    if (selectImagesBtn) selectImagesBtn.hidden = !visible;
    if (toolsDivider) toolsDivider.hidden = !visible;
    if (selectFolderMenuItem) selectFolderMenuItem.disabled = !visible;
    if (exportMenuItem) exportMenuItem.disabled = !visible;
    if (gotoStartupMenuItem) gotoStartupMenuItem.disabled = !visible;
    if (labelsAddBtn) labelsAddBtn.disabled = !visible;
  }

  function setPlaying(playing) {
    state.playing = playing;
    if (playBtn) {
      playBtn.classList.toggle("is-active", playing);
      playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
      playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
      playBtn.title = playing ? "Pause" : "Play";
    }
    if (playIcon) {
      playIcon.classList.toggle("fa-play", !playing);
      playIcon.classList.toggle("fa-pause", playing);
    }
  }

  function stopPlay() {
    if (state.playTimer) {
      window.clearInterval(state.playTimer);
      state.playTimer = null;
    }
    setPlaying(false);
  }

  function renderAssets() {
    if (!assetsList || !assetsEmpty) return;
    assetsList.replaceChildren();

    if (!state.files.length) {
      assetsEmpty.hidden = false;
      assetsList.hidden = true;
      return;
    }

    assetsEmpty.hidden = true;
    assetsList.hidden = false;

    state.files.forEach((file, index) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "assets-list__item";
      if (index === state.frameIndex) button.classList.add("is-current");
      button.dataset.frameIndex = String(index);
      button.title = file.name;
      button.textContent = file.name;
      li.appendChild(button);
      assetsList.appendChild(li);
    });
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  async function showLoadingOverlay() {
    if (!loadingOverlay) return;
    loadingOverlay.hidden = false;
    await waitForPaint();
  }

  function hideLoadingOverlay() {
    if (loadingOverlay) loadingOverlay.hidden = true;
  }

  function setAssets(assets) {
    state.assets = Array.isArray(assets) ? assets : [];
    state.assetsByName = new Map();
    for (const asset of state.assets) {
      const name = String(asset?.name || "");
      if (name) state.assetsByName.set(name, asset);
    }
  }

  function currentDetections() {
    const file = currentFile();
    if (!file) return [];
    const asset = state.assetsByName.get(file.name);
    return Array.isArray(asset?.detections) ? asset.detections : [];
  }

  function isVocMode() {
    return /voc|pascal/i.test(state.annotationMode);
  }

  function refreshLabelSelection() {
    labelsList?.querySelectorAll(".labels-list__item").forEach((row) => {
      row.classList.toggle("is-selected", Number(row.dataset.labelId) === state.selectedLabelId);
    });
  }

  function setSelectedLabelId(id) {
    const next = Number(id);
    state.selectedLabelId = state.labels.some((label) => label.id === next) ? next : null;
    refreshLabelSelection();
    return state.selectedLabelId;
  }

  function ensureSelectedLabel() {
    if (state.labels.some((label) => label.id === state.selectedLabelId)) return state.selectedLabelId;
    if (!state.labels.length) {
      state.selectedLabelId = null;
      refreshLabelSelection();
      return null;
    }
    return setSelectedLabelId(state.labels[0].id);
  }

  function refreshDetectionSelection() {
    detectionOverlay?.querySelectorAll(".detection-overlay__item").forEach((group) => {
      group.classList.toggle("is-selected", Number(group.dataset.index) === state.selectedDetectionIndex);
    });
    detectionsList?.querySelectorAll(".detections-list__item").forEach((row) => {
      row.classList.toggle("is-selected", Number(row.dataset.index) === state.selectedDetectionIndex);
    });
  }

  function setSelectedDetection(index, options = {}) {
    const next = Number.isInteger(index) ? index : Number(index);
    const detections = currentDetections();
    if (!Number.isInteger(next) || next < 0 || next >= detections.length) {
      state.selectedDetectionIndex = null;
      refreshDetectionSelection();
      return;
    }
    state.selectedDetectionIndex = next;
    const detection = detections[next];
    if (options.syncLabel !== false && detection) {
      setSelectedLabelId(detection.labelid);
      if (options.openTab) window.selectInspectorTab?.("labels");
    }
    refreshDetectionSelection();
  }

  function pointInRect(pt, rect) {
    return (
      pt.x >= rect.x &&
      pt.y >= rect.y &&
      pt.x <= rect.x + rect.width &&
      pt.y <= rect.y + rect.height
    );
  }

  function hitTestDetection(pt) {
    if (!pt || !imageReady()) return null;
    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;
    const items = currentDetections();
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const rect = detectionToRect(items[i]?.value, imgW, imgH);
      if (rect && pointInRect(pt, rect)) return i;
    }
    return null;
  }

  function clampPointToImage(pt, imgW, imgH) {
    return {
      x: Math.min(Math.max(0, Number(pt?.x) || 0), imgW),
      y: Math.min(Math.max(0, Number(pt?.y) || 0), imgH),
    };
  }

  function rectFromPoints(a, b, imgW, imgH) {
    const start = clampPointToImage(a, imgW, imgH);
    const end = clampPointToImage(b, imgW, imgH);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    return {
      x,
      y,
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }

  function hideGuides() {
    if (boxGuides) boxGuides.hidden = true;
  }

  function hideCrosshair() {
    hideGuides();
    hideDraftRect();
  }

  function hideDraftRect() {
    boxDraft?.classList.remove("is-active");
  }

  function imagePointToStage(pt) {
    if (!imageEl || !stage || !imageReady()) return null;
    const img = imageEl.getBoundingClientRect();
    const st = stage.getBoundingClientRect();
    const sx = img.width / imageEl.naturalWidth;
    const sy = img.height / imageEl.naturalHeight;
    return {
      x: img.left - st.left + pt.x * sx,
      y: img.top - st.top + pt.y * sy,
    };
  }

  function draftPreviewColor() {
    return colorForLabelId(state.selectedLabelId ?? 0);
  }

  function applyHatchPath(el, d, color) {
    if (!el) return;
    el.setAttribute("d", d);
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-opacity", "0.7");
  }

  function layoutDrawPreview(rect, startPt, endPt) {
    if (!boxDraft || !stage || !startPt) {
      hideDraftRect();
      return;
    }
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      hideDraftRect();
      return;
    }
    const color = draftPreviewColor();
    const origin = imagePointToStage(startPt);
    const tip = imagePointToStage(endPt || startPt);
    if (!origin || !tip) {
      hideDraftRect();
      return;
    }
    const min = 8;
    const mapped =
      rect && (rect.width >= 1 || rect.height >= 1)
        ? (() => {
            const a = imagePointToStage({ x: rect.x, y: rect.y });
            const b = imagePointToStage({ x: rect.x + rect.width, y: rect.y + rect.height });
            if (!a || !b) return null;
            return {
              x: Math.min(a.x, b.x),
              y: Math.min(a.y, b.y),
              width: Math.max(Math.abs(b.x - a.x), min),
              height: Math.max(Math.abs(b.y - a.y), min),
            };
          })()
        : { x: origin.x, y: origin.y, width: min, height: min };
    if (!mapped) {
      hideDraftRect();
      return;
    }
    boxDraft.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    boxDraft.classList.add("is-active");
    if (boxDraftHatch) {
      boxDraftHatch.setAttribute("width", "13");
      boxDraftHatch.setAttribute("height", "13");
    }
    applyHatchPath(boxDraftHatchPath, "M-1,1 l2,-2 M0,13 l13,-13 M12,14 l2,-2", color);
    applyHatchPath(boxDraftHatchPathB, "M-1,12 l2,2 M0,0 l13,13 M12,-1 l2,2", color);
    if (boxDraftRect) {
      boxDraftRect.setAttribute("x", String(mapped.x));
      boxDraftRect.setAttribute("y", String(mapped.y));
      boxDraftRect.setAttribute("width", String(mapped.width));
      boxDraftRect.setAttribute("height", String(mapped.height));
      boxDraftRect.setAttribute("stroke", color);
      boxDraftRect.setAttribute("fill", "url(#box-draft-hatch)");
    }
    if (boxDraftOrigin) {
      boxDraftOrigin.setAttribute("cx", String(origin.x));
      boxDraftOrigin.setAttribute("cy", String(origin.y));
      boxDraftOrigin.setAttribute("r", "4");
      boxDraftOrigin.setAttribute("fill", color);
    }
    if (boxDraftDiagonal) {
      boxDraftDiagonal.setAttribute("x1", String(origin.x));
      boxDraftDiagonal.setAttribute("y1", String(origin.y));
      boxDraftDiagonal.setAttribute("x2", String(tip.x));
      boxDraftDiagonal.setAttribute("y2", String(tip.y));
      boxDraftDiagonal.setAttribute("stroke", color);
    }
  }

  function updateCrosshair(clientX, clientY) {
    lastStagePointer = { x: clientX, y: clientY };
    if (state.currentTool !== "box" || !currentFile() || !imageReady() || !stage || !boxGuides) {
      hideGuides();
      return;
    }
    const bounds = stage.getBoundingClientRect();
    const width = bounds.width;
    const height = bounds.height;
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    if (width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height) {
      hideGuides();
      return;
    }
    boxGuides.hidden = false;
    if (boxGuidesH) boxGuidesH.style.top = `${y}px`;
    if (boxGuidesV) boxGuidesV.style.left = `${x}px`;
  }

  function labelNameForId(labelid) {
    const id = Number(labelid);
    const label = state.labels.find((item) => item.id === id);
    if (label?.name) return label.name;
    return Number.isFinite(id) ? String(id) : "Unknown";
  }

  function colorForLabelId(labelid) {
    const id = Number.isFinite(Number(labelid)) ? Math.abs(Number(labelid)) : 0;
    const cached = labelColorCache.get(id);
    if (cached) return cached;
    const hue = (id * GOLDEN_ANGLE) % 360;
    const light = 58 + (id % 5) * 3;
    const color = `hsl(${hue.toFixed(1)}, 72%, ${light}%)`;
    labelColorCache.set(id, color);
    return color;
  }

  function detectionToRect(value, imgW, imgH) {
    if (!value || typeof value !== "object") return null;
    const xmin = Number(value.xmin);
    const ymin = Number(value.ymin);
    const xmax = Number(value.xmax);
    const ymax = Number(value.ymax);
    if ([xmin, ymin, xmax, ymax].every(Number.isFinite)) {
      return { x: xmin, y: ymin, width: xmax - xmin, height: ymax - ymin };
    }
    const xc = Number(value.xc);
    const yc = Number(value.yc);
    const w = Number(value.w);
    const h = Number(value.h);
    if (![xc, yc, w, h].every(Number.isFinite) || !imgW || !imgH) return null;
    return {
      x: (xc - w / 2) * imgW,
      y: (yc - h / 2) * imgH,
      width: w * imgW,
      height: h * imgH,
    };
  }

  function isVocValue(value) {
    if (!value || typeof value !== "object") return false;
    return [value.xmin, value.ymin, value.xmax, value.ymax].every((part) => Number.isFinite(Number(part)));
  }

  function snapPixelRect(rect) {
    const x = Math.round(Number(rect?.x) || 0);
    const y = Math.round(Number(rect?.y) || 0);
    const x2 = Math.round((Number(rect?.x) || 0) + (Number(rect?.width) || 0));
    const y2 = Math.round((Number(rect?.y) || 0) + (Number(rect?.height) || 0));
    return {
      x,
      y,
      width: Math.max(1, x2 - x),
      height: Math.max(1, y2 - y),
    };
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }

  function yoloNorm(pixels, size) {
    const dim = Math.max(Number(size) || 1, 1);
    return Number(clamp01(pixels / dim).toFixed(6));
  }

  function rectToValue(rect, imgW, imgH, original) {
    const snapped = snapPixelRect(rect);
    const x1 = snapped.x;
    const y1 = snapped.y;
    const x2 = snapped.x + snapped.width;
    const y2 = snapped.y + snapped.height;
    if (isVocValue(original)) {
      return {
        xmin: x1,
        ymin: y1,
        xmax: x2,
        ymax: y2,
      };
    }
    return {
      xc: yoloNorm((x1 + x2) / 2, imgW),
      yc: yoloNorm((y1 + y2) / 2, imgH),
      w: yoloNorm(x2 - x1, imgW),
      h: yoloNorm(y2 - y1, imgH),
    };
  }

  function formatAsset(row, patch = {}) {
    const name = String(patch.name || row?.name || "");
    const width = Number(patch.width ?? row?.width);
    const height = Number(patch.height ?? row?.height);
    const detections = Array.isArray(patch.detections)
      ? patch.detections
      : Array.isArray(row?.detections)
        ? row.detections
        : [];
    return {
      name,
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : 0,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : 0,
      detections,
    };
  }

  function handleThickness() {
    return Math.max(4, BOX_HANDLE_PX / Math.max(currentScale(), 0.01));
  }

  function svgRect(className, attrs) {
    const el = document.createElementNS(SVG_NS, "rect");
    el.setAttribute("class", className);
    Object.entries(attrs).forEach(([key, value]) => {
      el.setAttribute(key, String(value));
    });
    return el;
  }

  function layoutBoxGroup(group, rect) {
    const t = handleThickness();
    const half = t / 2;
    const body = group.querySelector(".detection-overlay__box");
    const nw = group.querySelector('[data-edge="nw"]');
    const ne = group.querySelector('[data-edge="ne"]');
    const sw = group.querySelector('[data-edge="sw"]');
    const se = group.querySelector('[data-edge="se"]');
    if (!body || !nw || !ne || !sw || !se) return;
    body.setAttribute("x", String(rect.x));
    body.setAttribute("y", String(rect.y));
    body.setAttribute("width", String(rect.width));
    body.setAttribute("height", String(rect.height));
    const corners = {
      nw: { x: rect.x - half, y: rect.y - half },
      ne: { x: rect.x + rect.width - half, y: rect.y - half },
      sw: { x: rect.x - half, y: rect.y + rect.height - half },
      se: { x: rect.x + rect.width - half, y: rect.y + rect.height - half },
    };
    Object.entries(corners).forEach(([edge, pos]) => {
      const el = group.querySelector(`[data-edge="${edge}"]`);
      el.setAttribute("x", String(pos.x));
      el.setAttribute("y", String(pos.y));
      el.setAttribute("width", String(t));
      el.setAttribute("height", String(t));
    });
  }

  function refreshHandleSizes() {
    if (!detectionOverlay) return;
    detectionOverlay.querySelectorAll(".detection-overlay__item").forEach((group) => {
      const body = group.querySelector(".detection-overlay__box");
      if (!body) return;
      layoutBoxGroup(group, {
        x: Number(body.getAttribute("x")),
        y: Number(body.getAttribute("y")),
        width: Number(body.getAttribute("width")),
        height: Number(body.getAttribute("height")),
      });
    });
  }

  function clientToImage(clientX, clientY) {
    if (!imageEl || !imageReady()) return null;
    const bounds = imageEl.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: ((clientX - bounds.left) / bounds.width) * imageEl.naturalWidth,
      y: ((clientY - bounds.top) / bounds.height) * imageEl.naturalHeight,
    };
  }

  function clampRect(rect, imgW, imgH) {
    let { x, y, width, height } = rect;
    if (width < 0) {
      x += width;
      width = -width;
    }
    if (height < 0) {
      y += height;
      height = -height;
    }
    width = Math.max(BOX_MIN_SIZE, width);
    height = Math.max(BOX_MIN_SIZE, height);
    x = Math.min(Math.max(0, x), Math.max(0, imgW - width));
    y = Math.min(Math.max(0, y), Math.max(0, imgH - height));
    return { x, y, width, height };
  }

  function applyBoxEdge(startRect, edge, dx, dy) {
    let { x, y, width, height } = startRect;
    if (edge === "move") {
      return { x: x + dx, y: y + dy, width, height };
    }
    if (edge === "nw") {
      x += dx;
      y += dy;
      width -= dx;
      height -= dy;
    } else if (edge === "ne") {
      y += dy;
      width += dx;
      height -= dy;
    } else if (edge === "sw") {
      x += dx;
      width -= dx;
      height += dy;
    } else if (edge === "se") {
      width += dx;
      height += dy;
    }
    return { x, y, width, height };
  }

  function cancelBoxEdit() {
    if (!boxEdit) return;
    boxEdit = null;
    drawDetectionBoxes();
  }

  async function persistBoxEdit() {
    if (!boxEdit) return;
    const edit = boxEdit;
    boxEdit = null;
    edit.group?.classList.remove("is-active");
    const start = edit.startRect;
    const next = edit.currentRect;
    const unchanged =
      !next ||
      (start &&
        next.x === start.x &&
        next.y === start.y &&
        next.width === start.width &&
        next.height === start.height);
    if (unchanged || !state.filePath) {
      setSelectedDetection(edit.index, { openTab: true });
      drawDetectionBoxes();
      return;
    }
    const file = currentFile();
    const asset = file ? state.assetsByName.get(file.name) : null;
    const detections = Array.isArray(asset?.detections) ? asset.detections.slice() : [];
    const prev = detections[edit.index];
    if (!prev) {
      drawDetectionBoxes();
      return;
    }
    detections[edit.index] = {
      ...prev,
      value: rectToValue(edit.currentRect, imageEl.naturalWidth, imageEl.naturalHeight, prev.value),
    };
    const nextAssets = state.assets.map((row) =>
      row?.name === file.name
        ? formatAsset(row, {
            width: imageEl.naturalWidth,
            height: imageEl.naturalHeight,
            detections,
          })
        : row,
    );
    setAssets(nextAssets);
    try {
      const updated = await window.visionforge?.updateProject?.(state.filePath, { assets: nextAssets });
      if (updated?.ok) {
        setAssets(updated.project?.assets);
        log.info("detection box updated", { name: file.name, index: edit.index });
      } else {
        log.warn("could not persist detection box", { reason: updated?.reason });
      }
    } catch (err) {
      log.error("persistBoxEdit failed", { error: String(err?.message || err) });
    }
    setSelectedDetection(edit.index, { openTab: true });
    drawDetectionBoxes();
  }

  async function persistNewBox(rect) {
    const labelid = ensureSelectedLabel();
    if (labelid == null || !state.filePath || !imageReady()) return;
    const file = currentFile();
    if (!file) return;
    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;
    if ((rect?.width || 0) < BOX_MIN_SIZE || (rect?.height || 0) < BOX_MIN_SIZE) return;
    const asset = state.assetsByName.get(file.name);
    const detections = Array.isArray(asset?.detections) ? asset.detections.slice() : [];
    detections.push({
      labelid,
      value: rectToValue(rect, imgW, imgH, isVocMode() ? { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } : { xc: 0, yc: 0, w: 0, h: 0 }),
    });
    const nextAssets = state.assets.map((row) =>
      row?.name === file.name
        ? formatAsset(row, {
            width: imgW,
            height: imgH,
            detections,
          })
        : row,
    );
    if (!nextAssets.some((row) => row?.name === file.name)) {
      nextAssets.push(formatAsset({ name: file.name, detections: [] }, { width: imgW, height: imgH, detections }));
    }
    setAssets(nextAssets);
    const newIndex = detections.length - 1;
    try {
      const updated = await window.visionforge?.updateProject?.(state.filePath, { assets: nextAssets });
      if (updated?.ok) {
        setAssets(updated.project?.assets);
        log.info("detection box created", { name: file.name, index: newIndex, labelid });
      } else {
        log.warn("could not persist new detection box", { reason: updated?.reason });
      }
    } catch (err) {
      log.error("persistNewBox failed", { error: String(err?.message || err) });
    }
    setSelectedDetection(newIndex, { openTab: true });
    renderDetections();
    window.selectWorkspaceTool?.("cursor");
  }

  async function persistDetectionLabel(index, labelid) {
    if (!state.filePath || boxEdit || boxDraw) return;
    const file = currentFile();
    if (!file) return;
    const asset = state.assetsByName.get(file.name);
    const detections = Array.isArray(asset?.detections) ? asset.detections.slice() : [];
    const prev = detections[index];
    if (!prev || Number(prev.labelid) === Number(labelid)) return;
    detections[index] = { ...prev, labelid };
    const nextAssets = state.assets.map((row) =>
      row?.name === file.name
        ? formatAsset(row, {
            width: imageEl.naturalWidth || asset?.width,
            height: imageEl.naturalHeight || asset?.height,
            detections,
          })
        : row,
    );
    setAssets(nextAssets);
    try {
      const updated = await window.visionforge?.updateProject?.(state.filePath, { assets: nextAssets });
      if (updated?.ok) {
        setAssets(updated.project?.assets);
        log.info("detection label updated", { name: file.name, index, labelid });
      } else {
        log.warn("could not update detection label", { reason: updated?.reason });
      }
    } catch (err) {
      log.error("persistDetectionLabel failed", { error: String(err?.message || err) });
    }
    state.selectedDetectionIndex = index;
    renderDetections();
  }

  async function persistCurrentAssetSize() {
    if (!state.filePath || !imageReady()) return;
    const file = currentFile();
    if (!file) return;
    const width = imageEl.naturalWidth;
    const height = imageEl.naturalHeight;
    const asset = state.assetsByName.get(file.name);
    if (!asset) return;
    if (Number(asset.width) === width && Number(asset.height) === height) return;
    const nextAssets = state.assets.map((row) =>
      row?.name === file.name ? formatAsset(row, { width, height }) : row,
    );
    setAssets(nextAssets);
    try {
      const updated = await window.visionforge?.updateProject?.(state.filePath, { assets: nextAssets });
      if (updated?.ok) {
        setAssets(updated.project?.assets);
        log.debug("asset size saved", { name: file.name, width, height });
      } else {
        log.warn("could not persist asset size", { reason: updated?.reason });
      }
    } catch (err) {
      log.error("persistCurrentAssetSize failed", { error: String(err?.message || err) });
    }
  }

  async function persistDeleteDetection(index) {
    if (!state.filePath || boxEdit || boxDraw) return;
    const file = currentFile();
    if (!file) return;
    const asset = state.assetsByName.get(file.name);
    const detections = Array.isArray(asset?.detections) ? asset.detections.slice() : [];
    if (!Number.isInteger(index) || index < 0 || index >= detections.length) return;
    detections.splice(index, 1);
    const nextAssets = state.assets.map((row) =>
      row?.name === file.name
        ? formatAsset(row, {
            width: imageEl.naturalWidth || asset?.width,
            height: imageEl.naturalHeight || asset?.height,
            detections,
          })
        : row,
    );
    setAssets(nextAssets);
    state.selectedDetectionIndex = null;
    try {
      const updated = await window.visionforge?.updateProject?.(state.filePath, { assets: nextAssets });
      if (updated?.ok) {
        setAssets(updated.project?.assets);
        log.info("detection deleted", { name: file.name, index });
      } else {
        log.warn("could not delete detection", { reason: updated?.reason });
      }
    } catch (err) {
      log.error("persistDeleteDetection failed", { error: String(err?.message || err) });
    }
    renderDetections();
  }

  function imageReady() {
    return Boolean(imageEl && imageEl.complete && imageEl.naturalWidth > 0 && imageEl.naturalHeight > 0);
  }

  function clearDetectionOverlay() {
    if (!detectionOverlay) return;
    detectionOverlay.replaceChildren();
  }

  function syncOverlaySize() {
    if (!detectionOverlay || !imageEl || !imageReady()) return false;
    detectionOverlay.setAttribute("viewBox", `0 0 ${imageEl.naturalWidth} ${imageEl.naturalHeight}`);
    detectionOverlay.removeAttribute("width");
    detectionOverlay.removeAttribute("height");
    detectionOverlay.style.width = "";
    detectionOverlay.style.height = "";
    return true;
  }

  function drawDetectionBoxes() {
    if (!detectionOverlay) return;
    if (!syncOverlaySize()) return;
    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;
    const groups = [];
    currentDetections().forEach((detection, index) => {
      const rect = detectionToRect(detection?.value, imgW, imgH);
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const color = colorForLabelId(detection.labelid);
      const group = document.createElementNS(SVG_NS, "g");
      group.setAttribute("class", "detection-overlay__item");
      group.dataset.index = String(index);
      if (index === state.selectedDetectionIndex) group.classList.add("is-selected");
      group.append(
        svgRect("detection-overlay__box", { fill: "transparent", stroke: color }),
        svgRect("detection-overlay__handle", { "data-edge": "nw", fill: color }),
        svgRect("detection-overlay__handle", { "data-edge": "ne", fill: color }),
        svgRect("detection-overlay__handle", { "data-edge": "sw", fill: color }),
        svgRect("detection-overlay__handle", { "data-edge": "se", fill: color }),
      );
      layoutBoxGroup(group, rect);
      groups.push(group);
    });
    detectionOverlay.replaceChildren(...groups);
  }

  function renderDetections() {
    if (!detectionsList || !detectionsEmpty) return;
    const items = currentDetections();
    detectionsList.replaceChildren();

    if (!items.length) {
      detectionsEmpty.hidden = false;
      detectionsList.hidden = true;
      drawDetectionBoxes();
      return;
    }

    detectionsEmpty.hidden = true;
    detectionsList.hidden = false;

    items.forEach((detection, index) => {
      const name = labelNameForId(detection?.labelid);
      const li = document.createElement("li");
      li.className = "detections-list__item";
      li.dataset.index = String(index);
      li.title = name;
      if (index === state.selectedDetectionIndex) li.classList.add("is-selected");

      const swatch = document.createElement("span");
      swatch.className = "detections-list__swatch";
      swatch.style.background = colorForLabelId(detection?.labelid);

      const nameEl = document.createElement("span");
      nameEl.className = "detections-list__name";
      nameEl.textContent = `${index + 1}. ${name}`;

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "detections-list__delete";
      deleteBtn.dataset.index = String(index);
      deleteBtn.setAttribute("aria-label", `Delete detection ${index + 1}`);
      deleteBtn.title = "Delete";
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';

      li.append(swatch, nameEl, deleteBtn);
      detectionsList.appendChild(li);
    });

    drawDetectionBoxes();
  }

  function renderLabels(labels, options = {}) {
    if (!labelsList || !labelsEmpty) return;
    const items = Array.isArray(labels) ? labels : [];
    state.labels = items.map((label) => ({
      id: Number.isFinite(Number(label?.id)) ? Number(label.id) : 0,
      name: String(label?.name || "").trim() || "Untitled",
    }));
    if (!options.keepEditing) {
      state.editingLabelId = null;
    }
    labelsList.replaceChildren();

    if (!state.labels.length) {
      labelsEmpty.hidden = false;
      labelsList.hidden = true;
      state.selectedLabelId = null;
      return;
    }

    labelsEmpty.hidden = true;
    labelsList.hidden = false;

    state.labels.forEach((label) => {
      const li = document.createElement("li");
      li.className = "labels-list__item";
      li.dataset.labelId = String(label.id);
      li.title = label.name;

      const idEl = document.createElement("span");
      idEl.className = "labels-list__id";
      idEl.textContent = String(label.id);

      if (options.keepEditing && state.editingLabelId === label.id) {
        li.classList.add("is-editing");
        const input = document.createElement("input");
        input.type = "text";
        input.className = "labels-list__edit-input";
        input.value = label.name;
        input.maxLength = 80;
        input.setAttribute("aria-label", "Rename label");

        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "labels-list__save";
        saveBtn.dataset.labelId = String(label.id);
        saveBtn.setAttribute("aria-label", "Save");
        saveBtn.title = "Save";
        saveBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i>';

        li.append(idEl, input, saveBtn);
        labelsList.appendChild(li);
        return;
      }

      const nameEl = document.createElement("span");
      nameEl.className = "labels-list__name";
      nameEl.textContent = label.name;

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "labels-list__delete";
      deleteBtn.dataset.labelId = String(label.id);
      deleteBtn.setAttribute("aria-label", `Delete ${label.name}`);
      deleteBtn.title = "Delete";
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';

      li.append(idEl, nameEl, deleteBtn);
      labelsList.appendChild(li);
    });
    if (!state.labels.some((label) => label.id === state.selectedLabelId)) {
      state.selectedLabelId = null;
    }
    refreshLabelSelection();
  }

  function nextLabelId() {
    if (!state.labels.length) return 0;
    return Math.max(...state.labels.map((label) => label.id)) + 1;
  }

  async function persistLabels(next, method) {
    const startedAt = log.enter(method);
    const updated = await window.visionforge?.updateProject?.(state.filePath, { labels: next });
    if (!updated?.ok) {
      log.warn(`${method} persist failed`, { reason: updated?.reason });
      log.exit(method, startedAt, { ok: false });
      return false;
    }
    renderLabels(updated.project?.labels || next);
    if (state.currentTool === "box") ensureSelectedLabel();
    renderDetections();
    log.exit(method, startedAt, { ok: true, count: state.labels.length });
    return true;
  }

  function cancelLabelEdit() {
    if (state.editingLabelId == null) return;
    renderLabels(state.labels);
  }

  function startLabelEdit(id) {
    if (!state.filePath) return;
    closeComposer();
    state.editingLabelId = id;
    renderLabels(state.labels, { keepEditing: true });
    const input = labelsList?.querySelector(".labels-list__edit-input");
    input?.focus();
    input?.select();
  }

  async function confirmRenameLabel() {
    if (!state.filePath || state.savingLabel || state.editingLabelId == null) return;
    const input = labelsList?.querySelector(".labels-list__edit-input");
    const name = String(input?.value || "").trim();
    if (!name) {
      input?.focus();
      return;
    }
    const current = state.labels.find((label) => label.id === state.editingLabelId);
    if (current && current.name === name) {
      cancelLabelEdit();
      return;
    }
    state.savingLabel = true;
    try {
      const next = state.labels.map((label) =>
        label.id === state.editingLabelId ? { id: label.id, name } : label,
      );
      const ok = await persistLabels(next, "confirmRenameLabel");
      if (ok) log.info("label renamed", { id: current?.id, name });
    } catch (err) {
      log.error("confirmRenameLabel failed", { error: String(err?.message || err) });
    } finally {
      state.savingLabel = false;
    }
  }

  function closeDeleteDialog() {
    if (deleteLabelOverlay) deleteLabelOverlay.hidden = true;
    state.pendingDeleteId = null;
  }

  function openDeleteDialog(id) {
    const label = state.labels.find((item) => item.id === id);
    if (!label || !state.filePath) return;
    cancelLabelEdit();
    state.pendingDeleteId = id;
    if (deleteLabelMessage) {
      deleteLabelMessage.textContent = `Delete "${label.name}"? This cannot be undone.`;
    }
    if (deleteLabelOverlay) deleteLabelOverlay.hidden = false;
  }

  async function confirmDeleteLabel() {
    if (!state.filePath || state.savingLabel || state.pendingDeleteId == null) return;
    state.savingLabel = true;
    if (deleteLabelConfirmBtn) deleteLabelConfirmBtn.disabled = true;
    try {
      const id = state.pendingDeleteId;
      const next = state.labels.filter((label) => label.id !== id);
      const ok = await persistLabels(next, "confirmDeleteLabel");
      if (ok) {
        log.info("label deleted", { id });
        closeDeleteDialog();
      }
    } catch (err) {
      log.error("confirmDeleteLabel failed", { error: String(err?.message || err) });
    } finally {
      state.savingLabel = false;
      if (deleteLabelConfirmBtn) deleteLabelConfirmBtn.disabled = false;
    }
  }

  function setComposerOpen(open) {
    if (!labelsComposer) return;
    labelsComposer.hidden = !open;
    if (labelsAddBtn) {
      labelsAddBtn.disabled = !state.filePath || open;
    }
    if (open) {
      if (labelsComposerInput) labelsComposerInput.value = "";
      labelsComposerInput?.focus();
    }
  }

  function closeComposer() {
    setComposerOpen(false);
  }

  function openComposer() {
    if (!state.filePath) return;
    cancelLabelEdit();
    setComposerOpen(true);
  }

  async function confirmAddLabel() {
    if (!state.filePath || state.addingLabel) return;
    const name = String(labelsComposerInput?.value || "").trim();
    if (!name) {
      labelsComposerInput?.focus();
      return;
    }

    const startedAt = log.enter("confirmAddLabel");
    state.addingLabel = true;
    if (labelsConfirmBtn) labelsConfirmBtn.disabled = true;
    try {
      const next = state.labels.concat([{ id: nextLabelId(), name }]);
      const updated = await window.visionforge?.updateProject?.(state.filePath, { labels: next });
      if (!updated?.ok) {
        log.warn("could not persist label", { reason: updated?.reason });
        log.exit("confirmAddLabel", startedAt, { ok: false });
        return;
      }
      renderLabels(updated.project?.labels || next);
      renderDetections();
      closeComposer();
      log.info("label added", { name, count: state.labels.length });
      log.exit("confirmAddLabel", startedAt, { ok: true });
    } catch (err) {
      log.error("confirmAddLabel failed", { error: String(err?.message || err) });
      log.exit("confirmAddLabel", startedAt, { error: true });
    } finally {
      state.addingLabel = false;
      if (labelsConfirmBtn) labelsConfirmBtn.disabled = false;
    }
  }

  function highlightCurrentAsset() {
    if (!assetsList) return;
    const items = assetsList.querySelectorAll(".assets-list__item");
    items.forEach((item) => {
      const index = Number(item.dataset.frameIndex);
      item.classList.toggle("is-current", index === state.frameIndex);
    });
  }

  function syncPlaybackControls() {
    const max = lastFrameIndex();
    const hasFrames = state.files.length > 0;
    if (slider) {
      slider.max = String(max);
      slider.value = String(state.frameIndex);
      slider.disabled = !hasFrames;
    }
    if (frameInput) {
      frameInput.max = String(max);
      frameInput.value = String(state.frameIndex);
      frameInput.disabled = !hasFrames;
    }
  }

  function setFrame(index, options = {}) {
    if (boxEdit) cancelBoxEdit();
    boxDraw = null;
    hideDraftRect();
    state.selectedDetectionIndex = null;
    const max = lastFrameIndex();
    const next = state.files.length === 0 ? 0 : Math.min(max, Math.max(0, Math.round(index)));
    state.frameIndex = next;
    syncPlaybackControls();
    highlightCurrentAsset();
    if (options.resetView) {
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
    }
    loadPreview();
    renderDetections();
    if (!options.silent) {
      log.debug("frame", { index: state.frameIndex, count: state.files.length });
    }
  }

  function startPlay() {
    if (state.files.length === 0) return;
    if (state.frameIndex >= lastFrameIndex()) {
      setFrame(0);
    }
    setPlaying(true);
    state.playTimer = window.setInterval(() => {
      if (state.frameIndex >= lastFrameIndex()) {
        stopPlay();
        return;
      }
      setFrame(state.frameIndex + 1, { silent: true });
    }, PLAY_INTERVAL_MS);
  }

  function togglePlay() {
    if (state.playing) {
      stopPlay();
      return;
    }
    startPlay();
  }

  function applyImageList(folderPath, files) {
    state.imagesFolder = folderPath || "";
    state.files = Array.isArray(files) ? files : [];
    state.previewToken = 0;
    stopPlay();
    setFrame(0, { resetView: true });
    renderAssets();
    log.info("image folder loaded", { folderPath: state.imagesFolder, count: state.files.length });
  }

  function zoomBy(factor, origin) {
    if (!currentFile()) return;
    if (factor < 1 && state.zoom * factor < 1) {
      fitToScreen();
      return;
    }
    const oldScale = currentScale();
    const nextZoom = Math.min(MAX_ZOOM, state.zoom * factor);
    const newScale = fitScale * nextZoom;
    if (origin && oldScale > 0) {
      const ratio = newScale / oldScale;
      state.panX = origin.x - (origin.x - state.panX) * ratio;
      state.panY = origin.y - (origin.y - state.panY) * ratio;
    }
    state.zoom = nextZoom;
    applyView();
    log.debug("zoom", { zoom: state.zoom });
  }

  function zoomIn() {
    zoomBy(ZOOM_IN, { x: 0, y: 0 });
  }

  function zoomOut() {
    zoomBy(ZOOM_OUT, { x: 0, y: 0 });
  }

  function fitToScreen() {
    if (!currentFile()) return;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    computeFitScale();
    applyView();
    log.debug("fit to screen");
  }

  function setWorkspaceTool(toolId) {
    state.currentTool = toolId || "cursor";
    stage?.classList.toggle("is-box-tool", state.currentTool === "box");
    if (state.currentTool === "box") {
      window.selectInspectorTab?.("labels");
      ensureSelectedLabel();
      if (lastStagePointer) updateCrosshair(lastStagePointer.x, lastStagePointer.y);
    } else {
      hideCrosshair();
    }
  }

  async function showWorkspace({ filePath, name } = {}) {
    const startedAt = log.enter("showWorkspace");
    const resolvedPath = String(filePath || "").trim();
    if (!resolvedPath) {
      log.exit("showWorkspace", startedAt, { ok: false, reason: "missing-file" });
      return;
    }

    try {
      await showLoadingOverlay();
      const result = await window.visionforge?.loadProject?.(resolvedPath);
      if (!result?.ok) {
        log.error("loadProject failed", { filePath: resolvedPath, reason: result?.reason });
        log.exit("showWorkspace", startedAt, { ok: false, reason: result?.reason });
        return;
      }

      state.filePath = result.filePath;
      state.name = result.name || name || "Untitled";
      state.annotationMode = String(result.project?.annotationMode || "");
      if (startPage) startPage.hidden = true;
      canvas.hidden = false;
      setWorkspaceChrome(true);
      if (breadcrumb) breadcrumb.textContent = state.name;
      closeFileMenu();
      closeComposer();
      closeDeleteDialog();
      window.selectWorkspaceTool?.("cursor");
      window.selectInspectorTab?.("assets");
      log.info("workspace opened", { filePath: state.filePath, name: state.name });
      setAssets(result.project?.assets);
      renderLabels(result.project?.labels);
      await restoreImagesFolder(result.project?.imagesFolder || "");
      log.exit("showWorkspace", startedAt, { ok: true });
    } catch (err) {
      log.error("showWorkspace failed", { error: String(err?.message || err) });
      log.exit("showWorkspace", startedAt, { error: true });
    } finally {
      hideLoadingOverlay();
    }
  }

  async function closeWorkspace() {
    if (!state.filePath) return;
    const startedAt = log.enter("closeWorkspace");
    stopPlay();
    boxEdit = null;
    boxDraw = null;
    hideCrosshair();
    closeFileMenu();
    closeComposer();
    closeDeleteDialog();
    window.selectWorkspaceTool?.("cursor");
    applyImageList("", []);
    renderLabels([]);
    setAssets([]);
    renderDetections();
    state.filePath = "";
    state.name = "";
    state.previewToken = 0;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    state.editingLabelId = null;
    state.pendingDeleteId = null;
    state.addingLabel = false;
    state.savingLabel = false;
    state.selectedLabelId = null;
    state.selectedDetectionIndex = null;
    state.annotationMode = "";
    panning = false;
    lastFrameWheelAt = 0;
    setWorkspaceChrome(false);
    canvas.hidden = true;
    if (startPage) startPage.hidden = false;
    if (breadcrumb) breadcrumb.textContent = "Welcome";
    try {
      await window.visionforge?.closeProject?.();
    } catch (err) {
      log.warn("closeProject failed", { error: String(err?.message || err) });
    }
    window.refreshSolutionHistory?.();
    log.info("workspace closed");
    log.exit("closeWorkspace", startedAt, { ok: true });
  }

  async function restoreImagesFolder(folderPath) {
    const dir = String(folderPath || "").trim();
    if (!dir) {
      applyImageList("", []);
      return;
    }
    const startedAt = log.enter("restoreImagesFolder");
    try {
      const result = await window.visionforge?.listImageFolder?.(dir);
      if (!result?.ok) {
        log.warn("could not restore images folder", { folderPath: dir, reason: result?.reason });
        applyImageList(dir, []);
        log.exit("restoreImagesFolder", startedAt, { ok: false });
        return;
      }
      applyImageList(result.folderPath, result.files);
      log.exit("restoreImagesFolder", startedAt, { count: result.files?.length || 0 });
    } catch (err) {
      log.error("restoreImagesFolder failed", { error: String(err?.message || err) });
      applyImageList(dir, []);
      log.exit("restoreImagesFolder", startedAt, { error: true });
    }
  }

  async function selectImagesFolder() {
    if (!state.filePath) return;
    const startedAt = log.enter("selectImagesFolder");
    closeFileMenu();
    try {
      const defaultPath = state.imagesFolder || state.filePath;
      const picked = await window.visionforge?.selectImagesFolder?.(defaultPath);
      if (!picked?.ok) {
        log.exit("selectImagesFolder", startedAt, { ok: false });
        return;
      }
      if (picked.canceled) {
        log.exit("selectImagesFolder", startedAt, { canceled: true });
        return;
      }

      await showLoadingOverlay();
      try {
        const folderPath = picked.folderPath;
        const updated = await window.visionforge?.updateProject?.(state.filePath, { imagesFolder: folderPath });
        if (!updated?.ok) {
          log.warn("could not persist imagesFolder", { reason: updated?.reason });
        } else {
          state.annotationMode = String(updated.project?.annotationMode || state.annotationMode);
          renderLabels(updated.project?.labels);
          setAssets(updated.project?.assets);
        }

        const listed = await window.visionforge?.listImageFolder?.(folderPath);
        if (!listed?.ok) {
          applyImageList(folderPath, []);
          log.exit("selectImagesFolder", startedAt, { ok: false, reason: listed?.reason });
          return;
        }
        applyImageList(listed.folderPath, listed.files);
        log.exit("selectImagesFolder", startedAt, { folderPath, count: listed.files?.length || 0 });
      } finally {
        hideLoadingOverlay();
      }
    } catch (err) {
      log.error("selectImagesFolder failed", { error: String(err?.message || err) });
      log.exit("selectImagesFolder", startedAt, { error: true });
    }
  }

  async function rotateCurrentImage() {
    const file = currentFile();
    if (!file || state.rotating) return;
    const startedAt = log.enter("rotateCurrentImage");
    state.rotating = true;
    stopPlay();
    if (imageEl) {
      imageEl.removeAttribute("src");
    }
    clearDetectionOverlay();
    try {
      const result = await window.visionforge?.rotateImage?.(file.filePath);
      if (!result?.ok) {
        log.warn("rotate failed", { reason: result?.reason });
        state.previewToken = Date.now();
        loadPreview();
        log.exit("rotateCurrentImage", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      state.previewToken = Date.now();
      state.zoom = 1;
      state.panX = 0;
      state.panY = 0;
      loadPreview();
      log.info("image rotated", { filePath: file.filePath });
      log.exit("rotateCurrentImage", startedAt, { ok: true });
    } catch (err) {
      log.error("rotateCurrentImage failed", { error: String(err?.message || err) });
      state.previewToken = Date.now();
      loadPreview();
      log.exit("rotateCurrentImage", startedAt, { error: true });
    } finally {
      state.rotating = false;
    }
  }

  imageEl?.addEventListener("load", () => {
    computeFitScale();
    applyView();
    drawDetectionBoxes();
    void persistCurrentAssetSize();
  });

  imageEl?.addEventListener("error", () => {
    log.warn("preview load failed", { src: imageEl?.src || "" });
    clearDetectionOverlay();
    hideCrosshair();
  });

  detectionOverlay?.addEventListener("pointerdown", (event) => {
    if (state.currentTool !== "cursor" || event.button !== 0) return;
    const item = event.target.closest?.(".detection-overlay__item");
    if (!item || !detectionOverlay.contains(item) || !imageReady()) return;
    const index = Number(item.dataset.index);
    const detection = currentDetections()[index];
    const rect = detectionToRect(detection?.value, imageEl.naturalWidth, imageEl.naturalHeight);
    const startPt = clientToImage(event.clientX, event.clientY);
    if (!rect || !startPt) return;
    event.preventDefault();
    event.stopPropagation();
    stopPlay();
    setSelectedDetection(index, { openTab: true });
    const handle = event.target.closest?.(".detection-overlay__handle");
    boxEdit = {
      index,
      edge: handle?.getAttribute("data-edge") || "move",
      startPt,
      startRect: { ...rect },
      currentRect: { ...rect },
      pointerId: event.pointerId,
      group: item,
    };
    item.classList.add("is-active");
    detectionOverlay.setPointerCapture?.(event.pointerId);
  });

  detectionOverlay?.addEventListener("pointermove", (event) => {
    if (!boxEdit || event.pointerId !== boxEdit.pointerId) return;
    const pt = clientToImage(event.clientX, event.clientY);
    if (!pt) return;
    const next = clampRect(
      applyBoxEdge(boxEdit.startRect, boxEdit.edge, pt.x - boxEdit.startPt.x, pt.y - boxEdit.startPt.y),
      imageEl.naturalWidth,
      imageEl.naturalHeight,
    );
    boxEdit.currentRect = next;
    layoutBoxGroup(boxEdit.group, next);
  });

  function endBoxPointer(event) {
    if (!boxEdit || event.pointerId !== boxEdit.pointerId) return;
    if (detectionOverlay?.hasPointerCapture?.(event.pointerId)) {
      detectionOverlay.releasePointerCapture(event.pointerId);
    }
    void persistBoxEdit();
  }

  detectionOverlay?.addEventListener("pointerup", endBoxPointer);
  detectionOverlay?.addEventListener("pointercancel", endBoxPointer);

  if (stage && typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      computeFitScale();
      applyView();
    }).observe(stage);
  }

  stage?.addEventListener(
    "wheel",
    (event) => {
      if (!currentFile()) return;
      event.preventDefault();
      if (event.ctrlKey) {
        const rect = stage.getBoundingClientRect();
        const origin = {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        };
        zoomBy(event.deltaY < 0 ? ZOOM_IN : ZOOM_OUT, origin);
        return;
      }
      if (!event.shiftKey || state.currentTool !== "cursor" || boxEdit || boxDraw) return;
      const now = Date.now();
      if (now - lastFrameWheelAt < FRAME_WHEEL_COOLDOWN_MS) return;
      lastFrameWheelAt = now;
      stopPlay();
      setFrame(state.frameIndex + (event.deltaY < 0 ? -1 : 1));
    },
    { passive: false },
  );

  function startBoxDraw(event) {
    if (state.currentTool !== "box" || event.button !== 0 || !currentFile() || !imageReady()) return false;
    const raw = clientToImage(event.clientX, event.clientY);
    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;
    if (!raw || raw.x < 0 || raw.y < 0 || raw.x > imgW || raw.y > imgH) return false;
    const startPt = clampPointToImage(raw, imgW, imgH);
    const hit = hitTestDetection(startPt);
    if (hit != null) setSelectedDetection(hit, { openTab: true });
    event.preventDefault();
    stopPlay();
    boxDraw = {
      pointerId: event.pointerId,
      startPt,
      pointerPt: startPt,
      currentRect: { x: startPt.x, y: startPt.y, width: 0, height: 0 },
    };
    layoutDrawPreview(boxDraw.currentRect, startPt, startPt);
    stage.setPointerCapture?.(event.pointerId);
    return true;
  }

  function moveBoxDraw(event) {
    if (!boxDraw || event.pointerId !== boxDraw.pointerId || !imageReady()) return;
    const raw = clientToImage(event.clientX, event.clientY);
    if (!raw) return;
    const imgW = imageEl.naturalWidth;
    const imgH = imageEl.naturalHeight;
    boxDraw.pointerPt = clampPointToImage(raw, imgW, imgH);
    boxDraw.currentRect = rectFromPoints(boxDraw.startPt, boxDraw.pointerPt, imgW, imgH);
    layoutDrawPreview(boxDraw.currentRect, boxDraw.startPt, boxDraw.pointerPt);
  }

  async function endBoxDraw(event) {
    if (!boxDraw || (event && event.pointerId !== boxDraw.pointerId)) return;
    const draw = boxDraw;
    boxDraw = null;
    hideDraftRect();
    if (stage?.hasPointerCapture?.(draw.pointerId)) {
      stage.releasePointerCapture(draw.pointerId);
    }
    await persistNewBox(draw.currentRect);
  }

  function endPan(event) {
    if (!panning) return;
    panning = false;
    stage?.classList.remove("is-panning");
    if (event?.pointerId != null) {
      stage?.releasePointerCapture?.(event.pointerId);
    }
  }

  stage?.addEventListener("pointerdown", (event) => {
    if (!currentFile()) return;
    if (event.button === 1) {
      event.preventDefault();
      panning = true;
      hideGuides();
      panLastX = event.clientX;
      panLastY = event.clientY;
      stage.classList.add("is-panning");
      stage.setPointerCapture?.(event.pointerId);
      return;
    }
    if (startBoxDraw(event)) return;
  });

  stage?.addEventListener("pointermove", (event) => {
    if (panning) {
      state.panX += event.clientX - panLastX;
      state.panY += event.clientY - panLastY;
      panLastX = event.clientX;
      panLastY = event.clientY;
      applyView();
      return;
    }
    if (boxDraw) {
      moveBoxDraw(event);
      updateCrosshair(event.clientX, event.clientY);
      return;
    }
    if (state.currentTool === "box") updateCrosshair(event.clientX, event.clientY);
  });

  stage?.addEventListener("pointerleave", () => {
    hideGuides();
    if (!boxDraw) hideDraftRect();
  });

  stage?.addEventListener("pointerup", (event) => {
    endPan(event);
    void endBoxDraw(event);
  });
  stage?.addEventListener("pointercancel", (event) => {
    endPan(event);
    void endBoxDraw(event);
  });

  viewToolbar?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  viewToolbar?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-view-tool]");
    if (!btn || !viewToolbar.contains(btn)) return;
    const action = btn.dataset.viewTool;
    if (action === "zoom-in") {
      zoomIn();
      return;
    }
    if (action === "zoom-out") {
      zoomOut();
      return;
    }
    if (action === "fit") {
      fitToScreen();
      return;
    }
    if (action === "rotate") {
      void rotateCurrentImage();
    }
  });

  labelsAddBtn?.addEventListener("click", () => {
    openComposer();
  });
  labelsConfirmBtn?.addEventListener("click", () => {
    void confirmAddLabel();
  });
  labelsCancelBtn?.addEventListener("click", () => {
    closeComposer();
  });
  labelsComposerInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmAddLabel();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeComposer();
    }
  });

  labelsList?.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".labels-list__delete");
    if (deleteBtn) {
      event.stopPropagation();
      openDeleteDialog(Number(deleteBtn.dataset.labelId));
      return;
    }
    const saveBtn = event.target.closest(".labels-list__save");
    if (saveBtn) {
      event.stopPropagation();
      void confirmRenameLabel();
      return;
    }
    const item = event.target.closest(".labels-list__item");
    if (!item || !labelsList.contains(item) || item.classList.contains("is-editing")) return;
    const id = Number(item.dataset.labelId);
    if (state.selectedLabelId === id) {
      startLabelEdit(id);
      return;
    }
    setSelectedLabelId(id);
    if (state.selectedDetectionIndex != null) {
      void persistDetectionLabel(state.selectedDetectionIndex, id);
    }
  });

  labelsList?.addEventListener("keydown", (event) => {
    if (!event.target.classList?.contains("labels-list__edit-input")) return;
    if (event.key === "Enter") {
      event.preventDefault();
      void confirmRenameLabel();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelLabelEdit();
    }
  });

  document.addEventListener(
    "click",
    (event) => {
      if (state.editingLabelId == null || state.savingLabel) return;
      const target = event.target;
      if (!(target instanceof Element)) {
        cancelLabelEdit();
        return;
      }
      if (target.closest(".labels-list__item.is-editing")) return;
      if (target.closest(".labels-list__item")) return;
      cancelLabelEdit();
    },
    true,
  );

  function isDeleteDialogOpen() {
    return Boolean(deleteLabelOverlay && !deleteLabelOverlay.hidden);
  }

  deleteLabelCloseBtn?.addEventListener("click", () => closeDeleteDialog());
  deleteLabelCancelBtn?.addEventListener("click", () => closeDeleteDialog());
  deleteLabelConfirmBtn?.addEventListener("click", () => {
    void confirmDeleteLabel();
  });
  deleteLabelOverlay?.addEventListener("click", (event) => {
    if (event.target === deleteLabelOverlay) closeDeleteDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (isDeleteDialogOpen()) {
      event.preventDefault();
      closeDeleteDialog();
    }
  });

  skipStartBtn?.addEventListener("click", () => setFrame(0));
  rewindBtn?.addEventListener("click", () => setFrame(state.frameIndex - SKIP_STEP));
  stepBackBtn?.addEventListener("click", () => setFrame(state.frameIndex - 1));
  playBtn?.addEventListener("click", () => togglePlay());
  stepForwardBtn?.addEventListener("click", () => setFrame(state.frameIndex + 1));
  forwardBtn?.addEventListener("click", () => setFrame(state.frameIndex + SKIP_STEP));
  skipEndBtn?.addEventListener("click", () => setFrame(lastFrameIndex()));

  slider?.addEventListener("input", () => {
    stopPlay();
    setFrame(Number(slider.value));
  });

  frameInput?.addEventListener("change", () => {
    stopPlay();
    setFrame(Number(frameInput.value));
  });

  detectionsList?.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".detections-list__delete");
    if (deleteBtn && detectionsList.contains(deleteBtn)) {
      event.stopPropagation();
      void persistDeleteDetection(Number(deleteBtn.dataset.index));
      return;
    }
    const item = event.target.closest(".detections-list__item");
    if (!item || !detectionsList.contains(item)) return;
    setSelectedDetection(Number(item.dataset.index));
  });

  assetsList?.addEventListener("click", (event) => {
    const item = event.target.closest(".assets-list__item");
    if (!item || !assetsList.contains(item)) return;
    stopPlay();
    setFrame(Number(item.dataset.frameIndex));
  });

  fileMenuBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFileMenu();
  });

  selectFolderMenuItem?.addEventListener("click", () => {
    void selectImagesFolder();
  });

  gotoStartupMenuItem?.addEventListener("click", () => {
    void closeWorkspace();
  });

  document.addEventListener("click", (event) => {
    if (!fileMenuDropdown || fileMenuDropdown.hidden) return;
    if (event.target.closest("#file-menu")) return;
    closeFileMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeFileMenu();
  });

  function isTypingTarget(target) {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return Boolean(target.closest("[contenteditable='true']"));
  }

  document.addEventListener("keydown", (event) => {
    if (!state.filePath || state.files.length === 0) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isDeleteDialogOpen()) return;
    if (isTypingTarget(event.target)) return;
    const key = event.key;
    if (key === "Delete" || key === "Backspace") {
      if (state.selectedDetectionIndex == null || boxEdit || boxDraw) return;
      event.preventDefault();
      void persistDeleteDetection(state.selectedDetectionIndex);
      return;
    }
    if (key === "w" || key === "W") {
      event.preventDefault();
      window.selectWorkspaceTool?.(state.currentTool === "box" ? "cursor" : "box");
      return;
    }
    let delta = 0;
    if (key === "a" || key === "A" || key === "ArrowLeft") delta = -1;
    else if (key === "d" || key === "D" || key === "ArrowRight") delta = 1;
    else return;
    event.preventDefault();
    stopPlay();
    setFrame(state.frameIndex + delta);
  });

  window.showWorkspace = showWorkspace;
  window.selectImagesFolder = selectImagesFolder;
  window.setWorkspaceTool = setWorkspaceTool;
  window.zoomWorkspace = (direction) => {
    if (direction < 0) zoomOut();
    else zoomIn();
  };
  window.rotateCurrentImage = rotateCurrentImage;
})();
