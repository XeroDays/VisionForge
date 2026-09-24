(function () {
  const REDUCE = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  function showAnimated(el) {
    if (!el) return;
    el.hidden = false;
    if (REDUCE) {
      el.classList.add("is-open");
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add("is-open"));
    });
  }

  function hideAnimated(el) {
    if (!el) return Promise.resolve();
    if (el.hidden) return Promise.resolve();
    el.classList.remove("is-open");
    if (REDUCE) {
      el.hidden = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        el.hidden = true;
        resolve();
      };
      const timer = window.setTimeout(finish, 180);
      el.addEventListener(
        "transitionend",
        (event) => {
          if (event.target !== el) return;
          window.clearTimeout(timer);
          finish();
        },
        { once: true },
      );
    });
  }

  window.VisionForgeMotion = { showAnimated, hideAnimated };
})();
