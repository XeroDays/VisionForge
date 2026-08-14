const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico");

const SOURCE = path.resolve(__dirname, "../src/renderer/images/logo/VisionForge.png");
const OUT_ICO = path.resolve(__dirname, "../build/icon.ico");
const OUT_PNG = path.resolve(__dirname, "../build/icon.png");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_SIZE = 512;

async function squarePng(size) {
  const maxLogo = Math.round(size * 0.85);
  const logo = await sharp(SOURCE)
    .resize(maxLogo, maxLogo, { fit: "inside" })
    .toBuffer();
  const { width, height } = await sharp(logo).metadata();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: logo,
        left: Math.floor((size - width) / 2),
        top: Math.floor((size - height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`[generate-windows-icon] Source not found: ${SOURCE}`);
    process.exit(1);
  }

  const pngBuffers = await Promise.all(ICO_SIZES.map((size) => squarePng(size)));
  const ico = await pngToIco(pngBuffers);

  fs.mkdirSync(path.dirname(OUT_ICO), { recursive: true });
  fs.writeFileSync(OUT_ICO, ico);
  fs.writeFileSync(OUT_PNG, await squarePng(PNG_SIZE));

  console.log(
    `[generate-windows-icon] Wrote ${path.relative(process.cwd(), OUT_ICO)} (${ICO_SIZES.length} sizes) and ${path.relative(process.cwd(), OUT_PNG)}`
  );
}

main().catch((error) => {
  console.error("[generate-windows-icon] Failed:", error.message);
  process.exit(1);
});
