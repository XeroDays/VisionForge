(function () {
  const log =
    window.VisionForgeLogger?.create("start-page") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
      enter() {
        return Date.now();
      },
      exit() {},
    };

  const startPage = document.getElementById("start-page");
  const recentList = document.getElementById("start-recent-list");
  const recentEmpty = document.getElementById("start-recent-empty");
  if (!startPage) return;

  let pendingRemoveFilePath = "";
  const contextMenu = document.createElement("div");
  contextMenu.id = "recent-context-menu";
  contextMenu.className = "asset-context-menu";
  contextMenu.hidden = true;
  contextMenu.setAttribute("role", "menu");
  contextMenu.setAttribute("aria-label", "Recent project actions");

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "asset-context-menu__item";
  removeBtn.id = "btn-recent-context-remove";
  removeBtn.setAttribute("role", "menuitem");
  removeBtn.textContent = "Remove from list";
  contextMenu.appendChild(removeBtn);
  document.body.appendChild(contextMenu);

  log.debug("start-page.js init");

  function isContextMenuOpen() {
    return !contextMenu.hidden;
  }

  function closeContextMenu() {
    contextMenu.hidden = true;
    pendingRemoveFilePath = "";
  }

  function positionContextMenu(clientX, clientY) {
    const pad = 4;
    const rect = contextMenu.getBoundingClientRect();
    let x = Math.min(clientX, window.innerWidth - rect.width - pad);
    let y = Math.min(clientY, window.innerHeight - rect.height - pad);
    x = Math.max(pad, x);
    y = Math.max(pad, y);
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
  }

  function openContextMenu(event, filePath) {
    const path = String(filePath || "").trim();
    if (!path) return;
    pendingRemoveFilePath = path;
    contextMenu.hidden = false;
    positionContextMenu(event.clientX, event.clientY);
  }

  function renderHistory(solutions) {
    if (!recentList) return;
    closeContextMenu();
    recentList.replaceChildren();
    const items = Array.isArray(solutions) ? solutions : [];

    if (recentEmpty) {
      recentEmpty.hidden = items.length > 0;
    }
    recentList.hidden = items.length === 0;

    items.forEach((item) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "start-recent__row";
      button.dataset.startAction = "recent";
      button.dataset.projectName = item.name || "";
      button.dataset.filePath = item.filePath || "";

      const name = document.createElement("span");
      name.className = "start-recent__name";
      name.textContent = item.name || "Untitled";

      const filePath = document.createElement("span");
      filePath.className = "start-recent__path";
      filePath.textContent = item.filePath || "";

      button.append(name, filePath);
      li.appendChild(button);
      recentList.appendChild(li);
    });
  }

  async function refreshSolutionHistory() {
    const startedAt = log.enter("refreshSolutionHistory");
    try {
      const history = await window.visionforge?.getSolutionHistory?.();
      const solutions = history?.solutions || [];
      renderHistory(solutions);
      log.exit("refreshSolutionHistory", startedAt, { count: solutions.length });
    } catch (err) {
      renderHistory([]);
      log.error("refreshSolutionHistory failed", { error: String(err?.message || err) });
      log.exit("refreshSolutionHistory", startedAt, { error: true });
    }
  }

  function guardForceUpdate() {
    if (typeof window.blockIfForceUpdate === "function" && window.blockIfForceUpdate()) {
      log.info("start-page blocked by force update");
      return true;
    }
    return false;
  }

  async function openExistingProject() {
    if (guardForceUpdate()) return;
    const startedAt = log.enter("openExistingProject");
    try {
      const result = await window.visionforge?.openProjectFile?.();
      if (!result?.ok) {
        log.exit("openExistingProject", startedAt, { ok: false });
        return;
      }
      if (result.canceled) {
        log.exit("openExistingProject", startedAt, { canceled: true });
        return;
      }
      log.info("project file selected", { filePath: result.filePath });
      await refreshSolutionHistory();
      window.showWorkspace?.({ filePath: result.filePath, name: result.name });
      log.exit("openExistingProject", startedAt, { filePath: result.filePath });
    } catch (err) {
      log.error("openExistingProject failed", { error: String(err?.message || err) });
      log.exit("openExistingProject", startedAt, { error: true });
    }
  }

  startPage.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-start-action]");
    if (!actionEl || !startPage.contains(actionEl)) return;

    const action = actionEl.dataset.startAction;
    log.debug("start-page action", {
      action,
      projectName: actionEl.dataset.projectName || null,
      filePath: actionEl.dataset.filePath || null,
    });

    if (action === "create") {
      if (guardForceUpdate()) return;
      window.openCreateProjectDialog?.();
    }

    if (action === "open") {
      void openExistingProject();
    }

    if (action === "recent") {
      if (guardForceUpdate()) return;
      const filePath = actionEl.dataset.filePath;
      if (filePath) {
        window.showWorkspace?.({ filePath, name: actionEl.dataset.projectName });
      }
    }
  });

  recentList?.addEventListener("contextmenu", (event) => {
    const row = event.target.closest(".start-recent__row");
    if (!row || !recentList.contains(row)) return;
    event.preventDefault();
    openContextMenu(event, row.dataset.filePath);
  });

  removeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const filePath = pendingRemoveFilePath;
    closeContextMenu();
    if (!filePath) return;
    void (async () => {
      const startedAt = log.enter("removeHistorySolution");
      try {
        const result = await window.visionforge?.removeHistorySolution?.(filePath);
        if (!result?.ok) {
          log.exit("removeHistorySolution", startedAt, { ok: false });
          return;
        }
        await refreshSolutionHistory();
        log.exit("removeHistorySolution", startedAt, { ok: true, filePath });
      } catch (err) {
        log.error("removeHistorySolution failed", { error: String(err?.message || err) });
        log.exit("removeHistorySolution", startedAt, { error: true });
      }
    })();
  });

  document.addEventListener("click", (event) => {
    if (isContextMenuOpen() && !event.target.closest("#recent-context-menu")) {
      closeContextMenu();
    }
  });

  recentList?.addEventListener("scroll", () => closeContextMenu());

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!isContextMenuOpen()) return;
    if (startPage.hidden) return;
    event.preventDefault();
    closeContextMenu();
  });

  window.refreshSolutionHistory = refreshSolutionHistory;
  void refreshSolutionHistory();
})();
