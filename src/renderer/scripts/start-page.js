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

  log.debug("start-page.js init");

  function renderHistory(solutions) {
    if (!recentList) return;
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

  async function openExistingProject() {
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
      window.openCreateProjectDialog?.();
    }

    if (action === "open") {
      void openExistingProject();
    }
  });

  window.refreshSolutionHistory = refreshSolutionHistory;
  void refreshSolutionHistory();
})();
