const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = path.join(root, "node_modules", "@fortawesome", "fontawesome-free");
const dest = path.join(root, "src", "renderer", "vendor", "fontawesome");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const out = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, out);
    else fs.copyFileSync(src, out);
  }
}

if (!fs.existsSync(source)) {
  console.warn("Font Awesome package is not installed; skipping vendor copy.");
  process.exit(0);
}

fs.rmSync(dest, { recursive: true, force: true });
copyDir(path.join(source, "css"), path.join(dest, "css"));
copyDir(path.join(source, "webfonts"), path.join(dest, "webfonts"));
console.log("Copied Font Awesome into src/renderer/vendor/fontawesome");
