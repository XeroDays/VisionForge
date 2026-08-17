const log = require("electron-log");
const { getLogFilePath, initLogFile, rotateIfOversized } = require("./log-file-store");

const BOOT_START = Date.now();

const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);
const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
const MAX_RENDERER_MESSAGE_LEN = 2048;
const MAX_RENDERER_META_LEN = 4096;

let fileLogInitialized = false;

function resolveLogLevel() {
  const envLevel = String(process.env.VISIONFORGE_LOG_LEVEL || "").toLowerCase();
  if (VALID_LEVELS.has(envLevel)) {
    return envLevel;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function getLogLevel() {
  return resolveLogLevel();
}

function ensureFileLogReady() {
  if (fileLogInitialized) {
    return;
  }
  fileLogInitialized = true;

  try {
    initLogFile();
    log.transports.file.resolvePathFn = () => getLogFilePath();
    log.transports.file.maxSize = 0;
    log.hooks.push((message, transport) => {
      if (transport === log.transports.file) {
        rotateIfOversized();
      }
      return message;
    });
    log.info("=========App Start============");
  } catch (err) {
    log.transports.file.level = false;
    log.warn("[visionforge-logger] file logging unavailable", { error: String(err.message || err) });
  }
}

log.transports.console.level = resolveLogLevel();
log.transports.file.level = resolveLogLevel();

function initFileLogging() {
  ensureFileLogReady();
}

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

function truncate(value, visible = 8) {
  const text = String(value || "");
  if (!text) return "(empty)";
  if (text.length <= visible) return text;
  return `${text.slice(0, visible)}...`;
}

function sanitizeRendererPayload(message, meta) {
  const safeMessage = String(message || "").slice(0, MAX_RENDERER_MESSAGE_LEN);
  if (meta == null) {
    return { safeMessage, safeMeta: meta };
  }
  try {
    const json = JSON.stringify(meta);
    if (json.length <= MAX_RENDERER_META_LEN) {
      return { safeMessage, safeMeta: meta };
    }
    return {
      safeMessage,
      safeMeta: { truncated: true, preview: json.slice(0, MAX_RENDERER_META_LEN) },
    };
  } catch {
    return { safeMessage, safeMeta: { truncated: true } };
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
      write("debug", `-> ${method}`, meta);
      return Date.now();
    },
    exit(method, startedAt, meta) {
      const duration = typeof startedAt === "number" ? Date.now() - startedAt : 0;
      write("debug", `<- ${method} (${duration}ms)`, meta);
      return duration;
    },
    mark(label, meta) {
      write("info", `* ${label}`, meta);
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
    syncTimed(method, fn, meta) {
      const startedAt = this.enter(method, meta);
      try {
        const result = fn();
        this.exit(method, startedAt);
        return result;
      } catch (err) {
        this.exit(method, startedAt, { error: String(err.message || err) });
        throw err;
      }
    },
  };
}

function logFromRenderer(level, namespace, message, meta) {
  const safeLevel = VALID_LEVELS.has(level) ? level : "info";
  const minRank = LEVEL_RANK[resolveLogLevel()] ?? 1;
  const msgRank = LEVEL_RANK[safeLevel] ?? 1;
  if (msgRank < minRank) {
    return;
  }
  const safeNamespace = String(namespace || "renderer").trim() || "renderer";
  const { safeMessage, safeMeta } = sanitizeRendererPayload(message, meta);
  const logger = createLogger(safeNamespace);
  logger[safeLevel](safeMessage, safeMeta);
}

module.exports = {
  log,
  createLogger,
  logFromRenderer,
  getLogLevel,
  initFileLogging,
  bootMs,
  truncate,
  startup: createLogger("startup"),
  splash: createLogger("splash"),
  ipc: createLogger("ipc"),
  license: createLogger("license"),
};
