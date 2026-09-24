(function () {
  const log =
    window.VisionForgeLogger?.create("workspace-history") ?? {
      debug() {},
      info() {},
      warn() {},
      error() {},
    };

  const MAX_ENTRIES = 50;
  const stacks = new Map();
  const listeners = new Set();

  function clone(value) {
    if (value == null) return null;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return null;
    }
  }

  function stackFor(name) {
    const key = String(name || "");
    if (!stacks.has(key)) stacks.set(key, { undo: [], redo: [] });
    return stacks.get(key);
  }

  function notify() {
    listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        log.warn("history listener failed", { error: String(err?.message || err) });
      }
    });
  }

  /**
   * Record the state of one image *before* a change.
   * snapshot = { verb, detections?, labels? } — both fields are deep-cloned.
   */
  function push(name, snapshot) {
    if (!name || !snapshot) return;
    const stack = stackFor(name);
    stack.undo.push({
      verb: String(snapshot.verb || "change"),
      name: String(name),
      detections: snapshot.detections === undefined ? undefined : clone(snapshot.detections),
      labels: snapshot.labels === undefined ? undefined : clone(snapshot.labels),
    });
    if (stack.undo.length > MAX_ENTRIES) stack.undo.splice(0, stack.undo.length - MAX_ENTRIES);
    stack.redo.length = 0;
    log.debug("history push", { name, verb: snapshot.verb, depth: stack.undo.length });
    notify();
  }

  function peekUndo(name) {
    const stack = stacks.get(String(name || ""));
    return stack?.undo.length ? stack.undo[stack.undo.length - 1] : null;
  }

  function peekRedo(name) {
    const stack = stacks.get(String(name || ""));
    return stack?.redo.length ? stack.redo[stack.redo.length - 1] : null;
  }

  function canUndo(name) {
    return Boolean(peekUndo(name));
  }

  function canRedo(name) {
    return Boolean(peekRedo(name));
  }

  /**
   * Pop the last undo entry for `name`. `current` is the present state
   * (same shape as a snapshot) and is stored on the redo stack.
   */
  function undo(name, current) {
    const stack = stacks.get(String(name || ""));
    if (!stack?.undo.length) return null;
    const entry = stack.undo.pop();
    stack.redo.push({
      verb: entry.verb,
      name: entry.name,
      detections: entry.detections === undefined ? undefined : clone(current?.detections),
      labels: entry.labels === undefined ? undefined : clone(current?.labels),
    });
    notify();
    return entry;
  }

  function redo(name, current) {
    const stack = stacks.get(String(name || ""));
    if (!stack?.redo.length) return null;
    const entry = stack.redo.pop();
    stack.undo.push({
      verb: entry.verb,
      name: entry.name,
      detections: entry.detections === undefined ? undefined : clone(current?.detections),
      labels: entry.labels === undefined ? undefined : clone(current?.labels),
    });
    notify();
    return entry;
  }

  function clear(name) {
    if (name === undefined) {
      stacks.clear();
    } else {
      stacks.delete(String(name || ""));
    }
    notify();
  }

  function onChange(cb) {
    if (typeof cb !== "function") return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  window.VisionForgeHistory = {
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    peekUndo,
    peekRedo,
    clear,
    onChange,
    MAX_ENTRIES,
  };
})();
