const { app } = require("electron");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const licenseService = require("../services/license-service");

function buildAppInfo() {
  let pkg = {};
  try {
    pkg = require("../../../package.json");
  } catch {
    pkg = {};
  }

  const userDataPath = app.getPath("userData");
  const instance = crypto
    .createHash("sha256")
    .update(userDataPath)
    .digest("hex")
    .slice(0, 8);

  const repoUrl =
    typeof pkg.repository === "string"
      ? pkg.repository
      : pkg.repository && pkg.repository.url
        ? pkg.repository.url.replace(/\.git$/, "")
        : "";

  const licenseUrl = repoUrl ? `${repoUrl.replace(/\/$/, "")}/blob/main/LICENSE` : "";

  let licenseSummary = "MIT License";

  try {
    const licensePath = path.join(app.getAppPath(), "LICENSE");
    const licenseText = fs.readFileSync(licensePath, "utf8").trim();
    if (licenseText) {
      licenseSummary = licenseText.replace(/\r\n/g, " ").replace(/\s+/g, " ");
    }
  } catch {
    // use default summary above
  }

  return {
    productName: pkg.build?.productName || pkg.name || "VisionForge",
    edition: "LTS Release",
    version: licenseService.getVersionName(),
    build: licenseService.getBuildVersion(),
    electron: process.versions.electron || "Unknown",
    instance,
    description: pkg.description || "",
    licenseSummary,
    copyright: "© 2026 VisionForge. All rights reserved.",
    licenseUrl,
    repositoryUrl: repoUrl,
  };
}

module.exports = { buildAppInfo };
