const { app, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");
const licenseCacheStore = require("./license-cache-store");
const { buildDeviceInfoString, buildDeviceInfoFromParts, prefetchRegistrationRegistryAsync } = require("./device-info-builder");
const { license: log, truncate } = require("./visionforge-logger");

const REGISTER_URL = "https://api.softasium.com/api/SoftwareLicencing/Register";
const LICENSE_AUTH_BEARER = "iamsyedidrees@gmail.com";
const BUILD_VERSION = 1;
const FALLBACK_INSTALLER_NAME = "VisionForge-Update.exe";

class LicenseService {
  static SoftwareAppID = "VisionForge";

  constructor() {
    this._cached = null;
    this._downloading = false;
    this._fallbackDeviceUUID = null;
    this._deviceInfoCache = null;
    this._prefetchedDeviceUUID = null;
    this._prefetchPromise = null;
  }

  getBuildVersion() {
    return BUILD_VERSION;
  }

  getVersionName() {
    try {
      return require("../../../package.json").version || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  prefetchRegistrationData() {
    if (!this._prefetchPromise) {
      this._prefetchPromise = this.#loadRegistrationData();
    }
    return this._prefetchPromise;
  }

  async #loadRegistrationData() {
    const startedAt = log.enter("prefetchRegistrationData");
    const { machineGuid, versionValues } = await log.timed(
      "prefetchRegistrationRegistryAsync",
      () => prefetchRegistrationRegistryAsync()
    );
    const deviceUUID = await this.#resolveDeviceUUID(machineGuid);
    this._prefetchedDeviceUUID = deviceUUID;
    this._deviceInfoCache = buildDeviceInfoFromParts(deviceUUID, versionValues);
    log.exit("prefetchRegistrationData", startedAt, {
      deviceUUID: truncate(deviceUUID),
      deviceInfoLength: String(this._deviceInfoCache || "").length,
    });
    return { deviceUUID, deviceInfo: this._deviceInfoCache };
  }

  async #resolveDeviceUUID(machineGuid) {
    if (machineGuid) {
      return machineGuid;
    }
    if (process.platform !== "win32") {
      log.warn("MachineGuid is Windows-only; using in-memory fallback UUID");
    } else {
      log.warn("failed to read MachineGuid");
    }
    if (!this._fallbackDeviceUUID) {
      this._fallbackDeviceUUID = crypto.randomUUID();
    }
    return this._fallbackDeviceUUID;
  }

  getDeviceInfo(deviceUUID) {
    if (this._deviceInfoCache) {
      return this._deviceInfoCache;
    }
    const uuid = deviceUUID || this.getOrCreateDeviceUUID();
    this._deviceInfoCache = this.#buildDeviceInfo(uuid);
    return this._deviceInfoCache;
  }

  async getDeviceInfoAsync(deviceUUID) {
    if (this._deviceInfoCache) {
      log.debug("getDeviceInfoAsync cache hit");
      return this._deviceInfoCache;
    }

    const startedAt = log.enter("getDeviceInfoAsync");
    const uuid = deviceUUID || await this.getOrCreateDeviceUUIDAsync();
    this._deviceInfoCache = this.#buildDeviceInfo(uuid);
    log.exit("getDeviceInfoAsync", startedAt);
    return this._deviceInfoCache;
  }

  #buildDeviceInfo(deviceUUID) {
    const id = String(deviceUUID || "").trim().toUpperCase() || "Unknown";
    return buildDeviceInfoString(id);
  }

  getOrCreateDeviceUUID() {
    const startedAt = log.enter("getOrCreateDeviceUUID");
    if (this._prefetchedDeviceUUID) {
      log.exit("getOrCreateDeviceUUID", startedAt, { source: "prefetch", deviceUUID: truncate(this._prefetchedDeviceUUID) });
      return this._prefetchedDeviceUUID;
    }
    if (process.platform === "win32") {
      const { readRegSz } = require("./device-info-builder");
      const guid = readRegSz("HKLM\\SOFTWARE\\Microsoft\\Cryptography", "MachineGuid");
      if (guid) {
        log.exit("getOrCreateDeviceUUID", startedAt, { source: "registry", deviceUUID: truncate(guid) });
        return guid;
      }
      log.warn("failed to read MachineGuid");
    } else {
      log.warn("MachineGuid is Windows-only; using in-memory fallback UUID");
    }

    if (!this._fallbackDeviceUUID) {
      this._fallbackDeviceUUID = crypto.randomUUID();
    }
    log.exit("getOrCreateDeviceUUID", startedAt, { source: "fallback", deviceUUID: truncate(this._fallbackDeviceUUID) });
    return this._fallbackDeviceUUID;
  }

  async getOrCreateDeviceUUIDAsync() {
    if (this._prefetchedDeviceUUID) {
      return this._prefetchedDeviceUUID;
    }

    const startedAt = log.enter("getOrCreateDeviceUUIDAsync");
    const { machineGuid } = await prefetchRegistrationRegistryAsync();
    const deviceUUID = await this.#resolveDeviceUUID(machineGuid);
    log.exit("getOrCreateDeviceUUIDAsync", startedAt, {
      source: machineGuid ? "registry" : "fallback",
      deviceUUID: truncate(deviceUUID),
    });
    return deviceUUID;
  }

  #sanitizeFilenamePart(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim();
  }

  #getDownloadExtension(downloadUrl) {
    if (!downloadUrl || typeof downloadUrl !== "string") {
      return "";
    }
    try {
      const pathname = new URL(downloadUrl).pathname || "";
      return path.extname(pathname) || "";
    } catch {
      return "";
    }
  }

  #getInstallerFilenameFromUrl(downloadUrl) {
    if (!downloadUrl || typeof downloadUrl !== "string") {
      return "";
    }
    try {
      const pathname = new URL(downloadUrl).pathname || "";
      const base = path.basename(pathname);
      if (base && base !== "/" && base !== ".") {
        return decodeURIComponent(base);
      }
    } catch {
      // fallback
    }
    return "";
  }

  getInstallerFilename(payload, downloadUrl) {
    const ext = this.#getDownloadExtension(downloadUrl);
    if (!payload || typeof payload !== "object") {
      return this.#getInstallerFilenameFromUrl(downloadUrl) || FALLBACK_INSTALLER_NAME;
    }

    const appId = this.#getPayloadString(payload, "appID", "AppID") || LicenseService.SoftwareAppID;
    const latestVersion = this.#getPayloadString(payload, "latestVersion", "LatestVersion");
    const buildVersion = this.#getPayloadNumber(payload, "buildVersion", "BuildVersion");

    if (!latestVersion || !Number.isFinite(buildVersion)) {
      return this.#getInstallerFilenameFromUrl(downloadUrl) || FALLBACK_INSTALLER_NAME;
    }

    const safeAppId = this.#sanitizeFilenamePart(appId);
    const safeVersion = this.#sanitizeFilenamePart(latestVersion);
    return `${safeAppId}V.${safeVersion}+${buildVersion}${ext}`;
  }

  getInstallerPath(filename) {
    const safeName = filename || FALLBACK_INSTALLER_NAME;
    return path.join(app.getPath("downloads"), safeName);
  }

  hasLocalInstaller(filename) {
    try {
      return fs.existsSync(this.getInstallerPath(filename));
    } catch {
      return false;
    }
  }

  isAccessGranted(payload) {
    if (!payload || typeof payload !== "object") {
      log.debug("isAccessGranted", { granted: false, reason: "missing-payload" });
      return false;
    }
    const status = payload.status ?? payload.Status;
    const granted = status === true;
    log.debug("isAccessGranted", { granted, status });
    return granted;
  }

  #getPayloadString(payload, camelKey, pascalKey) {
    const value = payload[camelKey] ?? payload[pascalKey];
    return typeof value === "string" ? value.trim() : "";
  }

  #getPayloadNumber(payload, camelKey, pascalKey) {
    return Number(payload[camelKey] ?? payload[pascalKey]);
  }

  isUpdateAvailable(payload) {
    if (!payload || typeof payload !== "object") return false;
    const remoteBuild = this.#getPayloadNumber(payload, "buildVersion", "BuildVersion");
    if (!Number.isFinite(remoteBuild)) return false;
    return this.getBuildVersion() < remoteBuild;
  }

  #buildRegisterResult(fromCache = false) {
    const base = this.getCachedUpdate();
    return {
      ...base,
      accessGranted: this.isAccessGranted(this._cached),
      fromCache,
    };
  }

  getCachedUpdate() {
    const payload = this._cached;
    if (!payload) {
      return {
        ok: false,
        payload: null,
        updateAvailable: false,
        installerExists: false,
        filename: null,
        accessGranted: false,
      };
    }
    const downloadUrl = this.#getPayloadString(payload, "downloadUrl", "DownloadUrl");
    const filename = this.getInstallerFilename(payload, downloadUrl);
    return {
      ok: true,
      payload,
      updateAvailable: this.isUpdateAvailable(payload),
      installerExists: this.hasLocalInstaller(filename),
      filename,
      accessGranted: this.isAccessGranted(payload),
    };
  }

  async register() {
    const startedAt = log.enter("register");
    const { deviceUUID, deviceInfo } = await this.prefetchRegistrationData();
    const body = {
      DeviceUUID: deviceUUID,
      DeviceInfo: deviceInfo,
      AppID: LicenseService.SoftwareAppID,
      BuildVersion: this.getBuildVersion(),
      VersionName: this.getVersionName(),
    };

    log.info("register payload prepared", {
      DeviceUUID: truncate(deviceUUID),
      AppID: body.AppID,
      BuildVersion: body.BuildVersion,
      VersionName: body.VersionName,
      DeviceInfoLength: String(deviceInfo || "").length,
    });

    try {
      const response = await this.#postJson(REGISTER_URL, body);
      this._cached = response && typeof response === "object" ? response : null;
      if (this._cached) {
        licenseCacheStore.saveRegisterResponse(this._cached);
      }
      const result = this.#buildRegisterResult(false);
      log.exit("register", startedAt, {
        accessGranted: result.accessGranted,
        fromCache: result.fromCache,
        updateAvailable: result.updateAvailable,
      });
      return result;
    } catch (err) {
      log.error("register failed", { error: String(err.message || err) });
      const cached = licenseCacheStore.loadRegisterResponse();
      if (cached) {
        log.warn("using cached register response");
        this._cached = cached;
        const result = this.#buildRegisterResult(true);
        log.exit("register", startedAt, {
          accessGranted: result.accessGranted,
          fromCache: true,
          updateAvailable: result.updateAvailable,
        });
        return result;
      }
      this._cached = null;
      log.exit("register", startedAt, { accessGranted: false, fromCache: false });
      return {
        ok: false,
        payload: null,
        updateAvailable: false,
        installerExists: false,
        filename: null,
        accessGranted: false,
        fromCache: false,
        error: String(err.message || err),
      };
    }
  }

  checkUpdateFile(filename) {
    const downloadUrl = this._cached
      ? this.#getPayloadString(this._cached, "downloadUrl", "DownloadUrl")
      : "";
    const name = filename || (this._cached
      ? this.getInstallerFilename(this._cached, downloadUrl)
      : FALLBACK_INSTALLER_NAME);
    return {
      filename: name,
      installerExists: this.hasLocalInstaller(name),
      path: this.getInstallerPath(name),
    };
  }

  async downloadUpdate(downloadUrl, filename, webContents) {
    if (this._downloading) {
      return { ok: false, reason: "already-downloading" };
    }
    const url = downloadUrl || (this._cached && this.#getPayloadString(this._cached, "downloadUrl", "DownloadUrl"));
    if (!url) {
      return { ok: false, reason: "missing-url" };
    }
    const name = filename || this.getInstallerFilename(this._cached, url);
    const dest = this.getInstallerPath(name);
    this._downloading = true;

    try {
      await this.#downloadToFile(url, dest, (progress) => {
        if (webContents && !webContents.isDestroyed()) {
          const channels = require("../../shared/ipc/channels");
          webContents.send(channels.LICENSE_DOWNLOAD_PROGRESS, {
            ...progress,
            filename: name,
            path: dest,
          });
        }
      });
      return { ok: true, filename: name, path: dest };
    } catch (err) {
      log.error("download failed", { error: String(err.message || err) });
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
      } catch {
        // ignore cleanup errors
      }
      return { ok: false, reason: "download-failed", error: String(err.message || err) };
    } finally {
      this._downloading = false;
    }
  }

  async installUpdate(filename) {
    const downloadUrl = this._cached
      ? this.#getPayloadString(this._cached, "downloadUrl", "DownloadUrl")
      : "";
    const name = filename || (this._cached
      ? this.getInstallerFilename(this._cached, downloadUrl)
      : FALLBACK_INSTALLER_NAME);
    const fullPath = this.getInstallerPath(name);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, reason: "file-missing", path: fullPath };
    }
    const result = await shell.openPath(fullPath);
    if (result) {
      return { ok: false, reason: "open-failed", error: result, path: fullPath };
    }
    return { ok: true, path: fullPath };
  }

  #postJson(url, body) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const transport = parsed.protocol === "http:" ? http : https;
      const payload = JSON.stringify(body);
      const requestStartedAt = Date.now();
      const requestPath = `${parsed.pathname}${parsed.search}`;

      log.info(`POST ${parsed.hostname}${requestPath}`);

      const req = transport.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
          path: requestPath,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${LICENSE_AUTH_BEARER}`,
            "Content-Length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const durationMs = Date.now() - requestStartedAt;
            const text = Buffer.concat(chunks).toString("utf8");
            const statusCode = res.statusCode || 0;
            if (statusCode && (statusCode < 200 || statusCode >= 300)) {
              log.error(`POST ${parsed.hostname}${requestPath} failed`, {
                statusCode,
                durationMs,
                bodySnippet: text.slice(0, 200),
              });
              reject(new Error(`HTTP ${statusCode}: ${text.slice(0, 200)}`));
              return;
            }
            log.info(`POST ${parsed.hostname}${requestPath} completed`, { statusCode, durationMs });
            if (!text) {
              resolve(null);
              return;
            }
            try {
              resolve(JSON.parse(text));
            } catch {
              log.error("invalid JSON response from license server", { durationMs });
              reject(new Error("Invalid JSON response from license server"));
            }
          });
        }
      );
      req.on("error", (err) => {
        log.error(`POST ${parsed.hostname}${requestPath} network error`, {
          durationMs: Date.now() - requestStartedAt,
          error: String(err.message || err),
        });
        reject(err);
      });
      req.write(payload);
      req.end();
    });
  }

  #downloadToFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const follow = (currentUrl, redirectsLeft) => {
        let parsed;
        try {
          parsed = new URL(currentUrl);
        } catch (err) {
          reject(err);
          return;
        }
        const transport = parsed.protocol === "http:" ? http : https;
        const req = transport.get(parsed, (res) => {
          const code = res.statusCode || 0;
          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            if (redirectsLeft <= 0) {
              reject(new Error("Too many redirects"));
              return;
            }
            follow(new URL(res.headers.location, currentUrl).href, redirectsLeft - 1);
            return;
          }
          if (code < 200 || code >= 300) {
            res.resume();
            reject(new Error(`Download HTTP ${code}`));
            return;
          }

          const total = Number(res.headers["content-length"]) || 0;
          let received = 0;
          const tmpPath = `${destPath}.part`;
          const file = fs.createWriteStream(tmpPath);

          res.on("data", (chunk) => {
            received += chunk.length;
            const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
            if (typeof onProgress === "function") {
              onProgress({ percent, received, total });
            }
          });

          res.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              try {
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                fs.renameSync(tmpPath, destPath);
                if (typeof onProgress === "function") {
                  onProgress({ percent: 100, received: total || received, total: total || received });
                }
                resolve(destPath);
              } catch (err) {
                reject(err);
              }
            });
          });

          file.on("error", (err) => {
            try {
              if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            } catch {
              // ignore
            }
            reject(err);
          });

          res.on("error", (err) => {
            try {
              file.close();
              if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            } catch {
              // ignore
            }
            reject(err);
          });
        });

        req.on("error", reject);
      };

      follow(url, 5);
    });
  }
}

module.exports = new LicenseService();
module.exports.LicenseService = LicenseService;
module.exports.BUILD_VERSION = BUILD_VERSION;
