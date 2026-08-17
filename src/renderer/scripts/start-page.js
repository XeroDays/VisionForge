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
  if (!startPage) return;

  log.debug("start-page.js init");

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
    });

    if (action === "create") {
      window.openCreateProjectDialog?.();
    }

    if (action === "open") {
      void openExistingProject();
    }
  });
})();
