const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { createLogger } = require("./visionforge-logger");

const log = createLogger("history");

const HISTORY_FILE_NAME = "history-solutions.vfson";
const MAX_ENTRIES = 20;

function getHistoryFilePath() {
  return path.join(app.getPath("documents"), "VisionForge", HISTORY_FILE_NAME);
}

function emptyHistory() {
  return { format: "vfson", version: 1, solutions: [] };
}

function normalizePathKey(filePath) {
  return String(filePath || "").replace(/\//g, "\\").toLowerCase();
}

function readHistory() {
  const filePath = getHistoryFilePath();
  if (!fs.existsSync(filePath)) {
    return emptyHistory();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || parsed.format !== "vfson" || !Array.isArray(parsed.solutions)) {
      log.warn("history file invalid; using empty list");
      return emptyHistory();
    }
    return {
      format: "vfson",
      version: 1,
      solutions: parsed.solutions.slice(0, MAX_ENTRIES),
    };
  } catch (err) {
    log.warn("failed to read history file", { error: String(err.message || err) });
    return emptyHistory();
  }
}

function writeHistory(history) {
  const filePath = getHistoryFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

function recordSolution({ name, filePath }) {
  const startedAt = log.enter("recordSolution");
  const solutionPath = String(filePath || "").trim();
  if (!solutionPath) {
    log.exit("recordSolution", startedAt, { ok: false, reason: "missing-path" });
    return { ok: false, reason: "missing-path" };
  }

  const displayName = String(name || "").trim() || path.basename(solutionPath, path.extname(solutionPath));
  const history = readHistory();
  const key = normalizePathKey(solutionPath);
  const solutions = history.solutions.filter((item) => normalizePathKey(item.filePath) !== key);

  solutions.unshift({
    name: displayName,
    filePath: solutionPath,
    openedAt: new Date().toISOString(),
  });

  const next = {
    format: "vfson",
    version: 1,
    solutions: solutions.slice(0, MAX_ENTRIES),
  };

  writeHistory(next);
  log.info("recorded solution history", { filePath: solutionPath, name: displayName });
  log.exit("recordSolution", startedAt, { ok: true, count: next.solutions.length });
  return { ok: true, history: next };
}

module.exports = {
  getHistoryFilePath,
  readHistory,
  recordSolution,
  MAX_ENTRIES,
};
