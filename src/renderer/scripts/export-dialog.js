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
  const browseBtn = document.getElementById("btn-export-browse");
  const confirmBtn = document.getElementById("btn-export-confirm");
  const cancelBtn = document.getElementById("btn-export-cancel");
  const closeBtn = document.getElementById("btn-export-close");
  const openBtn = document.getElementById("btn-export");

  if (!overlay) return;

  const TYPES = window.VisionForgeAnnotationTypes?.TYPES || [];
  let destFolder = "";
  let busy = false;

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

  function selectedMode() {
    return modesEl?.querySelector('input[name="export-annotation-mode"]:checked')?.value || "";
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

  function closeDialog() {
    if (busy) return;
    overlay.hidden = true;
    destFolder = "";
    if (locationInput) locationInput.value = "";
    setError("");
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
    destFolder = "";
    if (locationInput) locationInput.value = "";
    if (typeInput) typeInput.value = typeLabel(ctx.annotationType);
    renderModes(ctx.annotationType, ctx.annotationMode);
    setError("");
    overlay.hidden = false;
    syncConfirm();
    log.debug("export dialog opened", { type: ctx.annotationType, mode: ctx.annotationMode });
  }

  async function pickFolder() {
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
    syncConfirm();
    setError("");
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
        setError(reasons[result?.reason] || "Export failed.");
        log.exit("exportAnnotations", startedAt, { ok: false, reason: result?.reason });
        return;
      }
      log.info("annotations exported", { destFolder, mode, count: result.count });
      log.exit("exportAnnotations", startedAt, { ok: true, count: result.count });
      busy = false;
      closeDialog();
    } catch (err) {
      setError("Export failed.");
      log.error("exportAnnotations failed", { error: String(err?.message || err) });
      log.exit("exportAnnotations", startedAt, { error: true });
    } finally {
      busy = false;
      syncConfirm();
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
