# VisionForge

VisionForge is an Electron desktop application built with a main/preload/renderer/shared architecture.

## Prerequisites

- Node.js 20+
- npm

## Development

```bash
npm install
npm run generate:icon
npm start
```

## Build (Windows)

```bash
npm run build:win
```

The installer is written to `dist/VisionForgev{version}.exe` (for the current version, `dist/VisionForgev1.0.9.exe`). `{version}` is the `version` field in `package.json`.

## Project Structure

```
src/
├── main/       # Electron main process (windows, IPC, services)
├── preload/    # contextBridge API exposed to renderer
├── renderer/   # HTML, CSS, and UI scripts
└── shared/     # IPC channel names and shared constants
```
