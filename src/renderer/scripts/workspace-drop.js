(function () {
  const log =
    window.VisionForgeLogger?.create("workspace-drop") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const dropRoot = document.querySelector(".screen-section--main");
  const overlay = document.getElementById("workspace-drop-overlay");
  const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"]);

  if (!dropRoot || !overlay) return;

  let dragDepth = 0;
  let busy = false;

  log.debug("workspace-drop.js init");

  function hasFilePayload(event) {
    const types = event.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes("Files");
  }

  function canAcceptDrop() {
    if (busy) return false;
    if (!window.isWorkspaceOpen?.()) return false;
    if (window.isSettingsOpen?.()) return false;
    if (window.isProcessImageScreenOpen?.()) return false;
    return true;
  }

  function showOverlay() {
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      overlay.classList.add("is-active");
    });
  }

  function hideOverlay() {
    dragDepth = 0;
    overlay.classList.remove("is-active");
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }

  function extensionOf(filePath) {
    const name = String(filePath || "");
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot).toLowerCase() : "";
  }

  function pathsFromDrop(event) {
    const files = Array.from(event.dataTransfer?.files || []);
    const paths = [];
    files.forEach((file) => {
      const filePath = window.visionforge?.getPathForFile?.(file) || "";
      if (!filePath) return;
      if (!IMAGE_EXTENSIONS.has(extensionOf(filePath))) return;
      paths.push(filePath);
    });
    return paths;
  }

  async function handleDrop(event) {
    const startedAt = log.enter("handleDrop");
    hideOverlay();
    if (!canAcceptDrop()) {
      log.exit("handleDrop", startedAt, { ok: false, reason: "not-ready" });
      return;
    }

    const projectPath = window.getWorkspaceFilePath?.();
    const imagesFolder = window.getWorkspaceImagesFolder?.();
    if (!projectPath) {
      log.exit("handleDrop", startedAt, { ok: false, reason: "no-project" });
      return;
    }
    if (!imagesFolder) {
      window.showAppAlert?.("Select an Image Folder first.");
      log.exit("handleDrop", startedAt, { ok: false, reason: "missing-folder" });
      return;
    }

    const sourcePaths = pathsFromDrop(event);
    if (!sourcePaths.length) {
      window.showAppAlert?.("Drop image files only.");
      log.exit("handleDrop", startedAt, { ok: false, reason: "no-images" });
      return;
    }

    busy = true;
    try {
      await window.showWorkspaceLoading?.();
      const result = await window.visionforge?.importDroppedImages?.(projectPath, sourcePaths);
      if (!result?.ok) {
        if (result?.reason === "missing-folder") {
          window.showAppAlert?.("Select an Image Folder first.");
        } else {
          window.showAppAlert?.("Could not add dropped images.");
        }
        log.exit("handleDrop", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      window.refreshWorkspaceImages?.(result.folderPath, result.files, result.project?.assets);
      log.info("dropped images imported", {
        copied: result.copied,
        skipped: result.skipped,
        total: result.files?.length || 0,
      });
      log.exit("handleDrop", startedAt, { ok: true, copied: result.copied, skipped: result.skipped });
    } catch (err) {
      window.showAppAlert?.("Could not add dropped images.");
      log.error("handleDrop failed", { error: String(err?.message || err) });
      log.exit("handleDrop", startedAt, { error: true });
    } finally {
      window.hideWorkspaceLoading?.();
      busy = false;
    }
  }

  dropRoot.addEventListener("dragenter", (event) => {
    if (!hasFilePayload(event) || !canAcceptDrop()) return;
    event.preventDefault();
    dragDepth += 1;
    showOverlay();
  });

  dropRoot.addEventListener("dragover", (event) => {
    if (!hasFilePayload(event) || !canAcceptDrop()) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (overlay.hidden) showOverlay();
  });

  dropRoot.addEventListener("dragleave", (event) => {
    if (!hasFilePayload(event)) return;
    if (!dropRoot.contains(event.relatedTarget)) {
      hideOverlay();
      return;
    }
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hideOverlay();
  });

  dropRoot.addEventListener("drop", (event) => {
    event.preventDefault();
    void handleDrop(event);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (overlay.hidden) return;
    event.preventDefault();
    hideOverlay();
  });
})();
