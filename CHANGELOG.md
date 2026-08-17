# Changelog

All notable changes to VisionForge are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
