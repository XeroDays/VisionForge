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

  const startPage = document.getElementById("start-page");
  const canvas = document.getElementById("workspace-canvas");
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
  };

  log.debug("workspace-canvas.js init");

  function lastFrameIndex() {
    return Math.max(0, state.files.length - 1);
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
    stopPlay();
    setFrame(0);
    renderAssets();
    log.info("image folder loaded", { folderPath: state.imagesFolder, count: state.files.length });
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
      log.info("workspace opened", { filePath: state.filePath, name: state.name });
      await restoreImagesFolder(result.project?.imagesFolder || "");
      log.exit("showWorkspace", startedAt, { ok: true });
    } catch (err) {
      log.error("showWorkspace failed", { error: String(err?.message || err) });
      log.exit("showWorkspace", startedAt, { error: true });
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
})();
