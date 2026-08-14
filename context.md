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
| **Storage (planned)** | `Documents/VisionForge/` — not implemented yet |
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
| Lazy bootstrap | Heavy modules loaded via `setImmediate` after splash shows (IPC, windows, license, icon, tray) |
| Splash load gate | Wait for splash `did-finish-load` before `splash.show()` |
| Main presentation | **Maximize** main window after splash (not fullscreen) |
| Minimize behavior | Main window minimize hides to system tray (`hideToTray`) |
| Tray | Created after successful bootstrap via `helpers/tray.js` |
| Logo asset | `src/renderer/images/logo/VisionForge.png` (dev + splash); packaged `icon.png` via `helpers/app-icon.js` |
| Logging | Main process uses `visionforge-logger.js` (`electron-log`); level via `VISIONFORGE_LOG_LEVEL` env |
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
`app.whenReady` → register splash IPC → create splash → wait splash load → show → `"Starting…"` → lazy-load IPC/windows/license/icon/tray → create hidden main → parallel license register (`"Checking for updates…"`) + main load → on deny stay on splash / on grant `"Loading workspace…"` (1s) → `LICENSE_UPDATE` → close splash → maximize/show main → create tray

---

### System Tray

**Purpose:** Minimize-to-tray and restore main window after bootstrap.

**Primary Files:**
- `src/main/helpers/tray.js`
- `src/main/ipc/register.js` — `WINDOW_MINIMIZE` → `hideToTray`

**Workflow:**
Minimize button → hide to tray → tray Show/click → `showFromTray` + maximize

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
Button click → `window.visionforge.*Window()` → preload invoke → `register.js` → `BrowserWindow` API

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

**Purpose:** Structured main-process logging with boot timing and renderer log relay.

**Entry Points:**
- `src/main/services/visionforge-logger.js`

**Primary Files:**
- `src/main/services/visionforge-logger.js`

**Related Files:**
- All `src/main/` modules import `startup`, `splash`, or `ipc` loggers
- `register-splash-handlers.js` — `SPLASH_LOG` handler

**Dependencies:**
- `electron-log` npm package
- `VISIONFORGE_LOG_LEVEL` env var (`debug` | `info` | `warn` | `error`)

**Workflow:**
Main: `log.enter/exit/mark` → console + file via electron-log
Splash renderer: `visionforge.log()` → `SPLASH_LOG` → `logFromRenderer()`

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

### Middleware Layer (Placeholder)

**Purpose:** Reserved for future business logic. Currently empty.

**Entry Points:** None active

**Primary Files:**
- `src/main/middleware/.gitkeep`

**Workflow:** Not implemented — IPC handlers will delegate here when features are added.

---

## Workflow Registry

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
| App icon resolver | `src/main/helpers/app-icon.js` |
| System tray | `src/main/helpers/tray.js` |
| License registration | `src/main/services/license-service.js` |
| Release update UI | `src/renderer/scripts/release-update-panel.js` |
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
| Future business logic | `src/main/middleware/` (empty) |
| Future enums/DTOs | `src/shared/enums/` (empty) |
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
| Purpose | Main-process structured logging |
| Files | `src/main/services/visionforge-logger.js` |
| Auth | N/A (local npm package) |
| Entry | `require("electron-log")` in logger service |

### Font Awesome CDN

| Field | Value |
|-------|-------|
| Purpose | Window control icons in main UI |
| Files | `src/renderer/index.html` |
| Auth | None (public CDN) |
| Entry | `<link>` to cdnjs.cloudflare.com |

### sharp + png-to-ico

| Field | Value |
|-------|-------|
| Purpose | Build-time icon generation |
| Files | `scripts/generate-windows-icon.js` |
| Auth | N/A (dev dependency) |
| Entry | `npm run generate:icon` |

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

### `src/preload/splash-preload.js`

**Changing impacts:**
- `src/renderer/scripts/splash.js`

### `src/main/index.js`

**Changing impacts:**
- App startup timing
- Splash → main transition
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

### `package.json` (build block)

**Changing impacts:**
- Installer name/output
- App ID, product name
- Packaged file inclusion
- `extraResources` copies `build/icon.png` → `icon.png` for packaged tray/taskbar icon resolution

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

- **Splash/bootstrap** follows CryptoGenesis-style flow (license gate, 1s transition delay, tray on success)
- **Main window** maximizes after splash (not fullscreen)
- **App logo** at `src/renderer/images/logo/VisionForge.png`
- **No domain features** — main UI is a welcome placeholder only
- **No middleware implementations** — `src/main/middleware/` is empty
- **No persistence** — no file storage, database, or DTOs
- **No tests** — `tests/` contains `.gitkeep` placeholders only
- **Workspace folder** is `49. PixelTag` on disk; product name is **VisionForge**
