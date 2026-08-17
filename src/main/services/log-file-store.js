const fs = require("fs");
const path = require("path");

const VISIONFORGE_DIR_NAME = "VisionForge";
const LOG_DIR_NAME = "Logs";
const LOG_FILE_NAME = "logfile.txt";
const MAX_BYTES = 1 * 1024 * 1024;

function getLogFilePath() {
  const { app } = require("electron");
  return path.join(
    app.getPath("documents"),
    VISIONFORGE_DIR_NAME,
    LOG_DIR_NAME,
    LOG_FILE_NAME
  );
}

function ensureLogDirectory() {
  fs.mkdirSync(path.dirname(getLogFilePath()), { recursive: true });
}

function rotateIfOversized() {
  const logPath = getLogFilePath();
  if (fs.existsSync(logPath) && fs.statSync(logPath).size >= MAX_BYTES) {
    fs.unlinkSync(logPath);
  }
}

function initLogFile() {
  ensureLogDirectory();
  rotateIfOversized();
}

function readLogFileContents() {
  const logPath = getLogFilePath();
  if (!fs.existsSync(logPath)) {
    return "";
  }

  const stat = fs.statSync(logPath);
  if (stat.size === 0) {
    return "";
  }

  const readLen = Math.min(stat.size, MAX_BYTES);
  const offset = stat.size > MAX_BYTES ? stat.size - MAX_BYTES : 0;
  const fd = fs.openSync(logPath, "r");
  try {
    const buffer = Buffer.alloc(readLen);
    fs.readSync(fd, buffer, 0, readLen, offset);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  getLogFilePath,
  ensureLogDirectory,
  rotateIfOversized,
  initLogFile,
  readLogFileContents,
  MAX_BYTES,
};
