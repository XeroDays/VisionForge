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

  startPage.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-start-action]");
    if (!actionEl || !startPage.contains(actionEl)) return;

    const action = actionEl.dataset.startAction;
    log.debug("start-page action", {
      action,
      projectName: actionEl.dataset.projectName || null,
    });
  });
})();
