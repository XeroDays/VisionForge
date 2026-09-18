(function () {
  const log =
    window.VisionForgeLogger?.create("settings") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const overlay = document.getElementById("settings-overlay");
  const openBtn = document.getElementById("btn-settings");
  const closeBtn = document.getElementById("btn-settings-close");
  const cancelBtn = document.getElementById("btn-settings-cancel");
  const applyBtn = document.getElementById("btn-settings-apply");
  const modelInput = document.getElementById("settings-model-path");
  const modelBrowseBtn = document.getElementById("btn-settings-model-browse");
  const typeDropdown = document.getElementById("settings-model-type-dropdown");
  const typeButton = document.getElementById("settings-model-type-button");
  const typeButtonLabel = document.getElementById("settings-model-type-button-label");
  const typeList = document.getElementById("settings-model-type-list");
  const confidenceInput = document.getElementById("settings-confidence");
  const confidenceValue = document.getElementById("settings-confidence-value");
  const confidenceHint = document.getElementById("settings-confidence-hint");
  const sectionButtons = Array.from(document.querySelectorAll("[data-settings-section]"));

  if (!overlay) return;

  const TYPES = window.VisionForgeAiModelTypes?.TYPES || [];
  const DEFAULT_TYPE = window.VisionForgeAiModelTypes?.DEFAULT_TYPE || "object-detection";
  const DEFAULT_CONFIDENCE = window.VisionForgeAiModelTypes?.DEFAULT_CONFIDENCE ?? 0.25;
  const isTypeAvailable = window.VisionForgeAiModelTypes?.isTypeAvailable || (() => true);
  const normalizeConfidence =
    window.VisionForgeAiModelTypes?.normalizeConfidence || ((value) => Number(value) || DEFAULT_CONFIDENCE);
  const firstAvailable = TYPES.find((t) => !t.comingSoon);
  const MODEL_FILTERS = [{ name: "ONNX model", extensions: ["onnx"] }];

  let selectedTypeId = firstAvailable?.id || DEFAULT_TYPE;
  let typeHighlight = 0;
  let typeListFilled = false;

  log.debug("settings-dialog.js init");

  function isOpen() {
    return Boolean(overlay && !overlay.hidden);
  }

  function getSelectedType() {
    return TYPES.find((item) => item.id === selectedTypeId) || firstAvailable || TYPES[0] || null;
  }

  function typeOptionButtons() {
    return [...(typeList?.querySelectorAll(".create-project-dropdown__option") || [])];
  }

  function isTypeOpen() {
    return Boolean(typeDropdown && typeDropdown.classList.contains("is-open"));
  }

  function updateTypeHighlight() {
    const options = typeOptionButtons();
    options.forEach((option, index) => {
      const isHighlighted = index === typeHighlight && !option.disabled;
      option.classList.toggle("is-active", isHighlighted);
      option.setAttribute("aria-selected", option.dataset.typeId === selectedTypeId ? "true" : "false");
    });
    if (!options[typeHighlight]?.disabled) {
      options[typeHighlight]?.scrollIntoView({ block: "nearest" });
    }
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
    const idx = TYPES.findIndex((item) => item.id === selectedTypeId);
    typeHighlight = Math.max(0, idx);
    typeDropdown.classList.add("is-open");
    typeList.hidden = false;
    typeButton?.setAttribute("aria-expanded", "true");
    positionTypeList();
    updateTypeHighlight();
  }

  function setSelectedType(id) {
    if (!isTypeAvailable(id)) return;
    selectedTypeId = id;
    const type = getSelectedType();
    if (typeButtonLabel) typeButtonLabel.textContent = type?.label || "";
    updateTypeHighlight();
  }

  function chooseHighlightedType() {
    const type = TYPES[typeHighlight];
    if (!type || type.comingSoon) return;
    setSelectedType(type.id);
    closeTypeDropdown();
  }

  function fillTypes() {
    if (!typeList || typeListFilled) return;
    typeList.replaceChildren();
    TYPES.forEach((type, index) => {
      const item = document.createElement("li");
      const option = document.createElement("button");
      option.type = "button";
      option.className = "create-project-dropdown__option";
      option.setAttribute("role", "option");
      option.dataset.typeId = type.id;
      option.dataset.index = String(index);

      const labelSpan = document.createElement("span");
      labelSpan.className = "create-project-dropdown__option-label";
      labelSpan.textContent = type.label;
      option.appendChild(labelSpan);

      if (type.comingSoon) {
        option.disabled = true;
        option.setAttribute("aria-disabled", "true");
        option.classList.add("is-coming-soon");
        const badge = document.createElement("span");
        badge.className = "create-project-dropdown__coming-soon";
        badge.textContent = "Coming soon";
        option.appendChild(badge);
      } else {
        option.addEventListener("click", () => {
          typeHighlight = index;
          setSelectedType(type.id);
          closeTypeDropdown();
        });
        option.addEventListener("mouseenter", () => {
          typeHighlight = index;
          updateTypeHighlight();
        });
      }

      item.appendChild(option);
      typeList.appendChild(item);
    });
    typeListFilled = true;
  }

  function confidenceToPercent(value) {
    return Math.round(normalizeConfidence(value) * 100);
  }

  function setConfidenceUi(value, enabled) {
    const percent = confidenceToPercent(value);
    if (confidenceInput) {
      confidenceInput.value = String(percent);
      confidenceInput.disabled = !enabled;
    }
    if (confidenceValue) confidenceValue.textContent = `${percent}%`;
    if (confidenceHint) confidenceHint.hidden = enabled;
  }

  function selectSection(sectionId) {
    sectionButtons.forEach((btn) => {
      const selected = btn.dataset.settingsSection === sectionId;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  async function loadFields() {
    fillTypes();
    const projectOpen = Boolean(window.isWorkspaceOpen?.());
    try {
      const config = await window.visionforge?.getConfiguration?.();
      if (modelInput) modelInput.value = String(config?.onnxModelPath || "").trim();
      const stored = config?.onnxModelType || DEFAULT_TYPE;
      setSelectedType(isTypeAvailable(stored) ? stored : DEFAULT_TYPE);
    } catch (err) {
      log.warn("could not load configuration", { error: String(err?.message || err) });
      if (modelInput) modelInput.value = "";
      setSelectedType(DEFAULT_TYPE);
    }
    const confidence = projectOpen
      ? window.getWorkspaceConfidence?.() ?? DEFAULT_CONFIDENCE
      : DEFAULT_CONFIDENCE;
    setConfidenceUi(confidence, projectOpen);
  }

  async function openSettings() {
    const startedAt = log.enter("openSettings");
    await loadFields();
    selectSection("ai-model");
    overlay.hidden = false;
    log.info("settings opened");
    log.exit("openSettings", startedAt, { ok: true });
  }

  function closeSettings() {
    if (!isOpen()) return;
    closeTypeDropdown();
    overlay.hidden = true;
    log.info("settings closed");
  }

  async function pickModel() {
    const startedAt = log.enter("pickModel");
    try {
      const result = await window.visionforge?.selectOpenFile?.({
        title: "Select ONNX model",
        filters: MODEL_FILTERS,
        defaultPath: modelInput?.value?.trim() || "",
      });
      if (!result?.ok || result.canceled || !result.filePath) {
        log.exit("pickModel", startedAt, { canceled: true });
        return;
      }
      if (modelInput) modelInput.value = result.filePath;
      log.info("settings model selected", { filePath: result.filePath });
      log.exit("pickModel", startedAt, { ok: true });
    } catch (err) {
      log.error("pickModel failed", { error: String(err?.message || err) });
      log.exit("pickModel", startedAt, { error: true });
    }
  }

  async function applySettings() {
    const startedAt = log.enter("applySettings");
    const onnxModelPath = modelInput?.value?.trim() || "";
    const onnxModelType = isTypeAvailable(selectedTypeId) ? selectedTypeId : DEFAULT_TYPE;
    const projectOpen = Boolean(window.isWorkspaceOpen?.());
    const onnxConfidence = normalizeConfidence(Number(confidenceInput?.value || 25) / 100);
    try {
      const result = await window.visionforge?.updateConfiguration?.({ onnxModelPath, onnxModelType });
      if (!result?.ok) {
        log.warn("could not save configuration", { reason: result?.reason });
        log.exit("applySettings", startedAt, { ok: false });
        return;
      }
      if (projectOpen) {
        const filePath = window.getWorkspaceFilePath?.();
        if (filePath) {
          const updated = await window.visionforge?.updateProject?.(filePath, { onnxConfidence });
          if (!updated?.ok) {
            log.warn("could not save project confidence", { reason: updated?.reason });
            log.exit("applySettings", startedAt, { ok: false, reason: updated?.reason });
            return;
          }
          window.setWorkspaceConfidence?.(updated.project?.onnxConfidence ?? onnxConfidence);
        }
      }
      log.info("configuration saved", {
        onnxModelType,
        hasPath: Boolean(onnxModelPath),
        onnxConfidence: projectOpen ? onnxConfidence : undefined,
      });
      closeSettings();
      log.exit("applySettings", startedAt, { ok: true });
    } catch (err) {
      log.error("applySettings failed", { error: String(err?.message || err) });
      log.exit("applySettings", startedAt, { error: true });
    }
  }

  openBtn?.addEventListener("click", () => {
    void openSettings();
  });
  closeBtn?.addEventListener("click", closeSettings);
  cancelBtn?.addEventListener("click", closeSettings);
  applyBtn?.addEventListener("click", () => {
    void applySettings();
  });
  modelBrowseBtn?.addEventListener("click", () => {
    void pickModel();
  });
  modelInput?.addEventListener("click", () => {
    void pickModel();
  });
  confidenceInput?.addEventListener("input", () => {
    const percent = Number(confidenceInput.value) || 25;
    if (confidenceValue) confidenceValue.textContent = `${percent}%`;
  });
  typeButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isTypeOpen()) closeTypeDropdown();
    else openTypeDropdown();
  });
  sectionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectSection(btn.dataset.settingsSection);
    });
  });

  document.addEventListener("click", (event) => {
    if (!isTypeOpen()) return;
    if (typeDropdown?.contains(event.target) || typeList?.contains(event.target)) return;
    closeTypeDropdown();
  });

  window.addEventListener("resize", () => {
    if (isTypeOpen()) positionTypeList();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      if (!isOpen() || !isTypeOpen()) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        let next = typeHighlight + 1;
        while (next < TYPES.length && TYPES[next]?.comingSoon) next += 1;
        if (next < TYPES.length) typeHighlight = next;
        updateTypeHighlight();
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        let prev = typeHighlight - 1;
        while (prev >= 0 && TYPES[prev]?.comingSoon) prev -= 1;
        if (prev >= 0) typeHighlight = prev;
        updateTypeHighlight();
      }
      if (event.key === "Enter") {
        event.preventDefault();
        chooseHighlightedType();
      }
      return;
    }
    if (!isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    if (isTypeOpen()) {
      closeTypeDropdown();
      return;
    }
    closeSettings();
  });

  window.isSettingsOpen = isOpen;
})();
