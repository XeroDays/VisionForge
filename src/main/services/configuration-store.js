const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { createLogger } = require("./visionforge-logger");
const { DEFAULT_TYPE, normalizeType } = require("../../shared/enums/ai-model-types");

const log = createLogger("configuration");

const CONFIG_FILE_NAME = "configuration.vfson";
const KNOWN_KEYS = ["onnxModelPath", "onnxModelType"];

function getConfigurationFilePath() {
  return path.join(app.getPath("documents"), "VisionForge", CONFIG_FILE_NAME);
}

function emptyConfiguration() {
  return {
    format: "vfson",
    version: 1,
    onnxModelPath: "",
    onnxModelType: DEFAULT_TYPE,
  };
}

function normalizeConfiguration(raw) {
  const defaults = emptyConfiguration();
  if (!raw || raw.format !== "vfson") return defaults;
  return {
    format: "vfson",
    version: 1,
    onnxModelPath: String(raw.onnxModelPath || "").trim(),
    onnxModelType: normalizeType(raw.onnxModelType),
  };
}

function writeConfiguration(config) {
  const filePath = getConfigurationFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function readConfiguration() {
  const startedAt = log.enter("readConfiguration");
  const filePath = getConfigurationFilePath();
  if (!fs.existsSync(filePath)) {
    const created = emptyConfiguration();
    writeConfiguration(created);
    log.info("created configuration file", { filePath });
    log.exit("readConfiguration", startedAt, { created: true });
    return created;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const config = normalizeConfiguration(parsed);
    if (!parsed || parsed.format !== "vfson") {
      writeConfiguration(config);
      log.warn("configuration file invalid; rewritten with defaults");
    }
    log.exit("readConfiguration", startedAt, { ok: true });
    return config;
  } catch (err) {
    const fallback = emptyConfiguration();
    writeConfiguration(fallback);
    log.warn("failed to read configuration file; rewritten with defaults", {
      error: String(err.message || err),
    });
    log.exit("readConfiguration", startedAt, { recovered: true });
    return fallback;
  }
}

function updateConfiguration(patch) {
  const startedAt = log.enter("updateConfiguration");
  const current = readConfiguration();
  const next = { ...current };
  KNOWN_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, key)) return;
    if (key === "onnxModelType") {
      next[key] = normalizeType(patch[key]);
      return;
    }
    next[key] = String(patch[key] || "").trim();
  });
  writeConfiguration(next);
  log.info("updated configuration", { keys: Object.keys(patch || {}) });
  log.exit("updateConfiguration", startedAt, { ok: true });
  return { ok: true, configuration: next };
}

module.exports = {
  getConfigurationFilePath,
  readConfiguration,
  updateConfiguration,
};
