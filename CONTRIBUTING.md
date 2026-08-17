# Contributing to VisionForge

Thanks for helping improve VisionForge. This guide covers local setup, architecture rules, and how to submit changes.

## Prerequisites

- Node.js 20+
- npm
- Windows is required for the installer build and the Electron icon patch scripts

## Local setup

```bash
npm install
npm run generate:icon
npm start
```

The Windows installer is produced with:

```bash
npm run build:win
```

Output: `dist/VisionForge Release LTS.exe`.

## Project layout

```
src/
├── main/       # Electron main process (windows, IPC, services)
├── preload/    # contextBridge API exposed to renderer
├── renderer/   # HTML, CSS, and UI scripts
└── shared/     # IPC channel names and shared constants
```

- Business logic belongs in `src/main/middleware/` (currently empty).
- Cross-cutting helpers (logging, file I/O, HTTP) belong in `src/main/services/`.
- IPC handlers in `src/main/ipc/` are thin routers — keep business logic out of them.

## Architecture rules

- Renderer must not use Node.js APIs (`fs`, `ipcMain`, etc.).
- Renderer talks to the main process only through `window.visionforge` (preload `contextBridge`).
- All IPC channel names live in `src/shared/ipc/channels.js`. Preload files duplicate those strings inline (sandbox-safe) and must stay in sync.
- Source files are loaded directly by Electron — there is no bundler (no Webpack/Vite).
- Use CommonJS (`require` / `module.exports`).
- Source file names are kebab-case (`visionforge-logger.js`).
- Each window has its own preload (`src/preload/index.js` for main, `src/preload/splash-preload.js` for splash).
- Renderer scripts use an IIFE: `(function () { ... })();`.

## Logging

Do not use raw `console.log` in app code.

Main process:

```js
const { createLogger } = require("./services/visionforge-logger");
const log = createLogger("my-module");
log.enter("methodName");
log.info("message", { key: "value" });
log.exit("methodName", startedAt);
```

Renderer (include `renderer-logger.js` before feature scripts):

```js
const log = VisionForgeLogger.create("my-feature");
log.info("message", { key: "value" });
```

- Give every new module a unique kebab-case namespace.
- Production default is `info`. Use `debug` for verbose tracing only.
- Override with `VISIONFORGE_LOG_LEVEL=debug`.
- Log file: `Documents/VisionForge/Logs/logfile.txt`.

## Pull requests

- Describe why the change exists, not only what changed.
- Keep IPC channel names, preload bridges, and handlers in sync.
- Add a bullet under `[Unreleased]` in `CHANGELOG.md`.
- Update `context.md` if you add or change features, workflows, IPC channels, or architecture.
- There is no test suite yet (`tests/` is a placeholder). If you add tests, keep them next to the layer they cover (`tests/main/`, `tests/unit/`).

## Releases

Version bumps and changelog dating are done in the repo first (`package.json`, `CHANGELOG.md`). Then run the **Build Windows** GitHub Actions workflow with a release tag (for example `v1.0.0`). That workflow packages the NSIS installer and attaches it to the GitHub Release.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
