const { app, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const { license: log } = require("./visionforge-logger");

const CACHE_FILENAME = "register-response.enc";

function getCachePath() {
  return path.join(app.getPath("userData"), CACHE_FILENAME);
}

function isEncryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (err) {
    log.warn("encryption availability check failed", { error: String(err.message || err) });
    return false;
  }
}

function saveRegisterResponse(response) {
  if (!response || typeof response !== "object") {
    return false;
  }
  if (!isEncryptionAvailable()) {
    log.warn("safeStorage encryption unavailable; skipping save");
    return false;
  }

  try {
    const json = JSON.stringify(response);
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(getCachePath(), encrypted);
    log.info("saved register response to cache");
    return true;
  } catch (err) {
    log.warn("failed to save register response", { error: String(err.message || err) });
    return false;
  }
}

function loadRegisterResponse() {
  if (!isEncryptionAvailable()) {
    log.warn("safeStorage encryption unavailable; cannot load cache");
    return null;
  }

  const cachePath = getCachePath();
  if (!fs.existsSync(cachePath)) {
    log.info("register response cache miss");
    return null;
  }

  try {
    const encrypted = fs.readFileSync(cachePath);
    const json = safeStorage.decryptString(encrypted);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      log.info("register response cache hit");
      return parsed;
    }
    log.warn("register response cache invalid");
    return null;
  } catch (err) {
    log.warn("failed to load register response", { error: String(err.message || err) });
    return null;
  }
}

module.exports = {
  saveRegisterResponse,
  loadRegisterResponse,
};
