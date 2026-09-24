require("../electron-stub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exportAnnotations } = require("../../src/main/middleware/export-service");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function writeProject(root) {
  const images = path.join(root, "images");
  fs.mkdirSync(images, { recursive: true });
  fs.writeFileSync(path.join(images, "frame.png"), PNG);
  const vfsln = path.join(root, "Demo.VFSln");
  const project = {
    format: "VFSln",
    version: 1,
    name: "Demo",
    imagesFolder: images,
    labels: [{ id: 0, name: "vehicle" }],
    annotationType: "oriented-object-detection",
    annotationMode: "yolo-obb",
    assets: [
      {
        name: "frame.png",
        width: 100,
        height: 50,
        detections: [{ labelid: 0, value: { xc: 0.5, yc: 0.5, w: 0.2, h: 0.4, angle: 90 }, score: 0.9 }],
      },
    ],
  };
  fs.writeFileSync(vfsln, JSON.stringify(project));
  return { vfsln, images };
}

test("export writes each oriented mode", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vf-export-"));
  const { vfsln } = writeProject(root);
  const cases = [
    ["yolo-obb", "frame.txt", (text) => assert.match(text, /^0 /)],
    ["dota", "frame.txt", (text) => assert.match(text, /vehicle 0\s*$/)],
    ["rotated-rectangle-obb", "frame.txt", (text) => assert.match(text, /^0 0\.5 0\.5 0\.2 0\.4 /)],
    ["4-point-quadrilateral", "frame.txt", (text) => assert.match(text, /^0 /)],
    ["rotated-coco-json", "annotations.json", (text) => {
      const json = JSON.parse(text);
      assert.equal(json.annotations[0].bbox.length, 5);
      assert.equal(json.annotations[0].segmentation[0].length, 8);
    }],
  ];

  for (const [mode, fileName, check] of cases) {
    const dest = path.join(root, mode);
    fs.mkdirSync(dest);
    const result = await exportAnnotations(vfsln, dest, mode);
    assert.equal(result.ok, true, result.reason);
    const written = fs.readFileSync(path.join(dest, fileName), "utf8");
    check(written);
  }
});
