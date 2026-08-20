(function () {
  const log =
    window.VisionForgeLogger?.create("magic") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const magicBtn = document.getElementById("tool-magic");
  const overlay = document.getElementById("app-alert-overlay");
  const titleEl = document.getElementById("app-alert-title");
  const messageEl = document.getElementById("app-alert-message");
  const closeBtn = document.getElementById("btn-app-alert-close");
  const okBtn = document.getElementById("btn-app-alert-ok");

  const INFER_REASONS = {
    "missing-image": "Image file is missing.",
    "missing-model": "ONNX model file is missing.",
    "invalid-model": "Could not load the ONNX model.",
    "invalid-image": "Could not read the image.",
    "infer-failed": "Model inference failed.",
  };

  let busy = false;

  log.debug("magic-detect.js init");

  function isAlertOpen() {
    return Boolean(overlay && !overlay.hidden);
  }

  function closeAlert() {
    if (!overlay) return;
    overlay.hidden = true;
    if (messageEl) messageEl.textContent = "";
  }

  function showAlert(message, title) {
    if (!overlay) return;
    if (titleEl) titleEl.textContent = title || "Error";
    if (messageEl) messageEl.textContent = message;
    overlay.hidden = false;
  }

  function setBusy(next) {
    busy = Boolean(next);
    if (magicBtn) magicBtn.disabled = busy;
  }

  async function runMagicDetect() {
    if (busy || window.isProcessImageScreenOpen?.() || window.isSettingsOpen?.()) return;
    const current = window.getCurrentWorkspaceImage?.();
    if (!current?.filePath) return;

    const startedAt = log.enter("runMagicDetect");
    setBusy(true);
    try {
      const config = await window.visionforge?.getConfiguration?.();
      const modelPath = String(config?.onnxModelPath || "").trim();
      const modelType = config?.onnxModelType || window.VisionForgeAiModelTypes?.DEFAULT_TYPE;
      if (!modelPath) {
        showAlert("Select an AI model in Settings first.");
        log.exit("runMagicDetect", startedAt, { ok: false, reason: "missing-model" });
        return;
      }
      if (!window.VisionForgeAiModelTypes?.supportsDetection?.(modelType)) {
        showAlert("This model type is not supported yet.");
        log.exit("runMagicDetect", startedAt, { ok: false, reason: "unsupported-type" });
        return;
      }

      const labels = window.getWorkspaceLabels?.() || [];
      const result = await window.visionforge?.runOnnxDetect?.(current.filePath, modelPath, labels);
      if (!result?.ok) {
        showAlert(INFER_REASONS[result?.reason] || "Auto detect failed.");
        log.exit("runMagicDetect", startedAt, { ok: false, reason: result?.reason });
        return;
      }

      const applied = await window.applyWorkspaceDetections?.(result.detections);
      if (!applied?.ok) {
        showAlert("Could not save detections to the solution.");
        log.exit("runMagicDetect", startedAt, { ok: false, reason: applied?.reason });
        return;
      }
      log.info("magic detect finished", { name: current.name, count: applied.count });
      log.exit("runMagicDetect", startedAt, { ok: true, count: applied.count });
    } catch (err) {
      showAlert("Auto detect failed.");
      log.error("runMagicDetect failed", { error: String(err?.message || err) });
      log.exit("runMagicDetect", startedAt, { error: true });
    } finally {
      setBusy(false);
    }
  }

  closeBtn?.addEventListener("click", closeAlert);
  okBtn?.addEventListener("click", closeAlert);
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) closeAlert();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!isAlertOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    closeAlert();
  });

  window.runMagicDetect = runMagicDetect;
  window.showAppAlert = showAlert;
})();
