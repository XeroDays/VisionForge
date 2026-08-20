const fs = require("fs");
const path = require("path");
const { app, dialog, BrowserWindow } = require("electron");
const { createLogger } = require("../services/visionforge-logger");
const { recordSolution } = require("../services/history-solutions-store");
const { setAllowedImagesDir } = require("../services/image-protocol");
const { isValidAnnotation } = require("../../shared/enums/annotation-types");
const { importEmptyDetections } = require("./detection-import-service");

const log = createLogger("project");

const VFSLN_EXT = ".VFSln";
const ILLEGAL_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"]);

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

function sanitizeOpenFileFilters(filters) {
  if (!Array.isArray(filters)) return undefined;
  const cleaned = filters
    .map((item) => ({
      name: String(item?.name || "File").trim() || "File",
      extensions: Array.isArray(item?.extensions)
        ? item.extensions.map((ext) => String(ext || "").replace(/^\./, "").trim()).filter(Boolean)
        : [],
    }))
    .filter((item) => item.extensions.length);
  return cleaned.length ? cleaned : undefined;
}

async function selectOpenFile(sender, options = {}) {
  const startedAt = log.enter("selectOpenFile");
  const win = BrowserWindow.fromWebContents(sender);
  const title = String(options?.title || "Select file").trim() || "Select file";
  const defaultPath = resolveDialogDefault(options?.defaultPath);
  const filters = sanitizeOpenFileFilters(options?.filters);

  const result = await dialog.showOpenDialog(win || undefined, {
    title,
    defaultPath,
    properties: ["openFile"],
    ...(filters ? { filters } : {}),
  });

  if (result.canceled || !result.filePaths?.[0]) {
    log.exit("selectOpenFile", startedAt, { canceled: true });
    return { ok: true, canceled: true };
  }

  const filePath = result.filePaths[0];
  log.exit("selectOpenFile", startedAt, { filePath });
  return { ok: true, canceled: false, filePath };
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

function createProject(name, location, annotation) {
  const startedAt = log.enter("createProject");
  const projectName = sanitizeProjectName(name);
  const folderPath = String(location || "").trim();
  const annotationType = String(annotation?.type || "").trim();
  const annotationMode = String(annotation?.mode || "").trim();

  if (!folderPath) {
    log.exit("createProject", startedAt, { ok: false, reason: "missing-location" });
    return { ok: false, reason: "missing-location" };
  }

  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    log.exit("createProject", startedAt, { ok: false, reason: "invalid-location" });
    return { ok: false, reason: "invalid-location" };
  }

  if (!isValidAnnotation(annotationType, annotationMode)) {
    log.exit("createProject", startedAt, { ok: false, reason: "invalid-annotation" });
    return { ok: false, reason: "invalid-annotation" };
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
    imagesFolder: "",
    labels: [],
    assets: [],
    annotationType,
    annotationMode,
  };

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  recordSolution({ name: projectName, filePath });
  log.info("created VFSln", { filePath });
  log.exit("createProject", startedAt, { ok: true });
  return { ok: true, filePath, name: projectName };
}

function readSolution(filePath) {
  const resolved = String(filePath || "").trim();
  if (!resolved) {
    return { ok: false, reason: "missing-file" };
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return { ok: false, reason: "missing-file" };
  }

  let project;
  try {
    project = JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (err) {
    log.warn("VFSln parse failed", { filePath: resolved, error: String(err.message || err) });
    return { ok: false, reason: "invalid-file" };
  }

  if (!project || typeof project !== "object" || project.format !== "VFSln") {
    return { ok: false, reason: "invalid-format" };
  }

  const name = String(project.name || "").trim() || path.basename(resolved, path.extname(resolved));
  return { ok: true, filePath: resolved, name, project };
}

function isLabelsEmpty(labels) {
  return !Array.isArray(labels) || labels.length === 0;
}

function sameDir(a, b) {
  try {
    return path.resolve(String(a || "")) === path.resolve(String(b || ""));
  } catch {
    return false;
  }
}

function readClassesTxt(dir) {
  const folder = String(dir || "").trim();
  if (!folder) return null;
  const txtPath = path.join(folder, "classes.txt");
  if (!fs.existsSync(txtPath) || !fs.statSync(txtPath).isFile()) {
    return null;
  }

  const names = fs
    .readFileSync(txtPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!names.length) return null;
  return names.map((name, id) => ({ id, name }));
}

function importLabelsIfEmpty(result) {
  if (!result?.ok || !isLabelsEmpty(result.project?.labels)) {
    return result;
  }

  const slnDir = path.dirname(result.filePath);
  const dirs = [slnDir];
  const imagesFolder = String(result.project?.imagesFolder || "").trim();
  if (imagesFolder && !sameDir(imagesFolder, slnDir)) {
    dirs.push(imagesFolder);
  }

  let imported = null;
  let sourceDir = "";
  for (const dir of dirs) {
    const names = readClassesTxt(dir);
    if (names?.length) {
      imported = names;
      sourceDir = dir;
      break;
    }
  }

  if (!imported) {
    result.project.labels = [];
    return result;
  }

  const updated = updateProject(result.filePath, { labels: imported });
  if (!updated.ok) {
    log.warn("could not persist imported labels", { reason: updated.reason, sourceDir });
    result.project.labels = imported;
    return result;
  }

  log.info("imported labels from classes.txt", { count: imported.length, sourceDir });
  return updated;
}

function listImageFiles(folderPath) {
  const dir = String(folderPath || "").trim();
  if (!dir) {
    return { ok: false, reason: "missing-folder" };
  }

  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return { ok: false, reason: "invalid-folder" };
    }
  } catch {
    return { ok: false, reason: "invalid-folder" };
  }

  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      filePath: path.join(dir, entry.name),
    }))
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

  return { ok: true, folderPath: dir, files };
}

function syncAssetsFromFolder(result) {
  if (!result?.ok) return result;
  const folder = String(result.project?.imagesFolder || "").trim();
  if (!folder) return result;

  const listed = listImageFiles(folder);
  if (!listed.ok) {
    log.warn("could not list images for assets sync", { folder, reason: listed.reason });
    return result;
  }

  const hadAssets = Array.isArray(result.project.assets);
  const assets = hadAssets ? result.project.assets.slice() : [];
  const existing = new Set(assets.map((row) => String(row?.name || "")));
  let added = 0;
  for (const file of listed.files) {
    if (existing.has(file.name)) continue;
    assets.push({ name: file.name, width: 0, height: 0, detections: [] });
    existing.add(file.name);
    added += 1;
  }

  if (!added && hadAssets) return result;

  const updated = updateProject(result.filePath, { assets }, { skipPostHooks: true });
  if (!updated.ok) {
    log.warn("could not persist synced assets", { reason: updated.reason, added });
    result.project.assets = assets;
    return result;
  }

  log.info("synced assets from folder", { added, total: assets.length, folder });
  return updated;
}

function applyDetectionImport(result) {
  if (!result?.ok) return result;
  const folder = String(result.project?.imagesFolder || "").trim();
  const imported = importEmptyDetections(result.project, folder);
  if (!imported.changed) return result;

  const updated = updateProject(result.filePath, { assets: imported.assets }, { skipPostHooks: true });
  if (!updated.ok) {
    log.warn("could not persist imported detections", { reason: updated.reason });
    result.project.assets = imported.assets;
    return result;
  }

  log.info("imported detections for empty assets", { filePath: result.filePath });
  return updated;
}

function refreshFolderDerivedState(result) {
  let next = result;
  if (isLabelsEmpty(next.project?.labels)) {
    next = importLabelsIfEmpty(next);
  }
  next = syncAssetsFromFolder(next);
  return applyDetectionImport(next);
}

function loadProject(filePath) {
  const startedAt = log.enter("loadProject");
  let result = importLabelsIfEmpty(readSolution(filePath));
  if (!result.ok) {
    log.exit("loadProject", startedAt, { ok: false, reason: result.reason });
    return result;
  }
  result = syncAssetsFromFolder(result);
  result = applyDetectionImport(result);
  recordSolution({ name: result.name, filePath: result.filePath });
  log.info("loaded VFSln", { filePath: result.filePath });
  log.exit("loadProject", startedAt, {
    ok: true,
    labels: result.project?.labels?.length || 0,
    assets: result.project?.assets?.length || 0,
  });
  return result;
}

function updateProject(filePath, patch, options = {}) {
  const startedAt = log.enter("updateProject");
  const result = readSolution(filePath);
  if (!result.ok) {
    log.exit("updateProject", startedAt, { ok: false, reason: result.reason });
    return result;
  }

  const nextPatch = patch && typeof patch === "object" ? patch : {};
  const project = {
    ...result.project,
    ...nextPatch,
    format: "VFSln",
  };
  if (!project.name) project.name = result.name;
  if (project.version == null) project.version = 1;

  fs.writeFileSync(result.filePath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  log.info("updated VFSln", { filePath: result.filePath });

  let written = { ok: true, filePath: result.filePath, name: project.name, project };
  if (!options.skipPostHooks && Object.prototype.hasOwnProperty.call(nextPatch, "imagesFolder")) {
    written = refreshFolderDerivedState(written);
  }

  log.exit("updateProject", startedAt, {
    ok: true,
    labels: written.project?.labels?.length || 0,
    assets: written.project?.assets?.length || 0,
  });
  return written;
}

function resolveDialogDefault(defaultPath) {
  const raw = String(defaultPath || "").trim();
  if (!raw) return ensureDefaultProjectsDir();
  try {
    if (fs.existsSync(raw) && fs.statSync(raw).isFile()) {
      return path.dirname(raw);
    }
  } catch {
    return raw;
  }
  return raw;
}

async function selectImagesFolder(sender, defaultPath) {
  const startedAt = log.enter("selectImagesFolder");
  const win = BrowserWindow.fromWebContents(sender);
  const fallback = resolveDialogDefault(defaultPath);

  const result = await dialog.showOpenDialog(win || undefined, {
    title: "Select Image Folder",
    defaultPath: fallback,
    properties: ["openDirectory"],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    log.exit("selectImagesFolder", startedAt, { canceled: true });
    return { ok: true, canceled: true };
  }

  const folderPath = result.filePaths[0];
  log.exit("selectImagesFolder", startedAt, { folderPath });
  return { ok: true, canceled: false, folderPath };
}

function listImageFolder(folderPath) {
  const startedAt = log.enter("listImageFolder");
  const listed = listImageFiles(folderPath);
  if (!listed.ok) {
    log.exit("listImageFolder", startedAt, { ok: false, reason: listed.reason });
    return listed;
  }

  setAllowedImagesDir(listed.folderPath);
  log.exit("listImageFolder", startedAt, { folderPath: listed.folderPath, count: listed.files.length });
  return listed;
}

function closeProject() {
  const startedAt = log.enter("closeProject");
  setAllowedImagesDir("");
  log.exit("closeProject", startedAt, { ok: true });
  return { ok: true };
}

module.exports = {
  getDefaultProjectsDir,
  ensureDefaultProjectsDir,
  selectProjectFolder,
  selectProjectFile,
  selectOpenFile,
  createProject,
  loadProject,
  updateProject,
  closeProject,
  selectImagesFolder,
  listImageFolder,
};
