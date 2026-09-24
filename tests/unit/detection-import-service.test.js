require("../electron-stub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseYoloTxt, parseVocXml } = require("../../src/main/middleware/detection-import-service");

test("parseYoloTxt reads class and normalized box lines", () => {
  const content = fs.readFileSync(path.join(__dirname, "../fixtures/boxes.txt"), "utf8");
  const detections = parseYoloTxt(content);
  assert.equal(detections.length, 2);
  assert.equal(detections[0].labelid, 0);
  assert.equal(detections[0].value.xc, 0.5);
  assert.equal(detections[1].labelid, 1);
});

test("parseVocXml maps class names and skips unknown classes", () => {
  const content = fs.readFileSync(path.join(__dirname, "../fixtures/boxes.xml"), "utf8");
  const detections = parseVocXml(content, [{ id: 3, name: "Car" }]);
  assert.equal(detections.length, 1);
  assert.equal(detections[0].labelid, 3);
  assert.deepEqual(detections[0].value, { xmin: 1, ymin: 2, xmax: 11, ymax: 22 });
});
