(function () {
  const log =
    window.VisionForgeLogger?.create("shortcuts-dialog") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
    };

  const overlay = document.getElementById("shortcuts-overlay");
  const body = document.getElementById("shortcuts-body");
  const closeBtn = document.getElementById("btn-shortcuts-close");
  const okBtn = document.getElementById("btn-shortcuts-ok");

  const SECTIONS = [
    {
      title: "Tools",
      rows: [
        [["W"], "Toggle Cursor and the draw tool (Box or Rotated rectangle)"],
        [["Click", "drag"], "Draw a box with the selected label"],
        [["Esc"], "Close menus and dialogs"],
        [["F1"], "Show this list"],
      ],
    },
    {
      title: "Images",
      rows: [
        [["A"], "Previous image"],
        [["D"], "Next image"],
        [["←", "→"], "Previous / next image (no box selected)"],
        [["Shift", "wheel"], "Step through images (Cursor tool)"],
        [["Space"], "Play / pause from the playback bar"],
      ],
    },
    {
      title: "View",
      rows: [
        [["Ctrl", "wheel"], "Zoom toward the pointer"],
        [["Middle drag"], "Pan the image"],
        [["Fit"], "Fit to Screen resets zoom and pan"],
      ],
    },
    {
      title: "Boxes",
      rows: [
        [["Click"], "Select a box; drag body to move, drag a corner to resize"],
        [["←", "↑", "→", "↓"], "Nudge the selected box by 1 px"],
        [["Shift", "arrow"], "Nudge by 10 px"],
        [["Alt", "wheel"], "Rotate the selected box by 1° (rotated projects)"],
        [["Shift", "drag handle"], "Snap rotation to 15°"],
        [["Del"], "Delete the selected box"],
        [["Ctrl", "C"], "Copy the selected box"],
        [["Ctrl", "V"], "Paste the copied box"],
        [["Ctrl", "Z"], "Undo"],
        [["Ctrl", "Y"], "Redo"],
      ],
    },
  ];

  function isOpen() {
    return Boolean(overlay && !overlay.hidden);
  }

  function renderRows() {
    if (!body || body.childElementCount) return;
    SECTIONS.forEach((section) => {
      const group = document.createElement("section");
      group.className = "shortcuts-group";
      const heading = document.createElement("h3");
      heading.className = "shortcuts-group__title";
      heading.textContent = section.title;
      group.appendChild(heading);
      const list = document.createElement("dl");
      list.className = "shortcuts-list";
      section.rows.forEach(([keys, description]) => {
        const dt = document.createElement("dt");
        dt.className = "shortcuts-list__keys";
        keys.forEach((key, index) => {
          if (index > 0) {
            const plus = document.createElement("span");
            plus.className = "shortcuts-list__plus";
            plus.textContent = "+";
            dt.appendChild(plus);
          }
          const kbd = document.createElement("kbd");
          kbd.textContent = key;
          dt.appendChild(kbd);
        });
        const dd = document.createElement("dd");
        dd.className = "shortcuts-list__desc";
        dd.textContent = description;
        list.append(dt, dd);
      });
      group.appendChild(list);
      body.appendChild(group);
    });
  }

  function open() {
    if (!overlay) return;
    renderRows();
    overlay.hidden = false;
    okBtn?.focus();
    log.debug("shortcuts dialog opened");
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    log.debug("shortcuts dialog closed");
  }

  closeBtn?.addEventListener("click", close);
  okBtn?.addEventListener("click", close);
  overlay?.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      close();
    }
  });

  window.openShortcutsDialog = open;
  window.closeShortcutsDialog = close;
  window.isShortcutsDialogOpen = isOpen;
})();
