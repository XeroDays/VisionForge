# Changelog

All notable changes to VisionForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Settings AI Model: **Oriented Object Detection** is selectable. Process Image and Auto detect run YOLO OBB ONNX (rotated boxes) when that type is applied.
- Settings model-type dropdown now matches the create-project catalog: Image Classification and Instance Segmentation are visible, disabled, and marked **Coming soon**.
- Settings AI Model **Confidence** slider (1–99%, default 25%). Stored on the open `.VFSln` as `onnxConfidence` and used by Process Image and Auto detect. Disabled on the start page until a project is open.

## [1.0.4] - 2026-09-18

### Added

- Start page Recent projects: right-click a row and choose **Remove from list** to drop that entry from history (does not delete the project file).
- Oriented Object Detection: with a box selected, Alt+wheel rotates it by 1°.
- Oriented Object Detection **YOLO OBB** export writes `{basename}.txt` (`labelid` plus 8 normalized corners) and `classes.txt`.

### Changed

- Create Project annotation-type dropdown now shows all catalog types but only **Object Detection — Bounding Box** is selectable. All other types are visible, disabled, and marked with a **Coming soon** badge. The dialog defaults to Object Detection — Bounding Box.
- Removed the **Axis-aligned rectangle** annotation mode. Export mode radios now show the file extension, and each remaining mode writes its real format: YOLO and center-based `{basename}.txt` plus `classes.txt`, Pascal VOC `{basename}.xml`, and COCO `annotations.json`.
- Removed the unused Hexagon tool from the left tools rail on Bounding Box projects. Oriented Object Detection is now creatable; those projects show Hexagon instead of Box (**W** still toggles the draw tool). Draw a rectangle, then rotate it with the selected-box handle (Shift snaps 15°).

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
