(function () {
  const log =
    window.VisionForgeLogger?.create("app-menus") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
    };

  const MENUS = [
    { id: "file", button: "btn-file-menu", dropdown: "file-menu-dropdown", root: "file-menu" },
    { id: "edit", button: "btn-edit-menu", dropdown: "edit-menu-dropdown", root: "edit-menu" },
    { id: "help", button: "btn-help-menu", dropdown: "help-menu-dropdown", root: "help-menu" },
  ].map((menu) => ({
    ...menu,
    buttonEl: document.getElementById(menu.button),
    dropdownEl: document.getElementById(menu.dropdown),
    rootEl: document.getElementById(menu.root),
  }));

  const undoBtn = document.getElementById("btn-edit-undo");
  const redoBtn = document.getElementById("btn-edit-redo");
  const undoLabel = document.getElementById("edit-undo-label");
  const redoLabel = document.getElementById("edit-redo-label");
  const copyBtn = document.getElementById("btn-edit-copy");
  const pasteBtn = document.getElementById("btn-edit-paste");
  const deleteBtn = document.getElementById("btn-edit-delete");
  const shortcutsBtn = document.getElementById("btn-help-shortcuts");
  const aboutBtn = document.getElementById("btn-help-about");

  let openId = null;

  function setMenuOpen(menu, open) {
    if (!menu?.buttonEl || !menu.dropdownEl) return;
    menu.dropdownEl.hidden = !open;
    menu.buttonEl.classList.toggle("is-open", open);
    menu.buttonEl.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function closeAll() {
    MENUS.forEach((menu) => setMenuOpen(menu, false));
    openId = null;
  }

  function openMenu(id) {
    const menu = MENUS.find((item) => item.id === id);
    if (!menu) return;
    MENUS.forEach((item) => setMenuOpen(item, item.id === id));
    openId = id;
    if (id === "edit") refreshEditMenu();
    log.debug("menu opened", { id });
  }

  function toggleMenu(id) {
    if (openId === id) {
      closeAll();
      return;
    }
    openMenu(id);
  }

  function capitalize(text) {
    const value = String(text || "").trim();
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function refreshEditMenu() {
    const history = window.VisionForgeHistory;
    const projectOpen = Boolean(window.isWorkspaceOpen?.());
    const key = window.getWorkspaceHistoryKey?.() || "";
    const undoEntry = projectOpen && history ? history.peekUndo(key) : null;
    const redoEntry = projectOpen && history ? history.peekRedo(key) : null;

    if (undoBtn) undoBtn.disabled = !undoEntry;
    if (redoBtn) redoBtn.disabled = !redoEntry;
    if (undoLabel) undoLabel.textContent = undoEntry ? `Undo ${undoEntry.verb}` : "Undo";
    if (redoLabel) redoLabel.textContent = redoEntry ? `Redo ${redoEntry.verb}` : "Redo";

    const hasSelection = projectOpen && Boolean(window.hasSelectedDetection?.());
    if (copyBtn) copyBtn.disabled = !hasSelection;
    if (deleteBtn) deleteBtn.disabled = !hasSelection;
    if (pasteBtn) pasteBtn.disabled = !(projectOpen && window.hasWorkspaceClipboard?.());
  }

  MENUS.forEach((menu) => {
    menu.buttonEl?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu(menu.id);
    });
    menu.buttonEl?.addEventListener("mouseenter", () => {
      if (openId && openId !== menu.id) openMenu(menu.id);
    });
    menu.dropdownEl?.addEventListener("click", (event) => {
      const item = event.target.closest(".app-menubar__dropdown-item");
      if (item && !item.disabled) closeAll();
    });
  });

  document.addEventListener("click", (event) => {
    if (!openId) return;
    if (event.target.closest(".app-menubar__menu")) return;
    closeAll();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openId) {
      closeAll();
      return;
    }
    if (event.key === "F1") {
      event.preventDefault();
      closeAll();
      window.openShortcutsDialog?.();
    }
  });

  undoBtn?.addEventListener("click", () => {
    void window.undoWorkspaceChange?.();
  });
  redoBtn?.addEventListener("click", () => {
    void window.redoWorkspaceChange?.();
  });
  copyBtn?.addEventListener("click", () => {
    window.copySelectedDetection?.();
  });
  pasteBtn?.addEventListener("click", () => {
    void window.pasteWorkspaceClipboard?.();
  });
  deleteBtn?.addEventListener("click", () => {
    window.deleteSelectedDetection?.();
  });
  shortcutsBtn?.addEventListener("click", () => {
    window.openShortcutsDialog?.();
  });
  aboutBtn?.addEventListener("click", () => {
    window.openAboutDialog?.();
  });

  window.VisionForgeHistory?.onChange?.(() => {
    if (openId === "edit") refreshEditMenu();
  });

  window.closeAppMenus = closeAll;
  window.openAppMenu = openMenu;
  window.refreshEditMenu = refreshEditMenu;

  log.debug("app-menus.js init");
})();
