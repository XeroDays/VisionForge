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
  const typeSelect = document.getElementById("settings-model-type");
  const sectionButtons = Array.from(document.querySelectorAll("[data-settings-section]"));

  if (!overlay) return;

  const TYPES = window.VisionForgeAiModelTypes?.TYPES || [];
  const DEFAULT_TYPE = window.VisionForgeAiModelTypes?.DEFAULT_TYPE || "object-detection";
  const MODEL_FILTERS = [{ name: "ONNX model", extensions: ["onnx"] }];

  log.debug("settings-dialog.js init");

  function isOpen() {
    return Boolean(overlay && !overlay.hidden);
  }

  function fillTypes() {
    if (!typeSelect || typeSelect.options.length) return;
    TYPES.forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      typeSelect.appendChild(option);
    });
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
    try {
      const config = await window.visionforge?.getConfiguration?.();
      if (modelInput) modelInput.value = String(config?.onnxModelPath || "").trim();
      if (typeSelect) typeSelect.value = config?.onnxModelType || DEFAULT_TYPE;
    } catch (err) {
      log.warn("could not load configuration", { error: String(err?.message || err) });
      if (modelInput) modelInput.value = "";
      if (typeSelect) typeSelect.value = DEFAULT_TYPE;
    }
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
    const onnxModelType = typeSelect?.value || DEFAULT_TYPE;
    try {
      const result = await window.visionforge?.updateConfiguration?.({ onnxModelPath, onnxModelType });
      if (!result?.ok) {
        log.warn("could not save configuration", { reason: result?.reason });
        log.exit("applySettings", startedAt, { ok: false });
        return;
      }
      log.info("configuration saved", { onnxModelType, hasPath: Boolean(onnxModelPath) });
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
  sectionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectSection(btn.dataset.settingsSection);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    closeSettings();
  });

  window.isSettingsOpen = isOpen;
})();
