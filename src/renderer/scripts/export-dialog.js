(function () {
  const log =
    window.VisionForgeLogger?.create("export-dialog") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const overlay = document.getElementById("export-overlay");
  const locationInput = document.getElementById("export-location");
  const typeInput = document.getElementById("export-annotation-type");
  const modesEl = document.getElementById("export-annotation-modes");
  const errorEl = document.getElementById("export-error");
  const progressEl = document.getElementById("export-progress");
  const progressBar = document.getElementById("export-progress-bar");
  const progressPercent = document.getElementById("export-progress-percent");
  const statusEl = document.getElementById("export-status");
  const browseBtn = document.getElementById("btn-export-browse");
  const confirmBtn = document.getElementById("btn-export-confirm");
  const cancelBtn = document.getElementById("btn-export-cancel");
  const closeBtn = document.getElementById("btn-export-close");
  const openBtn = document.getElementById("btn-export");

  if (!overlay) return;

  const TYPES = window.VisionForgeAnnotationTypes?.TYPES || [];
  const DONE_CLOSE_MS = 1500;
  let destFolder = "";
  let busy = false;
  let closeTimer = 0;
  let stopProgress = null;

  log.debug("export-dialog.js init");

  function setError(message) {
    if (!errorEl) return;
    if (!message) {
      errorEl.hidden = true;
      errorEl.textContent = "";
      return;
    }
    errorEl.hidden = false;
    errorEl.textContent = message;
  }

  function setStatus(message) {
    if (!statusEl) return;
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
  }

  function setProgress(current, total) {
    const max = Math.max(Number(total) || 0, 0);
    const value = Math.min(Math.max(Number(current) || 0, 0), max);
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressPercent) progressPercent.textContent = `${pct}%`;
  }

  function showProgress(visible) {
    if (progressEl) progressEl.hidden = !visible;
    if (!visible) setProgress(0, 0);
  }

  function selectedMode() {
    return modesEl?.querySelector('input[name="export-annotation-mode"]:checked')?.value || "";
  }

  function setFormEnabled(enabled) {
    if (locationInput) locationInput.style.pointerEvents = enabled ? "" : "none";
    if (browseBtn) browseBtn.disabled = !enabled;
    if (cancelBtn) cancelBtn.disabled = !enabled;
    modesEl?.querySelectorAll('input[name="export-annotation-mode"]').forEach((input) => {
      input.disabled = !enabled;
    });
  }

  function syncConfirm() {
    if (confirmBtn) confirmBtn.disabled = busy || !destFolder || !selectedMode();
  }

  function typeLabel(typeId) {
    const found = TYPES.find((item) => item.id === typeId);
    return found?.label || typeId || "";
  }

  function renderModes(typeId, modeId) {
    if (!modesEl) return;
    const type = TYPES.find((item) => item.id === typeId);
    modesEl.replaceChildren();
    (type?.modes || []).forEach((mode) => {
      const label = document.createElement("label");
      label.className = "create-project-mode";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "export-annotation-mode";
      input.value = mode.id;
      if (mode.id === modeId) input.checked = true;

      const control = document.createElement("span");
      control.className = "create-project-mode__control";
      control.setAttribute("aria-hidden", "true");

      const span = document.createElement("span");
      span.className = "create-project-mode__text";
      span.textContent = mode.label;

      label.append(input, control, span);
      modesEl.appendChild(label);
    });
  }

  function resetDialog() {
    destFolder = "";
    if (locationInput) locationInput.value = "";
    setError("");
    setStatus("");
    showProgress(false);
    setFormEnabled(true);
  }

  function closeDialog() {
    if (busy) return;
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    overlay.hidden = true;
    resetDialog();
    log.debug("export dialog closed");
  }

  function closeFileMenu() {
    const fileMenuBtn = document.getElementById("btn-file-menu");
    const fileMenuDropdown = document.getElementById("file-menu-dropdown");
    if (fileMenuDropdown) fileMenuDropdown.hidden = true;
    fileMenuBtn?.classList.remove("is-open");
    fileMenuBtn?.setAttribute("aria-expanded", "false");
  }

  function openDialog() {
    const ctx = window.getWorkspaceExportContext?.() || {};
    if (!ctx.filePath) return;
    closeFileMenu();
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }
    resetDialog();
    destFolder = String(ctx.imagesFolder || "").trim();
    if (locationInput) locationInput.value = destFolder;
    if (typeInput) typeInput.value = typeLabel(ctx.annotationType);
    renderModes(ctx.annotationType, ctx.annotationMode);
    overlay.hidden = false;
    syncConfirm();
    log.debug("export dialog opened", { type: ctx.annotationType, mode: ctx.annotationMode, destFolder });
  }

  async function pickFolder() {
    if (busy) return;
    const ctx = window.getWorkspaceExportContext?.() || {};
    const startedAt = log.enter("pickExportFolder");
    try {
      const picked = await window.visionforge?.selectImagesFolder?.(ctx.imagesFolder || ctx.filePath);
      if (!picked?.ok) {
        setError("Could not choose a folder.");
        log.exit("pickExportFolder", startedAt, { ok: false, reason: picked?.reason });
        return;
      }
      if (picked.canceled) {
        log.exit("pickExportFolder", startedAt, { canceled: true });
        return;
      }
      destFolder = String(picked.folderPath || "").trim();
      if (locationInput) locationInput.value = destFolder;
      setError("");
      syncConfirm();
      log.exit("pickExportFolder", startedAt, { destFolder });
    } catch (err) {
      setError("Could not choose a folder.");
      log.error("pickExportFolder failed", { error: String(err?.message || err) });
      log.exit("pickExportFolder", startedAt, { error: true });
    }
  }

  async function submitExport() {
    if (busy) return;
    const ctx = window.getWorkspaceExportContext?.() || {};
    const mode = selectedMode();
    if (!ctx.filePath || !destFolder || !mode) {
      syncConfirm();
      return;
    }

    busy = true;
    setError("");
    setStatus("");
    showProgress(true);
    setProgress(0, 0);
    setFormEnabled(false);
    syncConfirm();
    stopProgress = window.visionforge?.onExportProgress?.((payload) => {
      setProgress(payload?.current, payload?.total);
    });

    const startedAt = log.enter("exportAnnotations");
    try {
      const result = await window.visionforge?.exportAnnotations?.(ctx.filePath, destFolder, mode);
      if (!result?.ok) {
        const reasons = {
          "missing-file": "Project file is missing.",
          "invalid-file": "Project file could not be read.",
          "missing-folder": "Choose an export folder.",
          "invalid-folder": "Export folder is not valid.",
          "missing-images-folder": "Select an image folder first.",
          "missing-mode": "Select an annotation mode.",
        };
        showProgress(false);
        setError(reasons[result?.reason] || "Export failed.");
        log.exit("exportAnnotations", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      const count = Number(result.count) || 0;
      setProgress(count, count);
      showProgress(false);
      setStatus(`Exported ${count} files.`);
      log.info("annotations exported", { destFolder, mode, count });
      log.exit("exportAnnotations", startedAt, { ok: true, count });
      closeTimer = window.setTimeout(() => {
        closeTimer = 0;
        busy = false;
        closeDialog();
      }, DONE_CLOSE_MS);
    } catch (err) {
      showProgress(false);
      setError("Export failed.");
      log.error("exportAnnotations failed", { error: String(err?.message || err) });
      log.exit("exportAnnotations", startedAt, { error: true });
    } finally {
      stopProgress?.();
      stopProgress = null;
      if (!closeTimer) {
        busy = false;
        setFormEnabled(true);
        syncConfirm();
      }
    }
  }

  openBtn?.addEventListener("click", () => {
    openDialog();
  });
  locationInput?.addEventListener("click", () => {
    void pickFolder();
  });
  browseBtn?.addEventListener("click", () => {
    void pickFolder();
  });
  modesEl?.addEventListener("change", () => {
    setError("");
    syncConfirm();
  });
  confirmBtn?.addEventListener("click", () => {
    void submitExport();
  });
  cancelBtn?.addEventListener("click", () => closeDialog());
  closeBtn?.addEventListener("click", () => closeDialog());

  document.addEventListener("keydown", (event) => {
    if (overlay.hidden || event.key !== "Escape") return;
    event.preventDefault();
    closeDialog();
  });
})();
