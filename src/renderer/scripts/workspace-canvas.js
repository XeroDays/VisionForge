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

  const startPage = document.getElementById("start-page");
  const canvas = document.getElementById("workspace-canvas");
  const stage = document.getElementById("workspace-stage");
  const imageEl = document.getElementById("workspace-image");
  const breadcrumb = document.getElementById("app-breadcrumb");
  const selectImagesBtn = document.getElementById("tool-select-images");
  const toolsDivider = document.getElementById("tools-rail-divider");
  const fileMenuBtn = document.getElementById("btn-file-menu");
  const fileMenuDropdown = document.getElementById("file-menu-dropdown");
  const selectFolderMenuItem = document.getElementById("btn-select-image-folder");
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
  };

  let fitScale = 1;
  let panning = false;
  let panLastX = 0;
  let panLastY = 0;

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
    if (!imageEl) return;
    const scale = currentScale();
    imageEl.style.transform = `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px) scale(${scale})`;
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

  function loadPreview() {
    if (!imageEl) return;
    const file = currentFile();
    if (!file) {
      imageEl.hidden = true;
      imageEl.removeAttribute("src");
      return;
    }
    imageEl.hidden = false;
    imageEl.src = previewSrc(file.filePath, state.previewToken);
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
    if (selectImagesBtn) selectImagesBtn.hidden = !visible;
    if (toolsDivider) toolsDivider.hidden = !visible;
    if (selectFolderMenuItem) selectFolderMenuItem.disabled = !visible;
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

  function setWorkspaceTool(toolId) {
    state.currentTool = toolId || "cursor";
    stage?.classList.toggle("is-move", state.currentTool === "move");
    if (state.currentTool !== "move") {
      panning = false;
      stage?.classList.remove("is-panning");
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
      window.selectInspectorTab?.("assets");
      log.info("workspace opened", { filePath: state.filePath, name: state.name });
      await restoreImagesFolder(result.project?.imagesFolder || "");
      log.exit("showWorkspace", startedAt, { ok: true });
    } catch (err) {
      log.error("showWorkspace failed", { error: String(err?.message || err) });
      log.exit("showWorkspace", startedAt, { error: true });
    }
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

      const folderPath = picked.folderPath;
      const updated = await window.visionforge?.updateProject?.(state.filePath, { imagesFolder: folderPath });
      if (!updated?.ok) {
        log.warn("could not persist imagesFolder", { reason: updated?.reason });
      }

      const listed = await window.visionforge?.listImageFolder?.(folderPath);
      if (!listed?.ok) {
        applyImageList(folderPath, []);
        log.exit("selectImagesFolder", startedAt, { ok: false, reason: listed?.reason });
        return;
      }
      applyImageList(listed.folderPath, listed.files);
      log.exit("selectImagesFolder", startedAt, { folderPath, count: listed.files?.length || 0 });
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
  });

  imageEl?.addEventListener("error", () => {
    log.warn("preview load failed", { src: imageEl?.src || "" });
  });

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
