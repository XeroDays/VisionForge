# Changelog

All notable changes to VisionForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.3] - 2026-08-25

### Fixed

- New Release Available and ForceUpdate now follow the Flowter splash handoff: Register during splash, `LICENSE_UPDATE` before the main window shows, gold glow button top-right, and a non-dismissible download modal that blocks Create / Open / Recent.

## [1.0.2] - 2026-08-25

### Added

- Project workspace: create/open `.VFSln` solutions, recent list, image-folder playback, and canvas preview (`vfimg:`).
- Inspector Assets / Labels / Detections tabs, Box-tool drawing, and YOLO/VOC detections stored on each asset.
- File and titlebar **Export** for YOLO `.txt` or Pascal VOC `.xml` sidecars plus `classes.txt`.
- Settings AI Model, Process Image preview, and Auto detect (ONNX). After Auto detect, **Revert** restores the previous boxes until the image changes.
- Assets-tab detection-count chips, right-click Delete (image + sidecars + VFSln row), and auto-scroll to the current file.
- Custom thin scrollbar matching the dark gold theme.

### Changed

- Main window minimize stays on the Windows taskbar (no system tray).

## [1.0.0] - 2026-08-17

### Added

- Splash license gate that registers with Softasium before the main window opens.
- Frameless main window with custom chrome (minimize, maximize/restore, close).
- System tray restore after minimize.
- In-app release update panel for download and install when an update is available.
- Workspace chrome: left tools rail and resizable right inspector (visual shell only; no domain tools yet).
- Structured logging in main and renderer, written to `Documents/VisionForge/Logs/logfile.txt`.
- Windows NSIS installer (`VisionForge Release LTS.exe`) via electron-builder.
- Manual GitHub Actions workflow to build Windows and attach the installer to a release.
