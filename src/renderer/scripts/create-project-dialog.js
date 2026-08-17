(function () {
  const log =
    window.VisionForgeLogger?.create("create-project") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const overlay = document.getElementById("create-project-overlay");
  const nameInput = document.getElementById("create-project-name");
  const locationInput = document.getElementById("create-project-location");
  const hint = document.getElementById("create-project-hint");
  const errorEl = document.getElementById("create-project-error");
  const browseBtn = document.getElementById("btn-create-project-browse");
  const nextBtn = document.getElementById("btn-create-project-next");
  const cancelBtn = document.getElementById("btn-create-project-cancel");
  const closeBtn = document.getElementById("btn-create-project-close");

  if (!overlay) return;

  log.debug("create-project-dialog.js init");

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

  function updateHint() {
    if (!hint) return;
    const location = locationInput?.value?.trim() || "";
    hint.textContent = location
      ? `Project will be created in "${location}"`
      : 'Project will be created in ""';
  }

  function closeDialog() {
    overlay.hidden = true;
    setError("");
    log.debug("create-project dialog closed");
  }

  function openDialog() {
    if (nameInput) nameInput.value = "Untitled";
    if (locationInput) locationInput.value = "";
    updateHint();
    setError("");
    overlay.hidden = false;
    nameInput?.focus();
    nameInput?.select();
    log.info("create-project dialog opened");
  }

  async function pickFolder() {
    const startedAt = log.enter("pickFolder");
    try {
      const result = await window.visionforge?.selectProjectFolder?.();
      if (!result?.ok) {
        setError("Could not open the folder picker.");
        log.exit("pickFolder", startedAt, { ok: false });
        return;
      }
      if (result.canceled) {
        log.exit("pickFolder", startedAt, { canceled: true });
        return;
      }
      if (locationInput) locationInput.value = result.folderPath || "";
      updateHint();
      setError("");
      log.exit("pickFolder", startedAt, { folderPath: result.folderPath });
    } catch (err) {
      setError("Could not open the folder picker.");
      log.error("pickFolder failed", { error: String(err?.message || err) });
      log.exit("pickFolder", startedAt, { error: true });
    }
  }

  function reasonMessage(reason) {
    if (reason === "exists") return "A project file with this name already exists in that folder.";
    if (reason === "missing-location") return "Choose a location for the project.";
    if (reason === "invalid-location") return "The selected location is not a valid folder.";
    return "Could not create the project.";
  }

  async function submitCreate() {
    const name = nameInput?.value?.trim() || "";
    const location = locationInput?.value?.trim() || "";
    if (!name) {
      setError("Enter a project name.");
      nameInput?.focus();
      return;
    }
    if (!location) {
      setError("Choose a location for the project.");
      return;
    }

    const startedAt = log.enter("submitCreate");
    nextBtn.disabled = true;
    try {
      const result = await window.visionforge?.createProject?.(name, location);
      if (!result?.ok) {
        setError(reasonMessage(result?.reason));
        log.exit("submitCreate", startedAt, { ok: false, reason: result?.reason || "unknown" });
        return;
      }
      log.info("project created", { filePath: result.filePath, name: result.name });
      log.exit("submitCreate", startedAt, { ok: true });
      closeDialog();
    } catch (err) {
      setError("Could not create the project.");
      log.error("submitCreate failed", { error: String(err?.message || err) });
      log.exit("submitCreate", startedAt, { error: true });
    } finally {
      nextBtn.disabled = false;
    }
  }

  nameInput?.addEventListener("input", () => setError(""));
  locationInput?.addEventListener("click", () => {
    pickFolder();
  });
  browseBtn?.addEventListener("click", () => {
    pickFolder();
  });
  nextBtn?.addEventListener("click", () => {
    submitCreate();
  });
  cancelBtn?.addEventListener("click", () => closeDialog());
  closeBtn?.addEventListener("click", () => closeDialog());

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeDialog();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (overlay.hidden) return;
    closeDialog();
  });

  window.openCreateProjectDialog = openDialog;
})();
