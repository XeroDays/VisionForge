const log = require("electron-log");

const BOOT_START = Date.now();

const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);

function resolveLogLevel() {
  const envLevel = String(process.env.VISIONFORGE_LOG_LEVEL || "").toLowerCase();
  if (VALID_LEVELS.has(envLevel)) {
    return envLevel;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

log.transports.console.level = resolveLogLevel();
log.transports.file.level = resolveLogLevel();

function bootMs() {
  return Date.now() - BOOT_START;
}

function formatMeta(meta) {
  if (meta == null) return "";
  if (typeof meta === "string") return ` ${meta}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [meta]";
  }
}

function createLogger(namespace) {
  const scope = log.scope(namespace);

  function write(level, message, meta) {
    const line = `[${namespace}] ${message} (+${bootMs()}ms)${formatMeta(meta)}`;
    scope[level](line);
  }

  return {
    debug(message, meta) {
      write("debug", message, meta);
    },
    info(message, meta) {
      write("info", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
    error(message, meta) {
      write("error", message, meta);
    },
    enter(method, meta) {
      write("debug", `→ ${method}`, meta);
      return Date.now();
    },
    exit(method, startedAt, meta) {
      const duration = typeof startedAt === "number" ? Date.now() - startedAt : 0;
      write("debug", `← ${method} (${duration}ms)`, meta);
      return duration;
    },
    mark(label, meta) {
      write("info", `• ${label}`, meta);
    },
    async timed(method, fn, meta) {
      const startedAt = this.enter(method, meta);
      try {
        const result = await fn();
        this.exit(method, startedAt);
        return result;
      } catch (err) {
        this.exit(method, startedAt, { error: String(err.message || err) });
        throw err;
      }
    },
  };
}

function truncate(value, visible = 8) {
  const text = String(value || "");
  if (!text) return "(empty)";
  if (text.length <= visible) return text;
  return `${text.slice(0, visible)}…`;
}

function logFromRenderer(level, namespace, message, meta) {
  const safeLevel = VALID_LEVELS.has(level) ? level : "info";
  const safeNamespace = String(namespace || "splash").trim() || "splash";
  const logger = createLogger(safeNamespace);
  logger[safeLevel](message, meta);
}

module.exports = {
  log,
  createLogger,
  logFromRenderer,
  bootMs,
  truncate,
  startup: createLogger("startup"),
  splash: createLogger("splash"),
  ipc: createLogger("ipc"),
  license: createLogger("license"),
};
