(function () {
  const log =
    window.VisionForgeLogger?.create("batch-detect") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const overlay = document.getElementById("batch-detect-overlay");
  const skipInput = document.getElementById("batch-detect-skip");
  const progressWrap = document.getElementById("batch-detect-progress");
  const progressBar = document.getElementById("batch-detect-progress-bar");
  const progressPercent = document.getElementById("batch-detect-progress-percent");
  const statusEl = document.getElementById("batch-detect-status");
  const reviewList = document.getElementById("batch-detect-review");
  const closeBtn = document.getElementById("btn-batch-detect-close");
  const cancelBtn = document.getElementById("btn-batch-detect-cancel");
  const startBtn = document.getElementById("btn-batch-detect-start");
  const magicMenu = document.getElementById("magic-context-menu");
  const magicAllBtn = document.getElementById("btn-magic-context-all");
  const magicTool = document.getElementById("tool-magic");

  if (!overlay) return;

  let busy = false;
  let unsubscribe = null;

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.hidden = !message;
    statusEl.textContent = message || "";
  }

  function setProgress(current, total, name, count) {
    if (progressWrap) progressWrap.hidden = false;
    const safeTotal = Math.max(Number(total) || 0, 1);
    const percent = Math.round((Math.min(current, safeTotal) / safeTotal) * 100);
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (name) setStatus(`${current} / ${total} — ${name} (${count})`);
  }

  function renderReview(names) {
    if (!reviewList) return;
    reviewList.replaceChildren();
    if (!names?.length) {
      reviewList.hidden = true;
      return;
    }
    const heading = document.createElement("li");
    heading.textContent = "Images with no detections";
    heading.className = "batch-detect-review__heading";
    reviewList.appendChild(heading);
    names.forEach((name) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name;
      button.addEventListener("click", () => {
        const files = window.getWorkspaceFiles?.() || [];
        const index = files.findIndex((file) => file.name === name);
        if (index >= 0) window.setWorkspaceFrame?.(index);
        close();
      });
      li.appendChild(button);
      reviewList.appendChild(li);
    });
    reviewList.hidden = false;
  }

  function reset() {
    busy = false;
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Start";
    }
    if (skipInput) skipInput.disabled = false;
    if (progressWrap) progressWrap.hidden = true;
    if (progressBar) progressBar.style.width = "0%";
    if (progressPercent) progressPercent.textContent = "0%";
    setStatus("");
    if (reviewList) {
      reviewList.hidden = true;
      reviewList.replaceChildren();
    }
  }

  function closeMagicMenu() {
    if (magicMenu) magicMenu.hidden = true;
  }

  function open() {
    if (!window.isWorkspaceOpen?.()) return;
    closeMagicMenu();
    reset();
    overlay.hidden = false;
    log.debug("batch detect dialog opened");
  }

  function close() {
    if (busy) {
      void window.visionforge?.cancelBatchDetect?.();
      return;
    }
    overlay.hidden = true;
  }

  async function start() {
    if (busy) return;
    const filePath = window.getWorkspaceFilePath?.();
    if (!filePath) return;
    busy = true;
    if (startBtn) startBtn.disabled = true;
    if (skipInput) skipInput.disabled = true;
    setStatus("Starting…");
    if (progressWrap) progressWrap.hidden = false;
    unsubscribe?.();
    unsubscribe = window.visionforge?.onBatchDetectProgress?.((progress) => {
      setProgress(progress?.current || 0, progress?.total || 0, progress?.name || "", progress?.count || 0);
    });
    try {
      const result = await window.visionforge?.runBatchDetect?.(filePath, {
        skipLabeled: Boolean(skipInput?.checked),
      });
      if (!result?.ok && result?.reason !== "cancelled") {
        const reasons = {
          "missing-model": "Select an AI model in Settings first.",
          "missing-images-folder": "Select an image folder first.",
          "unsupported-type": "This model type is not supported yet.",
        };
        setStatus(reasons[result?.reason] || "Auto detect failed.");
        log.warn("batch detect failed", { reason: result?.reason });
        return;
      }
      if (result?.assets) {
        window.refreshWorkspaceImages?.(
          result.imagesFolder || window.getWorkspaceImagesFolder?.(),
          result.files || window.getWorkspaceFiles?.(),
          result.assets,
        );
      }
      (result?.touched || []).forEach((name) => window.VisionForgeHistory?.clear?.(name));
      const empty = result?.emptyNames || [];
      setStatus(
        result?.reason === "cancelled"
          ? `Stopped after ${result.processed || 0} images.`
          : `Finished ${result.processed || 0} images. ${empty.length} with no detections.`,
      );
      renderReview(empty);
      log.info("batch detect closed", { processed: result?.processed || 0, empty: empty.length });
    } catch (err) {
      setStatus("Auto detect failed.");
      log.error("batch detect failed", { error: String(err?.message || err) });
    } finally {
      unsubscribe?.();
      unsubscribe = null;
      busy = false;
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = "Run again";
      }
      if (skipInput) skipInput.disabled = false;
    }
  }

  closeBtn?.addEventListener("click", () => {
    if (busy) void window.visionforge?.cancelBatchDetect?.();
    else close();
  });
  cancelBtn?.addEventListener("click", () => {
    if (busy) void window.visionforge?.cancelBatchDetect?.();
    else close();
  });
  startBtn?.addEventListener("click", () => {
    void start();
  });
  overlay?.addEventListener("click", (event) => {
    if (event.target !== overlay || busy) return;
    close();
  });

  magicTool?.addEventListener("contextmenu", (event) => {
    if (!magicTool || magicTool.hidden) return;
    event.preventDefault();
    if (!magicMenu) return;
    magicMenu.hidden = false;
    magicMenu.style.left = `${event.clientX}px`;
    magicMenu.style.top = `${event.clientY}px`;
  });
  magicAllBtn?.addEventListener("click", () => {
    closeMagicMenu();
    open();
  });
  document.addEventListener("click", (event) => {
    if (!magicMenu || magicMenu.hidden) return;
    if (event.target.closest("#magic-context-menu")) return;
    closeMagicMenu();
  });

  window.openBatchDetectDialog = open;
  window.closeBatchDetectDialog = close;
})();