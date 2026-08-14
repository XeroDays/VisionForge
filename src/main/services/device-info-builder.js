const { execFile, execSync } = require("child_process");
const { promisify } = require("util");
const os = require("os");

const execFileAsync = promisify(execFile);

const WINDOWS_CURRENT_VERSION_KEY = "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion";
const MACHINE_GUID_KEY = "HKLM\\SOFTWARE\\Microsoft\\Cryptography";

let cachedMachineGuid = null;
let cachedVersionValues = null;

function mapOsArchitecture(arch) {
  const a = String(arch || "").toLowerCase();
  if (a === "x64" || a === "x86_64" || a === "amd64") return "X64";
  if (a === "ia32" || a === "x86" || a === "i386") return "X86";
  if (a === "arm64" || a === "aarch64") return "ARM64";
  if (a === "arm") return "ARM";
  return String(arch || "Unknown").toUpperCase();
}

function formatRelativeBoot(bootMs) {
  if (!Number.isFinite(bootMs) || bootMs <= 0) return "unknown";
  const elapsedMs = Math.max(0, Date.now() - bootMs);
  const totalMinutes = Math.floor(elapsedMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
  return `${parts.join(" ")} ago`;
}

function parseRegOutput(stdout) {
  const values = {};
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(\S+)\s+REG_\w+\s+(.+)$/);
    if (match) {
      values[match[1]] = match[2].trim();
    }
  }
  return values;
}

function readRegSz(keyPath, valueName) {
  if (process.platform !== "win32") return "";
  try {
    const stdout = execSync(`reg query "${keyPath}" /v ${valueName}`, {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    const re = new RegExp(`${valueName}\\s+REG_SZ\\s+([^\\r\\n]+)`, "i");
    const match = stdout.match(re);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

async function readRegSzAsync(keyPath, valueName) {
  if (process.platform !== "win32") return "";
  try {
    const { stdout } = await execFileAsync("reg", ["query", keyPath, "/v", valueName], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    const re = new RegExp(`${valueName}\\s+REG_SZ\\s+([^\\r\\n]+)`, "i");
    const match = stdout.match(re);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

async function readRegKeyAsync(keyPath) {
  if (keyPath === WINDOWS_CURRENT_VERSION_KEY && cachedVersionValues) {
    return cachedVersionValues;
  }
  if (process.platform !== "win32") return {};
  try {
    const { stdout } = await execFileAsync("reg", ["query", keyPath], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    const values = parseRegOutput(stdout);
    if (keyPath === WINDOWS_CURRENT_VERSION_KEY) {
      cachedVersionValues = values;
    }
    return values;
  } catch {
    return {};
  }
}

function readSystemFactsFromRegValues(regValues) {
  const cpus = os.cpus();
  const processor = (cpus?.[0]?.model || "").trim() || "Unknown";
  const productName = regValues.ProductName || "";
  const currentBuild = regValues.CurrentBuild || "";
  const displayVersion = regValues.DisplayVersion || "";

  const release = os.release() || "";
  let osVersion = release;
  if (currentBuild && /^\d+\.\d+/.test(release)) {
    const majorMinor = release.split(".").slice(0, 2).join(".");
    osVersion = `${majorMinor}.${currentBuild}`;
  } else if (displayVersion) {
    osVersion = displayVersion;
  }

  const uptimeSec = os.uptime();
  const bootMs = Number.isFinite(uptimeSec)
    ? Date.now() - Math.floor(uptimeSec * 1000)
    : NaN;

  return {
    processor,
    osName: productName || "Unknown",
    osVersion: osVersion || "Unknown",
    lastBootAgo: formatRelativeBoot(bootMs),
  };
}

function readSystemFacts() {
  const productName = readRegSz(WINDOWS_CURRENT_VERSION_KEY, "ProductName");
  const currentBuild = readRegSz(WINDOWS_CURRENT_VERSION_KEY, "CurrentBuild");
  const displayVersion = readRegSz(WINDOWS_CURRENT_VERSION_KEY, "DisplayVersion");
  return readSystemFactsFromRegValues({ ProductName: productName, CurrentBuild: currentBuild, DisplayVersion: displayVersion });
}

async function readSystemFactsAsync() {
  const regValues = await readRegKeyAsync(WINDOWS_CURRENT_VERSION_KEY);
  return readSystemFactsFromRegValues(regValues);
}

function readDisplayFacts() {
  try {
    const { screen } = require("electron");
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    const width = primary?.size?.width || 0;
    const height = primary?.size?.height || 0;
    return {
      width,
      height,
      monitors: Array.isArray(displays) ? displays.length : 0,
    };
  } catch {
    return { width: 0, height: 0, monitors: 0 };
  }
}

function assembleDeviceInfoString(deviceIdUpper, system, display) {
  const hostname = os.hostname() || "Unknown";
  const deviceId = String(deviceIdUpper || "").trim().toUpperCase() || "Unknown";
  const resolution = display.width && display.height
    ? `${display.width} x ${display.height}`
    : "Unknown";
  const monitors = display.monitors > 0 ? String(display.monitors) : "Unknown";
  const arch = mapOsArchitecture(process.arch || os.arch());

  return [
    `Name: ${hostname}`,
    `Device ID: ${deviceId}`,
    `Processor: ${system.processor}`,
    "Device Info:",
    `Operating System Name: ${system.osName}`,
    `Version: ${system.osVersion}`,
    `Last Boot Up Time: ${system.lastBootAgo}`,
    `Screen Resolution: ${resolution}`,
    `Number of Monitors: ${monitors}`,
    `OS Architecture: ${arch}`,
  ].join("  ");
}

function buildDeviceInfoString(deviceIdUpper) {
  const system = readSystemFacts();
  const display = readDisplayFacts();
  return assembleDeviceInfoString(deviceIdUpper, system, display);
}

function buildDeviceInfoFromParts(deviceIdUpper, versionRegValues) {
  const system = readSystemFactsFromRegValues(versionRegValues || {});
  const display = readDisplayFacts();
  return assembleDeviceInfoString(deviceIdUpper, system, display);
}

async function buildDeviceInfoStringAsync(deviceIdUpper) {
  const system = await readSystemFactsAsync();
  const display = readDisplayFacts();
  return assembleDeviceInfoString(deviceIdUpper, system, display);
}

async function prefetchRegistrationRegistryAsync() {
  const [machineGuid, versionValues] = await Promise.all([
    readMachineGuidAsync(),
    readRegKeyAsync(WINDOWS_CURRENT_VERSION_KEY),
  ]);
  return { machineGuid, versionValues };
}

async function readMachineGuidAsync() {
  if (cachedMachineGuid) {
    return cachedMachineGuid;
  }
  cachedMachineGuid = await readRegSzAsync(MACHINE_GUID_KEY, "MachineGuid");
  return cachedMachineGuid;
}

module.exports = {
  buildDeviceInfoString,
  buildDeviceInfoStringAsync,
  buildDeviceInfoFromParts,
  prefetchRegistrationRegistryAsync,
  mapOsArchitecture,
  formatRelativeBoot,
  readRegSz,
  readRegSzAsync,
  readRegKeyAsync,
  readSystemFacts,
  readSystemFactsAsync,
  readSystemFactsFromRegValues,
  readDisplayFacts,
  readMachineGuidAsync,
  assembleDeviceInfoString,
};
