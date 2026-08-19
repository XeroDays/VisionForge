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
  const MIN_ZOOM = 0.25;
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
  const loadingOverlay = document.getElementById("loading-project-overlay");
  const viewToolbar = document.getElementById("view-toolbar");
  const viewMoveBtn = document.getElementById("view-tool-move");
  const breadcrumb = document.getElementById("app-breadcrumb");
  const selectImagesBtn = document.getElementById("tool-select-images");
  const toolsDivider = document.getElementById("tools-rail-divider");
  const toolsRail = document.getElementById("tools-rail");
  const inspectorPanel = document.getElementById("inspector-panel");
  const inspectorResizeHandle = document.getElementById("inspector-resize-handle");
  const fileMenuBtn = document.getElementById("btn-file-menu");
  const fileMenuDropdown = document.getElementById("file-menu-dropdown");
  const selectFolderMenuItem = document.getElementById("btn-select-image-folder");
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
    assets: [],
    assetsByName: new Map(),
  };

  let fitScale = 1;
  let panning = false;
  let panLastX = 0;
  let panLastY = 0;
  let lastFrameWheelAt = 0;
  let boxEdit = null;

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
    if (!visible && state.currentTool === "move") {
      window.selectWorkspaceTool?.("cursor");
    }
  }

  function updateMoveHighlight() {
    const selected = state.currentTool === "move";
    if (!viewMoveBtn) return;
    viewMoveBtn.classList.toggle("is-selected", selected);
    viewMoveBtn.setAttribute("aria-pressed", selected ? "true" : "false");
  }

  function loadPreview() {
    if (!imageEl) return;
    const file = currentFile();
    if (!file) {
      if (workspaceView) workspaceView.hidden = true;
      imageEl.removeAttribute("src");
      clearDetectionOverlay();
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

  function decimalsForSize(size) {
    return Math.max(4, Math.ceil(Math.log10(Math.max(Number(size) || 1, 1))) + 1);
  }

  function normFromPixels(px, size) {
    const dim = Math.max(Number(size) || 1, 1);
    return Number((Math.round(px) / dim).toFixed(decimalsForSize(dim)));
  }

  function rectToValue(rect, imgW, imgH, original) {
    const snapped = snapPixelRect(rect);
    if (isVocValue(original)) {
      return {
        xmin: snapped.x,
        ymin: snapped.y,
        xmax: snapped.x + snapped.width,
        ymax: snapped.y + snapped.height,
      };
    }
    const cx = snapped.x + snapped.width / 2;
    const cy = snapped.y + snapped.height / 2;
    return {
      xc: normFromPixels(cx, imgW),
      yc: normFromPixels(cy, imgH),
      w: Number((snapped.width / imgW).toFixed(decimalsForSize(imgW))),
      h: Number((snapped.height / imgH).toFixed(decimalsForSize(imgH))),
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
    drawDetectionBoxes();
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
      li.title = name;

      const swatch = document.createElement("span");
      swatch.className = "detections-list__swatch";
      swatch.style.background = colorForLabelId(detection?.labelid);

      const nameEl = document.createElement("span");
      nameEl.className = "detections-list__name";
      nameEl.textContent = `${index + 1}. ${name}`;

      li.append(swatch, nameEl);
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
    const max = lastFrameIndex();
    const next = state.files.length === 0 ? 0 : Math.min(max, Math.max(0, Math.round(index)));
    state.frameIndex = next;
    syncPlaybackControls();
    highlightCurrentAsset();
    if (!options.keepView) {
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
    setFrame(0);
    renderAssets();
    log.info("image folder loaded", { folderPath: state.imagesFolder, count: state.files.length });
  }

  function zoomBy(factor, origin) {
    if (!currentFile()) return;
    const oldScale = currentScale();
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom * factor));
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
    stage?.classList.toggle("is-move", state.currentTool === "move");
    if (state.currentTool !== "move") {
      panning = false;
      stage?.classList.remove("is-panning");
    }
    updateMoveHighlight();
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
      if (startPage) startPage.hidden = true;
      canvas.hidden = false;
      setWorkspaceChrome(true);
      if (breadcrumb) breadcrumb.textContent = state.name;
      closeFileMenu();
      closeComposer();
      closeDeleteDialog();
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
      if (state.currentTool === "cursor") {
        if (boxEdit) return;
        const now = Date.now();
        if (now - lastFrameWheelAt < FRAME_WHEEL_COOLDOWN_MS) return;
        lastFrameWheelAt = now;
        stopPlay();
        setFrame(state.frameIndex + (event.deltaY < 0 ? -1 : 1));
        return;
      }
      if (state.currentTool !== "move") return;
      const rect = stage.getBoundingClientRect();
      const origin = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
      zoomBy(event.deltaY < 0 ? ZOOM_IN : ZOOM_OUT, origin);
    },
    { passive: false },
  );

  stage?.addEventListener("pointerdown", (event) => {
    if (state.currentTool !== "move" || event.button !== 0) return;
    if (!currentFile()) return;
    event.preventDefault();
    panning = true;
    panLastX = event.clientX;
    panLastY = event.clientY;
    stage.classList.add("is-panning");
    stage.setPointerCapture?.(event.pointerId);
  });

  stage?.addEventListener("pointermove", (event) => {
    if (!panning) return;
    state.panX += event.clientX - panLastX;
    state.panY += event.clientY - panLastY;
    panLastX = event.clientX;
    panLastY = event.clientY;
    applyView();
  });

  function endPan(event) {
    if (!panning) return;
    panning = false;
    stage?.classList.remove("is-panning");
    if (event?.pointerId != null) {
      stage?.releasePointerCapture?.(event.pointerId);
    }
  }

  stage?.addEventListener("pointerup", endPan);
  stage?.addEventListener("pointercancel", endPan);

  viewToolbar?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  viewToolbar?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-view-tool]");
    if (!btn || !viewToolbar.contains(btn)) return;
    const action = btn.dataset.viewTool;
    if (action === "move") {
      window.selectWorkspaceTool?.("move");
      return;
    }
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
    startLabelEdit(Number(item.dataset.labelId));
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

  window.showWorkspace = showWorkspace;
  window.selectImagesFolder = selectImagesFolder;
  window.setWorkspaceTool = setWorkspaceTool;
  window.zoomWorkspace = (direction) => {
    if (direction < 0) zoomOut();
    else zoomIn();
  };
  window.rotateCurrentImage = rotateCurrentImage;
})();
