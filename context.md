# VisionForge — AI Context Index

> **NOT user documentation.** This file is an AI context index for Cursor, Claude, GPT, Gemini, and future LLM sessions.
> If this file is read without other context, treat it as the user requesting project context only.

---

## Rules for Maintaining This File

1. **Re-scan the codebase** before every update — do not assume prior state.
2. **Keep sections short and information-dense** — navigation over explanation.
3. **Reference files and workflows**, not implementation details or code snippets.
4. **Remove outdated entries** when features, files, or architecture change.
5. **Add new entries** when features, workflows, integrations, or IPC channels are introduced.
6. **Do not include** installation steps, user guides, or long prose.
7. **Sync with reality** — only document what exists or is explicitly planned in code comments/architecture stubs.
8. **Update line-number index** if an index section is used (refresh after edits).

### Agent Rules (mandatory — never)

- **Git (mandatory — never):** Never run `git add`, `git commit`, `git push`, create git tags, or create GitHub releases — **even if the user asks**. Do not stage files. Do not initialize commits. Version bumps and release prep are **file edits only** (`package.json`, `package-lock.json`, `CHANGELOG.md`, `src/main/services/license-service.js`, `context.md`). Tell the user which files changed and let them commit, tag, and publish manually.
- **Create / generate release (agent rule):** When the user asks to **create a release** or **generate a release**, that means: bump the software version in `package.json` and `package-lock.json` (root `"version"` fields only — do not change dependency versions), increment `BUILD_VERSION` in `src/main/services/license-service.js` by 1, move `[Unreleased]` entries in `CHANGELOG.md` into a new versioned section with the release date, and update `context.md` (current version reference, `BUILD_VERSION` reference, and any affected workflow notes). Do **not** modify `.github/workflows/` or any other GitHub Actions files; the release tag is entered manually when running **Build Windows**.
- **No git automation:** Never use `gh release create`, `git tag`, `git push -u`, or any command that writes to git history or remote. Never run pre-commit hooks via commit commands on the user's behalf.

---

## Index

| Section | Topic |
|---------|-------|
| Agent Rules | Git/release prohibitions (mandatory) |
| Project Summary | Purpose, stack, deployment |
| Architecture Rules | Enforced patterns |
| Feature Registry | Current features |
| Workflow Registry | Major flows |
| File Responsibility Map | Quick file lookup |
| Data Flow Map | Cross-layer data movement |
| Integration Registry | External systems |
| Dependency Impact Map | Change blast radius |
| Known Conventions | Naming and structure |
| Maintenance Rules | When to update this file |

---

## Project Summary

| Field | Value |
|-------|-------|
| **Purpose** | Electron desktop app (VisionForge). Splash license gate → main window. Tray + release update panel. Domain features not yet implemented. |
| **Architecture** | Main / Preload / Renderer / Shared process separation. No bundler. Middleware layer reserved for future business logic. |
| **Framework** | Electron 41 (vanilla JS, CommonJS) |
| **Language** | JavaScript only (no TypeScript) |
| **Database** | None |
| **External services** | Font Awesome CDN (main UI icons only) |
| **Deployment** | Windows NSIS installer via `electron-builder`; GitHub Actions manual release |
| **App ID** | `com.visionforge.app` |
| **Storage (planned)** | Project config in `{folder}/{Name}.VFSln`; recents in `Documents/VisionForge/history-solutions.vfson`; logs at `Documents/VisionForge/Logs/` |
| **Entry point** | `src/main/index.js` |
| **Preload global** | `window.visionforge` |
| **IPC namespace** | `visionforge:*` |

---

## Architecture Rules

| Rule | Detail |
|------|--------|
| Process isolation | Renderer must not use Node.js APIs (`fs`, `ipcMain`, etc.) |
| IPC access | Renderer calls `window.visionforge.*` only via preload `contextBridge` |
| Channel source of truth | `src/shared/ipc/channels.js` defines all channel names |
| Preload sync | Preload duplicates channel strings inline (sandbox-safe); must stay in sync with `channels.js` |
| IPC handlers | `register.js` and `register-splash-handlers.js` are thin routers — no business logic |
| Business logic | Future logic goes in `src/main/middleware/` as singleton classes |
| Services | Cross-cutting helpers (logging, file I/O, HTTP) go in `src/main/services/` |
| No direct DB | No database layer exists; persistence not implemented |
| No bundler | Source files loaded directly by Electron — no Webpack/Vite |
| Frameless windows | Both splash and main use `frame: false`; custom chrome in renderer |
| Window security | `contextIsolation: true` on all `BrowserWindow` instances |
| Lazy bootstrap | Heavy modules loaded via `setImmediate` after splash shows (IPC, windows, license, icon) |
| Splash load gate | Wait for splash `did-finish-load` before `splash.show()` |
| Main presentation | **Maximize** main window after splash (not fullscreen) |
| Minimize behavior | Main window minimize uses `win.minimize()` (taskbar, not tray) |
| Logo asset | `src/renderer/images/logo/VisionForge.png` (dev + splash); packaged `icon.png` via `helpers/app-icon.js` |
| Logging | Main + renderer via `visionforge-logger.js` / `renderer-logger.js` (`electron-log`); file at `Documents/VisionForge/Logs/logfile.txt`; level via `VISIONFORGE_LOG_LEVEL` env |
| Image protocol | Privileged `vfimg:` scheme registered before `app.whenReady`; only paths under the current images folder |
| File naming | kebab-case for all source files |
| electron-builder config | Lives in `package.json` `build` block — no separate YAML |
| Git operations | Agents must never run `git add`, `git commit`, `git push`, tags, or releases — file edits only |

---

## Feature Registry

### Application Bootstrap

**Purpose:** Start app, show splash, load main window, transition to workspace.

**Entry Points:**
- `src/main/index.js` — `bootstrap()`
- `package.json` → `npm start` → `scripts/start-electron.js`

**Primary Files:**
- `src/main/index.js`
- `src/main/windows/splash-window.js`
- `src/main/windows/main-window.js`
- `src/main/ipc/register-splash-handlers.js`
- `src/main/ipc/register.js`

**Related Files:**
- `src/renderer/splash.html`
- `src/renderer/index.html`
- `src/preload/splash-preload.js`
- `src/preload/index.js`
- `src/renderer/scripts/splash.js`

**Dependencies:**
- `visionforge-logger.js`
- `channels.js`

**Workflow:**
`app.whenReady` → register splash IPC → create splash → wait splash load → show → `"Starting…"` → lazy-load IPC/windows/license/icon → create hidden main → parallel license register (`"Checking for updates…"`) + main load → on deny stay on splash / on grant `"Loading workspace…"` (1s) → `LICENSE_UPDATE` → close splash → maximize/show main

---

### Release Update Panel

**Purpose:** Post-splash UI for Softasium license update availability (download/install).

**Primary Files:**
- `src/renderer/scripts/release-update-panel.js`
- `src/renderer/index.html` — `#btn-new-release`, `#release-overlay`
- `src/preload/index.js` — license update IPC

**Workflow:**
`LICENSE_UPDATE` on main load → `initReleaseUpdate()` → show button if `updateAvailable` → modal download/install via license IPC

---

### Workspace Panels

**Purpose:** Main-window chrome: left tools rail and resizable right inspector.

**Primary Files:**
- `src/renderer/index.html` — `#tools-rail`, `#inspector-panel`
- `src/renderer/scripts/workspace-panels.js`
- `src/renderer/styles/app.css`

**Workflow:**
Tool click → selected highlight for Cursor, Box, Hexagon. **Select Images** is a command (shown after a project is open). Left tools rail, inspector, and resize handle are hidden until a `.VFSln` is loaded (`setWorkspaceChrome`); Goto Startup page hides them again. Inspector tabs: **Assets** (default, first), Labels (list + Add composer; click row to select class for Box draws; click again to rename; hover trash + confirm to delete; all persist only in VFSln `labels`), Detections (read-only list of the current image’s VFSln boxes). Drag handle resizes inspector width (in-memory, 220px–50% of workspace). Image view controls (Zoom in/out, Fit to Screen, Rotate) live on `#view-toolbar` over the stage as one-shot actions (never stay selected), not on the left rail.

---

### Workspace Canvas

**Purpose:** Project workspace after a `.VFSln` is created or opened: empty stage, bottom playback bar, image-folder restore.

**Primary Files:**
- `src/renderer/index.html` — `#workspace-canvas`, `#playback-bar`, File menu
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/styles/app.css`

**Workflow:**
Create / Open / Recent → `showWorkspace(filePath)` → **Loading project** overlay → load VFSln (append-only `assets` sync + empty-detection sidecar import if `imagesFolder` set) → hide `#start-page` → select Cursor tool → restore `imagesFolder` if set → playback range = image count (`listImageFolder`, not `assets`) → current frame previewed fit-to-screen via `vfimg:` protocol → Detections tab + SVG boxes for that file → hide overlay. File → **Select Image Folder** and the Select Images tool share the same picker (same overlay while sync/import runs). File → **Goto Startup page** closes the project (`closeWorkspace` + `closeProject`) and returns to `#start-page`. Playback skip/step/play/seek/frame follow `0 .. count-1`. Assets tab (default) lists image names; click sets the current frame (Detections list and boxes update). When an image is previewed, `#view-toolbar` (top-left of the stage) shows Zoom in/out, Fit to Screen, and Rotate (one-shot). Middle-button drag pans the image. Ctrl+wheel zooms toward the pointer; Shift+wheel on Cursor steps the asset list; A / ArrowLeft step back and D / ArrowRight step forward (any tool; ignored while typing). Plain wheel does not change the frame. Box/Hexagon ignore wheel. Rotate overwrites the current image file 90° clockwise and re-fits. Detection overlay uses the same zoom/pan transform as the image.

---

### Start Page

**Purpose:** No-project home in the center pane (Cursor-style). Create opens the new-project dialog; Open opens a `.VFSln` file picker. Recent list comes from `history-solutions.vfson`.

**Primary Files:**
- `src/renderer/index.html` — `#start-page`, hidden `#workspace-canvas`
- `src/renderer/scripts/start-page.js`
- `src/renderer/styles/app.css`

**Workflow:**
No project selected → `#start-page` visible. **Create new project** opens `#create-project-overlay`. **Open existing project** opens a native file picker filtered to `.VFSln`, then shows the workspace. Recent row click loads that `.VFSln` and shows the workspace.

---

### Create Project Dialog

**Purpose:** Configure and create a new VisionForge solution file (`.VFSln`) in a user-chosen folder.

**Primary Files:**
- `src/renderer/scripts/create-project-dialog.js`
- `src/shared/enums/annotation-types.js`
- `src/main/middleware/project-service.js`
- `src/renderer/index.html` — `#create-project-overlay`

**Workflow:**
Create new project → modal (name + location + custom annotation-type dropdown + mode radios) → location click/`...` → `selectProjectFolder` → type change rebuilds radios (none preselected) → Next requires a mode → `createProject(name, location, { type, mode })` validates against the catalog and writes `{ProjectName}.VFSln` (including `annotationType` / `annotationMode` / `assets: []`) → record history → close modal → show workspace. Close via Cancel, X, or Escape — backdrop click does not dismiss. Annotation type is a custom dark dropdown (not a native `<select>`). Does not change workspace tools.

---

### Open Existing Project

**Purpose:** Pick an existing `.VFSln` solution file via the native file dialog.

**Primary Files:**
- `src/renderer/scripts/start-page.js`
- `src/main/middleware/project-service.js` — `selectProjectFile()`

**Workflow:**
Open existing project → `openProjectFile()` → native dialog filtered to `.VFSln` → record in `history-solutions.vfson` → `loadProject` → show workspace (restore `imagesFolder` if present).

---

### Project solution file (`.VFSln`)

**Purpose:** Single source of truth for all project configuration. Every project setting belongs in this file (schema grows as features are added).

**Location:** `{selected-folder}/{ProjectName}.VFSln`

**Current schema:**
- `format` — always `"VFSln"`
- `version` — schema version (`1`)
- `name` — project display name
- `imagesFolder` — absolute path to the selected image directory (empty string until chosen)
- `labels` — `[{ id, name }, …]` class list (`id` from 0). Imported on load (and after setting `imagesFolder`) only when this array is missing or empty, from `{vfsln-dir}/classes.txt` first, then `{imagesFolder}/classes.txt`. Rename keeps the same `id`; delete removes that row and does not renumber remaining ids. Never written to `classes.txt`.
- `assets` — `[{ name, width, height, detections }, …]` append-only image rows. `name` is the file name only (same extensions as `listImageFolder`). `width` / `height` are image pixels (`0` or missing until the renderer has shown that file). `detections` is an array; new rows start as `[]`; `null` or missing is treated as empty. Each detection is `{ labelid, value }` — YOLO `{ xc, yc, w, h }` (`xc = ((x1+x2)/2)/width`, `yc = ((y1+y2)/2)/height`, `w = (x2-x1)/width`, `h = (y2-y1)/height`, clamped to 0–1 and written to 6 decimal places on edit, same as typical YOLO `.txt` exports) or VOC `{ xmin, ymin, xmax, ymax }` (integer pixels on edit). Older files without `assets` treat it as `[]`. Rows are never deleted and non-empty `detections` are never overwritten by sidecar import.
- `annotationType` — kebab-case id from the create-project type catalog (e.g. `object-detection-bbox`). Older files may omit this.
- `annotationMode` — kebab-case id of the selected radio for that type (e.g. `yolo-bounding-box`). Must be a valid pair with `annotationType`. Older files may omit this.

**Rule:** Do not store project config elsewhere (no parallel JSON/DB for project settings). When a new project setting is introduced, add it to the `.VFSln` schema and document the field in this section.

---

### Solution history (`history-solutions.vfson`)

**Purpose:** App-level recents list for the start page. Not project config — that stays in `.VFSln`.

**Location:** `Documents/VisionForge/history-solutions.vfson`

**Schema:**
- `format` — `"vfson"`
- `version` — `1`
- `solutions[]` — `{ name, filePath, openedAt }` newest first, max 20, deduped by `filePath`

**Workflow:**
Create or open a `.VFSln` → `recordSolution` upserts history → start page `getSolutionHistory()` renders Recent projects.

---

### Splash Screen

**Purpose:** Startup loading UI with status text and version label.

**Entry Points:**
- `src/renderer/splash.html`
- `src/renderer/scripts/splash.js`

**Primary Files:**
- `src/main/windows/splash-window.js`
- `src/preload/splash-preload.js`
- `src/main/ipc/register-splash-handlers.js`
- `src/renderer/styles/splash.css`

**Related Files:**
- `src/main/ipc/app-info.js`
- `src/renderer/images/logo/VisionForge.png`

**Dependencies:**
- `visionforge:splash-status` (main → renderer push)
- `visionforge:get-app-info` (renderer → main invoke)
- `visionforge:quit-app`
- `visionforge:splash-log`

**Workflow:**
Main `sendSplashStatus()` → preload `onSplashStatus` → `splash.js` updates UI → `getAppInfo()` → version label

---

### Frameless Window Chrome

**Purpose:** Custom title bar with minimize, maximize/restore, close on frameless main window.

**Entry Points:**
- `src/renderer/index.html` — `#app-chrome-header`, window control buttons
- `src/renderer/scripts/window-controls.js`

**Primary Files:**
- `src/renderer/scripts/window-controls.js`
- `src/main/ipc/register.js` — window IPC handlers
- `src/preload/index.js` — `minimizeWindow`, `maximizeWindow`, `closeWindow`, `isWindowMaximized`

**Related Files:**
- `src/renderer/styles/app.css`

**Dependencies:**
- `visionforge:window-minimize`
- `visionforge:window-maximize`
- `visionforge:window-close`
- `visionforge:window-is-maximized`

**Workflow:**
Button click → `window.visionforge.*Window()` → preload invoke → `register.js` → `BrowserWindow` API (minimize → `win.minimize()` / taskbar)

---

### App Info

**Purpose:** Return product metadata (version, edition, instance hash) for splash/about UI.

**Entry Points:**
- `visionforge:get-app-info` IPC channel

**Primary Files:**
- `src/main/ipc/app-info.js` — `buildAppInfo()`
- `src/main/ipc/register-splash-handlers.js`

**Related Files:**
- `package.json` (version, productName)
- `src/renderer/scripts/splash.js`

**Dependencies:** None

**Workflow:**
`splash.js` → `getAppInfo()` → `buildAppInfo()` → reads `package.json` + `app.getPath("userData")`

---

### Logging

**Purpose:** Structured logging across main and renderer with boot timing, file rotation, and renderer log relay. Production defaults to `info` level — `debug` calls are filtered before IPC to avoid performance impact.

**Entry Points:**
- Main: `src/main/services/visionforge-logger.js`
- Renderer: `src/renderer/scripts/renderer-logger.js` (`window.VisionForgeLogger`)

**Primary Files:**
- `src/main/services/visionforge-logger.js` — main-process logger (`createLogger`, `logFromRenderer`, `getLogLevel`)
- `src/main/services/log-file-store.js` — rotating file log at `Documents/VisionForge/Logs/logfile.txt` (1 MB max)
- `src/renderer/scripts/renderer-logger.js` — renderer-side logger with pre-IPC level filtering

**Related Files:**
- All `src/main/` modules use `createLogger(namespace)` or named exports (`startup`, `splash`, `ipc`, `license`)
- `register-splash-handlers.js` — `SPLASH_LOG` IPC handler relays renderer logs to main
- `src/preload/index.js` and `src/preload/splash-preload.js` — both expose `visionforge.log()`
- `src/main/ipc/app-info.js` — returns `logLevel` in `getAppInfo()` for renderer filter sync

**Dependencies:**
- `electron-log` npm package
- `VISIONFORGE_LOG_LEVEL` env var (`debug` | `info` | `warn` | `error`)

**Workflow:**
- Main: `log.enter/exit/mark/timed` → console + file via electron-log
- Renderer: `VisionForgeLogger.create('namespace')` → filtered by level → `visionforge.log()` → `SPLASH_LOG` → `logFromRenderer()` → main logger
- Global `error` and `unhandledrejection` in renderer auto-relay to main

**Mandatory conventions for new files:**

Main process (`src/main/**`):
```js
const { createLogger } = require("./services/visionforge-logger");
const log = createLogger("my-module");
log.enter("methodName");
log.info("message", { key: "value" });
log.exit("methodName", startedAt);
```

Renderer (`src/renderer/scripts/**`):
```js
const log = VisionForgeLogger.create("my-feature");
log.info("message", { key: "value" });
```

Rules:
- Every new module gets a unique kebab-case namespace string
- Use `enter`/`exit`/`timed` for async flows; `mark` for milestones
- Do not use raw `console.log` in app code — use the logger
- Production level is `info` — use `debug` for verbose tracing only
- Override via `VISIONFORGE_LOG_LEVEL=debug` env var
- Log file: `Documents/VisionForge/Logs/logfile.txt` (1 MB rotation, delete-and-recreate)
- Include `renderer-logger.js` in any new renderer HTML page before feature scripts

---

### Windows Build & Release

**Purpose:** Generate icons, package NSIS installer, publish via GitHub Actions.

**Entry Points:**
- `npm run build:win`
- `.github/workflows/build-windows.yml`

**Primary Files:**
- `package.json` — `build` config
- `scripts/generate-windows-icon.js`
- `scripts/patch-electron-icon.js`
- `.github/workflows/build-windows.yml`

**Related Files:**
- `build/icon.ico`, `build/icon.png`
- `src/renderer/images/logo/VisionForge.png`

**Dependencies:**
- `electron-builder`, `sharp`, `png-to-ico`, `rcedit`

**Workflow:**
`generate:icon` → `build:win` (electron-builder NSIS x64) → CI uploads `dist/*.exe` to GitHub Release

---

### Middleware Layer

**Purpose:** Main-process business logic (singleton modules). IPC handlers stay thin.

**Primary Files:**
- `src/main/middleware/project-service.js` — create/load/update/close `.VFSln` session, folder pickers, image listing, `classes.txt` label import, append-only `assets` sync
- `src/main/middleware/detection-import-service.js` — YOLO txt / Pascal VOC xml sidecar parse into empty `assets[].detections`
- `src/main/middleware/image-service.js` — rotate current image 90° CW and overwrite the file
- `src/main/services/image-protocol.js` — privileged `vfimg:` protocol; only serves files under the allowed images folder

---

## Workflow Registry

### Create Project

**Trigger:** Start page → Create new project

**Flow:**
Modal → name + location + custom annotation-type dropdown + mode radios → Next → `createProject` validates `{ type, mode }` via `isValidAnnotation` → write VFSln (`annotationType`, `annotationMode`, `assets: []`) → history → workspace. Reject `invalid-annotation` if the pair is missing or unknown.

**Files:**
- `src/renderer/scripts/create-project-dialog.js`
- `src/shared/enums/annotation-types.js`
- `src/main/middleware/project-service.js`
- `src/preload/index.js`

---

### Open Project Workspace

**Trigger:** Create succeeds, Open existing project, or Recent row click

**Flow:**
Renderer `showWorkspace(filePath)` → show **Loading project** overlay → `loadProject` reads VFSln (import `classes.txt` into `labels` if empty: vfsln dir then `imagesFolder`; append missing image names to `assets`; import empty detections from txt/xml sidecars) → hide start page / show `#workspace-canvas` → Cursor tool selected → Assets tab selected → Labels tab populated → keep `project.assets` in renderer → if `imagesFolder` set, `listImageFolder` → playback slider max = count - 1, Assets list populated, current image fit-to-screen, Detections list + canvas boxes for that file → hide overlay

**Files:**
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/scripts/start-page.js`
- `src/renderer/scripts/create-project-dialog.js`
- `src/main/middleware/project-service.js`

---

### Goto Startup page

**Trigger:** File → Goto Startup page (project must be open)

**Flow:**
`closeWorkspace` → stop playback, clear assets/preview/labels, reset tool to Cursor, hide canvas / show `#start-page`, breadcrumb Welcome → `closeProject` clears `vfimg:` allowed dir → refresh recents. Does not delete the `.VFSln` or history.

**Files:**
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/index.html` — `#btn-goto-startup`
- `src/main/middleware/project-service.js`
- `src/preload/index.js`

---

### Import Labels from classes.txt

**Trigger:** `loadProject` when VFSln `labels` is missing or empty; also `updateProject({ imagesFolder })` when labels are still empty

**Flow:**
If `labels` empty → try `{vfsln-dir}/classes.txt`, then `{imagesFolder}/classes.txt` (skip duplicate dir) → first non-empty file wins → write `labels: [{ id, name }, …]` starting at id 0. Do not merge files or overwrite existing labels. Renderer fills the Labels tab (`showWorkspace` / after Select Image Folder).

**Files:**
- `src/main/middleware/project-service.js`
- `src/renderer/scripts/workspace-canvas.js`

---

### Add Label

**Trigger:** Labels tab → Add (project must be open)

**Flow:**
Add → inline composer (name + check / cancel) → Enter or check → `updateProject({ labels })` appends `{ id: max+1, name }` to VFSln only → refresh list. Does not write `classes.txt`. Opening Add cancels an in-progress row rename.

**Files:**
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/index.html` — `#panel-labels`

---

### Rename Label

**Trigger:** Labels tab → click the already selected row (id/name, not the trash)

**Flow:**
First click on a row selects it (highlight; used as the class for new Box-tool draws). Click the already selected row to rename: inline text field + check. Enter or check → trim name (ignore empty) → `updateProject({ labels })` with the same `id` → refresh list. Escape, click outside, or starting another row/Add cancels without saving. VFSln only; does not write `classes.txt`.

**Files:**
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/index.html` — `#panel-labels`
- `src/renderer/styles/app.css`

---

### Delete Label

**Trigger:** Labels tab → hover row → trash icon

**Flow:**
Trash `stopPropagation` (does not enter rename) → `#delete-label-overlay` confirm (`Delete "{name}"? This cannot be undone.`) → Cancel / Escape / overlay click closes with no change → Delete filters that `id` out of `labels` via `updateProject` → refresh list. Remaining ids are not renumbered. VFSln only; does not write `classes.txt`. No annotation cascade.

**Files:**
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/index.html` — `#delete-label-overlay`
- `src/renderer/styles/app.css`

---

### Select Image Folder

**Trigger:** File → Select Image Folder, or Select Images tool

**Flow:**
Native directory dialog → **Loading project** overlay → `updateProject({ imagesFolder })` (if `labels` empty, import `classes.txt` from that folder; then append-only `assets` sync + empty-detection sidecar import) → `listImageFolder` → playback + Assets + Labels + Detections + stage preview/boxes update → hide overlay

**Files:**
- `src/renderer/scripts/workspace-canvas.js`
- `src/main/middleware/project-service.js`

---

### Sync Assets from Image Folder

**Trigger:** `loadProject` when `imagesFolder` is set; also `updateProject({ imagesFolder })`

**Flow:**
List image names in `imagesFolder` (same extensions as `listImageFolder`). Existing `assets[].name` kept (including detections and size). Names not in `assets` appended as `{ name, width: 0, height: 0, detections: [] }`. Write only if the array grew or `assets` was missing. Never delete stale rows. Do not probe image dimensions at sync time. Playback still uses `listImageFolder`.

**Files:**
- `src/main/middleware/project-service.js`

---

### Import Detections from Sidecars

**Trigger:** After assets sync on every `loadProject` and after `imagesFolder` save

**Flow:**
Only assets whose `detections` is null, missing, or `[]`. Same-basename sidecar: `imagesFolder` first, then `imagesFolder/labels`. Prefer `.txt` when `annotationMode` contains `yolo`; prefer `.xml` when it contains `voc`/`pascal`; otherwise first existing. YOLO line `class_id xc yc w h` → `{ labelid, value: { xc, yc, w, h } }`. VOC `<object><name>` mapped case-insensitively to VFSln `labels` → `{ labelid, value: { xmin, ymin, xmax, ymax } }`. Skip malformed lines/objects and unknown class names. Non-empty `detections` never overwritten. One write of `assets` if any row changed.

**Files:**
- `src/main/middleware/detection-import-service.js`
- `src/main/middleware/project-service.js`

---

### Loading Project Overlay

**Trigger:** `showWorkspace` (Create / Open / Recent); after Select Image Folder picker returns a folder

**Flow:**
Show `#loading-project-overlay` (spinner + “Loading project”; not dismissible) and wait one paint → blocking `loadProject` or `updateProject({ imagesFolder })` + `listImageFolder` → hide overlay in `finally` (success or failure). Cancelled folder picker never shows it.

**Files:**
- `src/renderer/index.html` — `#loading-project-overlay`
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/styles/app.css`

---

### Detections Tab and Canvas Boxes

**Trigger:** After project assets are in renderer state; `setFrame` (playback, Assets click, Shift+wheel, A/D, Left/Right)

**Flow:**
Match current `files[frameIndex].name` to `assets[].name` → list that row’s `detections` in `#panel-detections` (label name from `labels` by `labelid`) → draw SVG rects on `#detection-overlay` in image pixel space. YOLO `{ xc, yc, w, h }` normalized → pixel box; VOC `{ xmin, ymin, xmax, ymax }` already pixels. Image and overlay live in `#workspace-view` and share one zoom/pan transform. Stroke 2.2px, unchanged on hover; color from `labelid` via golden-angle HSL (not a fixed palette). Cursor tool: hover shows small corner squares (nw/ne/sw/se); click a box selects it (`is-selected` keeps the corners visible, Labels tab highlights that `labelid`); drag body to move, drag a corner to resize; pointer-up snaps corners to whole pixels then writes YOLO `xc/yc/w/h` as `((x1+x2)/2)/imageSize` and `(x2-x1)/imageSize` (clamped 0–1, 6 decimal places) or integer VOC `value` via `updateProject({ assets })`. On image load (and on that persist), write `width`/`height` for that row if missing or different — skip the write when size is already correct. Frame change clears the selected box.

**Files:**
- `src/renderer/index.html` — `#panel-detections`, `#workspace-view`, `#detection-overlay`
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/styles/app.css`

---

### Box Tool Draw and Crosshair

**Trigger:** Left rail Box tool selected; image previewed

**Flow:**
Selecting Box opens the Labels tab and selects the first label if none is selected. A click-drag on the image (clamped to image pixels) creates a detection with the selected `labelid`. YOLO vs VOC follows `annotationMode`. Stay on Box after create (do not switch to Cursor). Existing boxes ignore pointer while Box is active; a press that hits a box still selects it (label + corner handles). A drag too small (`BOX_MIN_SIZE`) or with no labels is discarded. `#box-crosshair` (sibling SVG in `#workspace-view`) shows horizontal/vertical guides at the pointer in image space — visual only, Box tool only, hidden when the pointer leaves the image.

**Files:**
- `src/renderer/index.html` — `#box-crosshair`
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/styles/app.css`

---

### Zoom Pan Rotate

**Trigger:** `#view-toolbar` (visible only while an image is previewed), mouse wheel on stage, middle-button drag

**Flow:**
Toolbar appears at top-left of `#workspace-stage` when a frame image is shown. Zoom in/out and Fit to Screen are one-shot (never stay selected); Fit resets `zoom=1` and pan. Middle-button drag pans the image (any tool). Ctrl+wheel on the stage `zoomBy` toward the pointer (any tool). Shift+wheel on Cursor steps `setFrame` ±1 (80ms cooldown); A / ArrowLeft and D / ArrowRight step frames (any tool; ignored while typing or when a dialog/input is focused); plain wheel does not change the frame; Box/Hexagon no-op. Rotate → `rotateImage` (sharp 90° CW overwrite) → reload `vfimg` src with cache-bust → re-fit. `#workspace-view` wraps the image and `#detection-overlay` so boxes stay aligned. `showWorkspace` selects the Cursor tool.

**Files:**
- `src/renderer/scripts/workspace-canvas.js`
- `src/renderer/index.html` — `#view-toolbar`
- `src/main/middleware/image-service.js`
- `src/main/services/image-protocol.js`

---

### App Startup

**Trigger:** `npm start` or packaged app launch

**Flow:**
`scripts/start-electron.js` → `src/main/index.js` → `app.whenReady` → `bootstrap()` → register splash IPC → create/show splash → lazy-load `register.js` + `main-window.js` → create main window (hidden) → wait `did-finish-load` → close splash → maximize/show main

**Files:**
- `scripts/start-electron.js`
- `src/main/index.js`
- `src/main/ipc/register-splash-handlers.js`
- `src/main/ipc/register.js`
- `src/main/windows/splash-window.js`
- `src/main/windows/main-window.js`

---

### Splash Status Updates

**Trigger:** Main process `sendSplashStatus()` during bootstrap

**Flow:**
`index.js` `sendSplashStatus` → `webContents.send(SPLASH_STATUS)` → splash preload `onSplashStatus` → `splash.js` updates `#splash-status-text` + spinner

**Files:**
- `src/main/index.js`
- `src/shared/ipc/channels.js`
- `src/preload/splash-preload.js`
- `src/renderer/scripts/splash.js`

---

### Window Control (Minimize / Maximize / Close)

**Trigger:** User clicks window control buttons or double-clicks chrome header

**Flow:**
`window-controls.js` → `window.visionforge.*Window()` → preload invoke → `register.js` → `BrowserWindow.fromWebContents` → window API

**Files:**
- `src/renderer/scripts/window-controls.js`
- `src/preload/index.js`
- `src/main/ipc/register.js`

---

### Icon Generation

**Trigger:** `npm run generate:icon` or `prebuild:win`

**Flow:**
`generate-windows-icon.js` → read `VisionForge.png` → sharp resize → `png-to-ico` → write `build/icon.ico` + `build/icon.png`

**Files:**
- `scripts/generate-windows-icon.js`
- `src/renderer/images/logo/VisionForge.png`
- `build/icon.ico`, `build/icon.png`

---

### Dev Electron Icon Patch

**Trigger:** `postinstall` after `npm install` (Windows only)

**Flow:**
`patch-electron-icon.js` → `rcedit` patches `node_modules/electron/dist/electron.exe` with `build/icon.ico`

**Files:**
- `scripts/patch-electron-icon.js`
- `build/icon.ico`

---

### CI Windows Release

**Trigger:** Manual `workflow_dispatch` in GitHub Actions with tag input

**Flow:**
checkout → Node 20 → `npm ci` → `npm run build:win` → upload `dist/*.exe` to GitHub Release

**Files:**
- `.github/workflows/build-windows.yml`
- `package.json`

---

## File Responsibility Map

| Responsibility | File(s) |
|----------------|---------|
| App entry & bootstrap | `src/main/index.js` |
| Main window creation | `src/main/windows/main-window.js` |
| Splash window creation | `src/main/windows/splash-window.js` |
| Main IPC handlers | `src/main/ipc/register.js` |
| Splash IPC handlers | `src/main/ipc/register-splash-handlers.js` |
| App metadata builder | `src/main/ipc/app-info.js` |
| IPC channel constants | `src/shared/ipc/channels.js` |
| Main preload bridge | `src/preload/index.js` |
| Splash preload bridge | `src/preload/splash-preload.js` |
| Logging service | `src/main/services/visionforge-logger.js` |
| Log file store | `src/main/services/log-file-store.js` |
| Solution history store | `src/main/services/history-solutions-store.js` |
| Renderer logger | `src/renderer/scripts/renderer-logger.js` |
| App icon resolver | `src/main/helpers/app-icon.js` |
| License registration | `src/main/services/license-service.js` |
| Release update UI | `src/renderer/scripts/release-update-panel.js` |
| Workspace canvas / playback | `src/renderer/scripts/workspace-canvas.js` |
| Workspace panels | `src/renderer/scripts/workspace-panels.js` |
| Image protocol (`vfimg:`) | `src/main/services/image-protocol.js` |
| Image rotate service | `src/main/middleware/image-service.js` |
| Start page | `src/renderer/scripts/start-page.js` |
| Create project dialog | `src/renderer/scripts/create-project-dialog.js` |
| Annotation type/mode catalog | `src/shared/enums/annotation-types.js` |
| Project solution service | `src/main/middleware/project-service.js` |
| Detection import service | `src/main/middleware/detection-import-service.js` |
| Main UI shell | `src/renderer/index.html` |
| Splash UI | `src/renderer/splash.html` |
| Window controls UI logic | `src/renderer/scripts/window-controls.js` |
| Splash UI logic | `src/renderer/scripts/splash.js` |
| Main styles | `src/renderer/styles/app.css` |
| Splash styles | `src/renderer/styles/splash.css` |
| App logo asset | `src/renderer/images/logo/VisionForge.png` |
| Dev launcher | `scripts/start-electron.js` |
| Icon pipeline | `scripts/generate-windows-icon.js`, `scripts/patch-electron-icon.js` |
| Build config | `package.json` (`build` block) |
| CI release | `.github/workflows/build-windows.yml` |
| Debug config | `.vscode/launch.json` |
| Future business logic | `src/main/middleware/` (project-service.js exists) |
| Future enums/DTOs | `src/shared/enums/` (`annotation-types.js` exists) |
| Future about screen | `src/renderer/screens/about/` (empty) |
| Test placeholders | `tests/main/`, `tests/unit/` |

---

## Data Flow Map

### Renderer → Main (invoke/handle)

```
Renderer JS
  → window.visionforge.method()
  → preload contextBridge
  → ipcRenderer.invoke("visionforge:*")
  → ipcMain.handle() in register.js | register-splash-handlers.js
  → Electron API | app-info.js | visionforge-logger.js
  → return value to renderer
```

### Main → Renderer (push)

```
Main process (index.js)
  → webContents.send("visionforge:splash-status", payload)
  → splash preload ipcRenderer.on
  → splash.js callback
  → DOM update
```

### Planned future flow (not implemented)

```
Renderer
  → window.visionforge.*
  → register.js (thin handler)
  → middleware/*.js (business logic)
  → services/*.js (file I/O, HTTP)
  → Documents/VisionForge/ (local files)
```

---

## Integration Registry

### electron-log

| Field | Value |
|-------|-------|
| Purpose | Structured logging (main + renderer relay) |
| Files | `src/main/services/visionforge-logger.js`, `src/main/services/log-file-store.js`, `src/renderer/scripts/renderer-logger.js` |
| Auth | N/A (local npm package) |
| Entry | `require("electron-log")` in logger service |
| Log file | `Documents/VisionForge/Logs/logfile.txt` (1 MB rotation) |

### Font Awesome CDN

| Field | Value |
|-------|-------|
| Purpose | Window control icons in main UI |
| Files | `src/renderer/index.html` |
| Auth | None (public CDN) |
| Entry | `<link>` to cdnjs.cloudflare.com |

### sharp

| Field | Value |
|-------|-------|
| Purpose | Runtime 90° image rotate (overwrite) and build-time icon generation |
| Files | `src/main/middleware/image-service.js`, `scripts/generate-windows-icon.js` |
| Auth | N/A (npm dependency) |
| Entry | `require("sharp")`; packaged via `asarUnpack` for `sharp` / `@img` |

### rcedit

| Field | Value |
|-------|-------|
| Purpose | Patch dev `electron.exe` icon on Windows postinstall |
| Files | `scripts/patch-electron-icon.js` |
| Auth | N/A (dev dependency) |
| Entry | `postinstall` script |

### electron-builder

| Field | Value |
|-------|-------|
| Purpose | Windows NSIS installer packaging |
| Files | `package.json` build block |
| Auth | N/A |
| Entry | `npm run build:win` |

### GitHub Actions + softprops/action-gh-release

| Field | Value |
|-------|-------|
| Purpose | Manual Windows build and release upload |
| Files | `.github/workflows/build-windows.yml` |
| Auth | `GITHUB_TOKEN` (Actions default) |
| Entry | `workflow_dispatch` with tag input |

### shell.openExternal (Electron)

| Field | Value |
|-------|-------|
| Purpose | Open HTTPS URLs in default browser |
| Files | `src/main/ipc/register-splash-handlers.js` |
| Auth | N/A |
| Entry | `visionforge:open-external-url` IPC |

---

## Dependency Impact Map

### `src/shared/ipc/channels.js`

**Changing impacts:**
- `src/preload/index.js`
- `src/preload/splash-preload.js`
- `src/main/ipc/register.js`
- `src/main/ipc/register-splash-handlers.js`
- `src/main/index.js` (SPLASH_STATUS send)

### `src/preload/index.js`

**Changing impacts:**
- All main renderer scripts using `window.visionforge`
- `src/renderer/scripts/window-controls.js`
- `src/renderer/scripts/start-page.js`
- `src/renderer/scripts/create-project-dialog.js`
- `src/renderer/scripts/workspace-canvas.js`

### `src/preload/splash-preload.js`

**Changing impacts:**
- `src/renderer/scripts/splash.js`

### `src/main/index.js`

**Changing impacts:**
- App startup timing
- Splash → main transition
- `vfimg:` protocol registration
- All bootstrap-dependent behavior

### `src/main/ipc/register.js`

**Changing impacts:**
- Main window IPC capabilities
- `window-controls.js` behavior

### `src/main/ipc/register-splash-handlers.js`

**Changing impacts:**
- Splash screen IPC
- App quit from splash
- External URL opening

### `src/main/ipc/app-info.js`

**Changing impacts:**
- Splash version label
- Future about modal

### `src/shared/enums/annotation-types.js`

**Changing impacts:**
- Create-project type dropdown and mode radios
- `createProject` validation (`isValidAnnotation`)

### `src/main/middleware/project-service.js`

**Changing impacts:**
- Create / open / load / update / close `.VFSln` session
- Image folder picker and listing
- Append-only `assets` sync
- Start page and workspace canvas
- `vfimg:` allowed directory

### `src/main/middleware/detection-import-service.js`

**Changing impacts:**
- Empty `assets[].detections` filled from YOLO txt / VOC xml sidecars
- VFSln write on load and after `imagesFolder` save

### `package.json` (build block)

**Changing impacts:**
- Installer name/output
- App ID, product name
- Packaged file inclusion
- `extraResources` copies `build/icon.png` → `icon.png` for packaged taskbar/window icon resolution
- `asarUnpack` for `sharp` / `@img` native binaries

### `scripts/generate-windows-icon.js` / logo asset

**Changing impacts:**
- `build/icon.ico`, `build/icon.png`
- App/window icons
- `patch-electron-icon.js` output

---

## Known Conventions

| Convention | Detail |
|------------|--------|
| Folder layout | `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/` |
| File names | kebab-case (`visionforge-logger.js`, `register-splash-handlers.js`) |
| Class names | PascalCase (when classes are added) |
| IPC channels | `visionforge:<kebab-action>` |
| Preload global | `window.visionforge` |
| Middleware export | `module.exports = new XMiddleware()` (planned) |
| Renderer scripts | IIFE pattern: `(function () { ... })();` |
| Window preload | Separate preload per window (main vs splash) |
| CSS | Dark theme (`#0b0b0d` main, `#0f1419` splash) |
| Storage path (planned) | `Documents/VisionForge/` |
| App artifact name | `VisionForge Release LTS.exe` |
| Node version (CI) | 20 |
| Module system | CommonJS (`require` / `module.exports`) |
| HTML loading | `win.loadFile()` — no dev server |
| Chrome drag region | `-webkit-app-region: drag` on header; `no-drag` on buttons |

---

## IPC Channel Reference

| Channel | Direction | Handler | Purpose |
|---------|-----------|---------|---------|
| `visionforge:ping` | invoke | `register.js` | Health check → `"pong"` |
| `visionforge:open-devtools` | invoke | `register.js` | Open detached DevTools |
| `visionforge:get-app-info` | invoke | `register-splash-handlers.js` | App metadata |
| `visionforge:open-external-url` | invoke | `register-splash-handlers.js` | Open HTTPS URL in browser |
| `visionforge:quit-app` | invoke | `register-splash-handlers.js` | `app.quit()` |
| `visionforge:splash-status` | push (main→renderer) | `index.js` send | Splash status text |
| `visionforge:splash-log` | send (renderer→main) | `register-splash-handlers.js` | Relay splash logs |
| `visionforge:window-minimize` | invoke | `register.js` | Minimize window |
| `visionforge:window-maximize` | invoke | `register.js` | Toggle maximize |
| `visionforge:window-close` | invoke | `register.js` | Close window |
| `visionforge:window-is-maximized` | invoke | `register.js` | Query maximize state |
| `visionforge:select-project-folder` | invoke | `register.js` | Native open-directory dialog |
| `visionforge:select-project-file` | invoke | `register.js` | Native open-file dialog (`.VFSln` filter) |
| `visionforge:get-solution-history` | invoke | `register.js` | Read `history-solutions.vfson` recents |
| `visionforge:create-project` | invoke | `register.js` | Write `{Name}.VFSln` with `annotationType` / `annotationMode` / `assets: []` |
| `visionforge:select-images-folder` | invoke | `register.js` | Native open-directory dialog for images |
| `visionforge:list-image-folder` | invoke | `register.js` | List image files in a folder (non-recursive) |
| `visionforge:load-project` | invoke | `register.js` | Read `.VFSln`, sync `assets`, import empty detections, record history |
| `visionforge:update-project` | invoke | `register.js` | Merge keys into `.VFSln` and write (`imagesFolder` also syncs assets + detections) |
| `visionforge:rotate-image` | invoke | `register.js` | Rotate image 90° CW and overwrite file |
| `visionforge:close-project` | invoke | `register.js` | Clear `vfimg:` allowed dir (end open-project session) |

---

## Maintenance Rules

### When to update this file

| Change type | Action |
|-------------|--------|
| New feature added | Add to Feature Registry + Workflow Registry + File Map |
| Feature removed | Remove from all sections |
| Workflow changed | Update Workflow Registry + Data Flow Map |
| IPC channel added/removed | Update IPC Reference + preload sync notes |
| File moved/renamed | Update File Responsibility Map + Feature entries |
| New integration | Add to Integration Registry |
| Architecture rule added | Update Architecture Rules |
| Middleware/service added | Update Feature Registry + Dependency Impact Map |
| Build/CI change | Update Project Summary + Integration Registry |
| Naming convention change | Update Known Conventions |

### What agents must never do

| Forbidden action | Instead |
|------------------|---------|
| `git add` / `git commit` | Edit files only; tell user what to commit |
| `git push` / `git tag` | User publishes manually |
| `gh release create` / GitHub release | User runs **Build Windows** workflow manually with tag input |
| Staging or committing on user's behalf | List changed files and stop |

---

## Current State Notes (as of v1.0.0)

- **Splash/bootstrap** follows CryptoGenesis-style flow (license gate, 1s transition delay)
- **Minimize** uses `win.minimize()` so the app stays on the Windows taskbar (no system tray)
- **Main window** maximizes after splash (not fullscreen)
- **App logo** at `src/renderer/images/logo/VisionForge.png`
- **Create project** writes `{Name}.VFSln` (JSON: format, version, name, imagesFolder, labels, assets, annotationType, annotationMode). Annotation type/mode come from the create dialog catalog and are required for new projects. All project config belongs in that file.
- **Open existing project** / **Recent** loads the `.VFSln` and shows the workspace canvas (playback bar + Assets tab). `loadProject` appends missing image names to `assets` and fills empty `detections` from sidecar txt/xml.
- **Labels:** if VFSln `labels` is empty, import `{project-folder}/classes.txt` then `{imagesFolder}/classes.txt` as `{ id, name }` (id from 0) and list them in the Labels tab. Existing labels are never overwritten by that import. **Add**, **rename**, and **delete** write VFSln `labels` only (never `classes.txt`). Rename keeps the same `id`; delete does not renumber remaining ids.
- **Image folder** is picked via File → Select Image Folder or the Select Images tool; path is stored as `imagesFolder` in the VFSln and restored on open. That save also syncs `assets` (append-only) and imports empty detections.
- **Assets (VFSln):** `{ name, width, height, detections: [{ labelid, value }] }`. Append-only; playback still lists the folder. `width`/`height` filled when that image is previewed (or on box persist). YOLO `value` is `{ xc, yc, w, h }` with `xc = ((x1+x2)/2)/image_width` (same pattern for `yc`, `w`, `h`), clamped to 0–1 and written to 6 decimal places on edit (LabelImg / Ultralytics style); VOC is integer `{ xmin, ymin, xmax, ymax }`. Non-empty detections are not overwritten by sidecar import.
- **Loading project overlay:** non-dismissible spinner during `loadProject` / `imagesFolder` save until the image list is ready.
- **Detections tab:** lists VFSln detections for the current image (label name by `labelid`); refreshes on frame change.
- **Canvas boxes:** SVG overlay in `#workspace-view` with the image (shared zoom/pan transform). Stroke 2.2px (does not thicken on hover). Color is derived from `labelid` (golden-angle HSL), not a fixed palette. Cursor hover shows small corner squares; the selected box keeps those squares visible. Drag body to move, drag a corner to resize; persist YOLO as `((x1+x2)/2)/imageSize` and `(x2-x1)/imageSize` (0–1, 6 decimal places) or integer VOC on release. Click a box selects it and its Labels-tab class.
- **Box tool:** click-drag on the image creates a box (clamped to the image) using the selected Labels-tab class; stays on Box after create. Selecting Box opens the Labels tab (first label if none selected). Crosshair lines follow the cursor over the image (visual only).
- **Playback** range follows the count of image files in that folder (`png`, `jpg`, `jpeg`, `webp`, `bmp`, `gif`, `tif`, `tiff`). Current frame is previewed fit-to-screen via `vfimg:`. A / ArrowLeft and D / ArrowRight step ±1 (ignored while typing).
- **Assets** is the first/default inspector tab.
- **Zoom / Rotate:** `#view-toolbar` on the stage (only when an image is previewed): zoom in/out and Fit to Screen are one-shot (never stay selected); Fit resets view; zoom-out below fit snaps to Fit to Screen. Rotate overwrites the current file 90° clockwise (`sharp`). Cursor is selected on project load. Middle-button drag pans the image. Ctrl+wheel zooms toward the pointer; Shift+wheel on Cursor steps assets; A / Left and D / Right step frames (any tool); plain wheel does not change the frame; Box/Hexagon ignore.
- **Goto Startup page:** File menu item (enabled while a project is open) closes the workspace and returns to `#start-page` without deleting the VFSln or recents.
- **Recent projects** come from `Documents/VisionForge/history-solutions.vfson` (create/open upsert, max 20).
- **No tests** — `tests/` contains `.gitkeep` placeholders only
- **Workspace folder** is `49. PixelTag` on disk; product name is **VisionForge**
