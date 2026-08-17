const fs = require("fs");
const path = require("path");
const { app, dialog, BrowserWindow } = require("electron");
const { createLogger } = require("../services/visionforge-logger");
const { recordSolution } = require("../services/history-solutions-store");

const log = createLogger("project");

const VFSLN_EXT = ".VFSln";
const ILLEGAL_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function getDefaultProjectsDir() {
  return path.join(app.getPath("documents"), "VisionForge");
}

function ensureDefaultProjectsDir() {
  const dir = getDefaultProjectsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeProjectName(name) {
  const trimmed = String(name || "").trim();
  const cleaned = trimmed.replace(ILLEGAL_NAME_CHARS, "").replace(/\s+/g, " ").trim();
  return cleaned || "Untitled";
}

function solutionFileName(projectName) {
  return `${sanitizeProjectName(projectName)}${VFSLN_EXT}`;
}

async function selectProjectFolder(sender) {
  const startedAt = log.enter("selectProjectFolder");
  const win = BrowserWindow.fromWebContents(sender);
  const defaultPath = ensureDefaultProjectsDir();

  const result = await dialog.showOpenDialog(win || undefined, {
    title: "Select project location",
    defaultPath,
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    log.exit("selectProjectFolder", startedAt, { canceled: true });
    return { ok: true, canceled: true };
  }

  const folderPath = result.filePaths[0];
  log.exit("selectProjectFolder", startedAt, { folderPath });
  return { ok: true, canceled: false, folderPath };
}

async function selectProjectFile(sender) {
  const startedAt = log.enter("selectProjectFile");
  const win = BrowserWindow.fromWebContents(sender);
  const defaultPath = ensureDefaultProjectsDir();

  const result = await dialog.showOpenDialog(win || undefined, {
    title: "Open existing project",
    defaultPath,
    properties: ["openFile"],
    filters: [
      { name: "VisionForge Solution", extensions: ["VFSln"] },
    ],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    log.exit("selectProjectFile", startedAt, { canceled: true });
    return { ok: true, canceled: true };
  }

  const filePath = result.filePaths[0];
  const name = path.basename(filePath, path.extname(filePath));
  recordSolution({ name, filePath });
  log.exit("selectProjectFile", startedAt, { filePath });
  return { ok: true, canceled: false, filePath, name };
}

function createProject(name, location) {
  const startedAt = log.enter("createProject");
  const projectName = sanitizeProjectName(name);
  const folderPath = String(location || "").trim();

  if (!folderPath) {
    log.exit("createProject", startedAt, { ok: false, reason: "missing-location" });
    return { ok: false, reason: "missing-location" };
  }

  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    log.exit("createProject", startedAt, { ok: false, reason: "invalid-location" });
    return { ok: false, reason: "invalid-location" };
  }

  const fileName = solutionFileName(projectName);
  const filePath = path.join(folderPath, fileName);

  if (fs.existsSync(filePath)) {
    log.warn("VFSln already exists", { filePath });
    log.exit("createProject", startedAt, { ok: false, reason: "exists" });
    return { ok: false, reason: "exists", filePath };
  }

  const payload = {
    format: "VFSln",
    version: 1,
    name: projectName,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  recordSolution({ name: projectName, filePath });
  log.info("created VFSln", { filePath });
  log.exit("createProject", startedAt, { ok: true });
  return { ok: true, filePath, name: projectName };
}

module.exports = {
  getDefaultProjectsDir,
  ensureDefaultProjectsDir,
  selectProjectFolder,
  selectProjectFile,
  createProject,
};
