(function () {
  const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
  let cachedLogLevel = "info";

  function shouldLog(level) {
    const want = LEVEL_RANK[level] ?? 1;
    const min = LEVEL_RANK[cachedLogLevel] ?? 1;
    return want >= min;
  }

  function send(level, namespace, message, meta) {
    if (!shouldLog(level)) return;
    if (typeof window.visionforge?.log === "function") {
      window.visionforge.log(level, namespace, message, meta);
    }
  }

  function create(namespace) {
    return {
      debug(message, meta) {
        send("debug", namespace, message, meta);
      },
      info(message, meta) {
        send("info", namespace, message, meta);
      },
      warn(message, meta) {
        send("warn", namespace, message, meta);
      },
      error(message, meta) {
        send("error", namespace, message, meta);
      },
      enter(method, meta) {
        send("debug", namespace, `-> ${method}`, meta);
        return Date.now();
      },
      exit(method, startedAt, meta) {
        const duration = typeof startedAt === "number" ? Date.now() - startedAt : 0;
        send("debug", namespace, `<- ${method} (${duration}ms)`, meta);
        return duration;
      },
    };
  }

  async function refreshLogLevel() {
    try {
      if (typeof window.visionforge?.getAppInfo === "function") {
        const info = await window.visionforge.getAppInfo();
        if (info && LEVEL_RANK[info.logLevel] != null) {
          cachedLogLevel = info.logLevel;
        }
      }
    } catch (_err) {
      // keep default info until app info is available
    }
  }

  window.VisionForgeLogger = {
    create,
    refreshLogLevel,
  };

  refreshLogLevel();

  window.addEventListener("error", (event) => {
    send("error", "renderer", event.message || "Uncaught error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    send("error", "renderer", "Unhandled promise rejection", {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
})();
