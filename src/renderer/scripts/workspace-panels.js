(function () {
  const log =
    window.VisionForgeLogger?.create("workspace-panels") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const MIN_INSPECTOR_WIDTH = 220;
  const DEFAULT_INSPECTOR_WIDTH = 280;

  const toolsRail = document.getElementById("tools-rail");
  const inspectorPanel = document.getElementById("inspector-panel");
  const resizeHandle = document.getElementById("inspector-resize-handle");
  const screenBody = document.getElementById("screen-body");
  const tabButtons = Array.from(document.querySelectorAll(".inspector-tab"));
  const panes = {
    labels: document.getElementById("panel-labels"),
    detections: document.getElementById("panel-detections"),
  };

  log.debug("workspace-panels.js init");

  function selectTool(toolId) {
    if (!toolsRail) return;
    const buttons = toolsRail.querySelectorAll(".tool-btn");
    buttons.forEach((btn) => {
      const selected = btn.dataset.tool === toolId;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    log.debug("tool selected", { tool: toolId });
  }

  function selectTab(tabId) {
    tabButtons.forEach((btn) => {
      const selected = btn.dataset.tab === tabId;
      btn.classList.toggle("is-selected", selected);
      btn.setAttribute("aria-selected", selected ? "true" : "false");
    });
    Object.entries(panes).forEach(([id, pane]) => {
      if (!pane) return;
      pane.hidden = id !== tabId;
    });
    log.debug("inspector tab selected", { tab: tabId });
  }

  function maxInspectorWidth() {
    const bodyWidth = screenBody?.clientWidth || window.innerWidth;
    return Math.max(MIN_INSPECTOR_WIDTH, Math.floor(bodyWidth * 0.5));
  }

  function setInspectorWidth(width) {
    if (!inspectorPanel) return;
    const clamped = Math.min(maxInspectorWidth(), Math.max(MIN_INSPECTOR_WIDTH, Math.round(width)));
    inspectorPanel.style.width = `${clamped}px`;
    return clamped;
  }

  function startResize(event) {
    if (!inspectorPanel || !resizeHandle) return;
    event.preventDefault();
    resizeHandle.classList.add("is-dragging");
    resizeHandle.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startWidth = inspectorPanel.getBoundingClientRect().width;
    log.debug("inspector resize start", { width: startWidth });

    function onMove(moveEvent) {
      const delta = startX - moveEvent.clientX;
      setInspectorWidth(startWidth + delta);
    }

    function onUp(upEvent) {
      resizeHandle.classList.remove("is-dragging");
      resizeHandle.releasePointerCapture?.(upEvent.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const width = inspectorPanel.getBoundingClientRect().width;
      log.debug("inspector resize end", { width: Math.round(width) });
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  toolsRail?.addEventListener("click", (event) => {
    const btn = event.target.closest(".tool-btn");
    if (!btn || !toolsRail.contains(btn)) return;
    selectTool(btn.dataset.tool);
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectTab(btn.dataset.tab);
    });
  });

  resizeHandle?.addEventListener("pointerdown", startResize);

  setInspectorWidth(DEFAULT_INSPECTOR_WIDTH);
})();
