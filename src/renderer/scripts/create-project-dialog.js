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
  const typeDropdown = document.getElementById("create-project-annotation-type");
  const typeButton = document.getElementById("create-project-type-button");
  const typeButtonLabel = document.getElementById("create-project-type-button-label");
  const typeList = document.getElementById("create-project-type-list");
  const typeHint = document.getElementById("create-project-type-hint");
  const modesEl = document.getElementById("create-project-annotation-modes");

  if (!overlay) return;

  const TYPES = window.VisionForgeAnnotationTypes?.TYPES || [];
  let selectedTypeId = TYPES[0]?.id || "";
  let typeHighlight = 0;

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

  function getSelectedType() {
    return TYPES.find((item) => item.id === selectedTypeId) || TYPES[0] || null;
  }

  function selectedMode() {
    return modesEl?.querySelector('input[name="create-project-annotation-mode"]:checked')?.value || "";
  }

  function isTypeOpen() {
    return Boolean(typeDropdown && typeDropdown.classList.contains("is-open"));
  }

  function typeOptionButtons() {
    return [...(typeList?.querySelectorAll(".create-project-dropdown__option") || [])];
  }

  function updateTypeHighlight() {
    const options = typeOptionButtons();
    options.forEach((option, index) => {
      option.classList.toggle("is-active", index === typeHighlight);
      option.setAttribute("aria-selected", option.dataset.typeId === selectedTypeId ? "true" : "false");
    });
    options[typeHighlight]?.scrollIntoView({ block: "nearest" });
  }

  function closeTypeDropdown() {
    if (!typeDropdown) return;
    typeDropdown.classList.remove("is-open");
    if (typeList) {
      typeList.hidden = true;
      typeList.style.top = "";
      typeList.style.left = "";
      typeList.style.width = "";
    }
    typeButton?.setAttribute("aria-expanded", "false");
  }

  function positionTypeList() {
    if (!typeButton || !typeList || typeList.hidden) return;
    const rect = typeButton.getBoundingClientRect();
    typeList.style.top = `${Math.round(rect.bottom + 4)}px`;
    typeList.style.left = `${Math.round(rect.left)}px`;
    typeList.style.width = `${Math.round(rect.width)}px`;
  }

  function openTypeDropdown() {
    if (!typeDropdown || !typeList) return;
    typeHighlight = Math.max(0, TYPES.findIndex((item) => item.id === selectedTypeId));
    typeDropdown.classList.add("is-open");
    typeList.hidden = false;
    typeButton?.setAttribute("aria-expanded", "true");
    positionTypeList();
    updateTypeHighlight();
  }

  function setSelectedType(id, rebuild = true) {
    selectedTypeId = id;
    const type = getSelectedType();
    if (typeButtonLabel) typeButtonLabel.textContent = type?.label || "";
    updateTypeHighlight();
    if (rebuild) {
      setError("");
      renderModes();
    }
  }

  function chooseHighlightedType() {
    const type = TYPES[typeHighlight];
    if (!type) return;
    setSelectedType(type.id);
    closeTypeDropdown();
  }

  function renderTypeHint(type) {
    if (!typeHint) return;
    if (type?.hint) {
      typeHint.hidden = false;
      typeHint.textContent = type.hint;
    } else {
      typeHint.hidden = true;
      typeHint.textContent = "";
    }
  }

  function renderModes() {
    if (!modesEl) return;
    const type = getSelectedType();
    renderTypeHint(type);
    modesEl.replaceChildren();
    (type?.modes || []).forEach((mode) => {
      const label = document.createElement("label");
      label.className = "create-project-mode";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "create-project-annotation-mode";
      input.value = mode.id;

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

  function populateTypeList() {
    if (!typeList) return;
    typeList.replaceChildren();
    TYPES.forEach((type, index) => {
      const item = document.createElement("li");
      const option = document.createElement("button");
      option.type = "button";
      option.className = "create-project-dropdown__option";
      option.role = "option";
      option.dataset.typeId = type.id;
      option.dataset.index = String(index);
      option.textContent = type.label;
      option.addEventListener("click", () => {
        typeHighlight = index;
        setSelectedType(type.id);
        closeTypeDropdown();
      });
      option.addEventListener("mouseenter", () => {
        typeHighlight = index;
        updateTypeHighlight();
      });
      item.appendChild(option);
      typeList.appendChild(item);
    });
  }

  function resetAnnotation() {
    selectedTypeId = TYPES[0]?.id || "";
    typeHighlight = 0;
    setSelectedType(selectedTypeId, false);
    closeTypeDropdown();
    renderModes();
  }

  function closeDialog() {
    overlay.hidden = true;
    closeTypeDropdown();
    setError("");
    log.debug("create-project dialog closed");
  }

  function openDialog() {
    if (nameInput) nameInput.value = "Untitled";
    if (locationInput) locationInput.value = "";
    resetAnnotation();
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
    if (reason === "invalid-annotation") return "Choose a valid annotation type and mode.";
    return "Could not create the project.";
  }

  async function submitCreate() {
    const name = nameInput?.value?.trim() || "";
    const location = locationInput?.value?.trim() || "";
    const type = getSelectedType()?.id || "";
    const mode = selectedMode();
    if (!name) {
      setError("Enter a project name.");
      nameInput?.focus();
      return;
    }
    if (!location) {
      setError("Choose a location for the project.");
      return;
    }
    if (!mode) {
      setError("Choose an annotation mode.");
      return;
    }

    const startedAt = log.enter("submitCreate");
    nextBtn.disabled = true;
    try {
      const result = await window.visionforge?.createProject?.(name, location, { type, mode });
      if (!result?.ok) {
        setError(reasonMessage(result?.reason));
        log.exit("submitCreate", startedAt, { ok: false, reason: result?.reason || "unknown" });
        return;
      }
      log.info("project created", {
        filePath: result.filePath,
        name: result.name,
        annotationType: type,
        annotationMode: mode,
      });
      log.exit("submitCreate", startedAt, { ok: true });
      closeDialog();
      window.refreshSolutionHistory?.();
      window.showWorkspace?.({ filePath: result.filePath, name: result.name });
    } catch (err) {
      setError("Could not create the project.");
      log.error("submitCreate failed", { error: String(err?.message || err) });
      log.exit("submitCreate", startedAt, { error: true });
    } finally {
      nextBtn.disabled = false;
    }
  }

  populateTypeList();
  resetAnnotation();

  nameInput?.addEventListener("input", () => setError(""));
  modesEl?.addEventListener("change", () => setError(""));
  typeButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isTypeOpen()) closeTypeDropdown();
    else openTypeDropdown();
  });
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

  document.addEventListener("click", (event) => {
    if (!isTypeOpen()) return;
    if (typeDropdown?.contains(event.target) || typeList?.contains(event.target)) return;
    closeTypeDropdown();
  });

  window.addEventListener("resize", () => {
    if (isTypeOpen()) positionTypeList();
  });

  document.addEventListener("keydown", (event) => {
    if (overlay.hidden) return;
    if (event.key === "Escape") {
      if (isTypeOpen()) {
        event.preventDefault();
        closeTypeDropdown();
        return;
      }
      closeDialog();
      return;
    }
    if (!isTypeOpen()) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      typeHighlight = Math.min(TYPES.length - 1, typeHighlight + 1);
      updateTypeHighlight();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      typeHighlight = Math.max(0, typeHighlight - 1);
      updateTypeHighlight();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      chooseHighlightedType();
    }
  });

  window.openCreateProjectDialog = openDialog;
})();
