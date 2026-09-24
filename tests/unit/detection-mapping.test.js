const test = require("node:test");
const assert = require("node:assert/strict");
const mapping = require("../../src/shared/detection-mapping");

test("rectToValue writes YOLO normalized values", () => {
  const value = mapping.rectToValue({ x: 10, y: 20, width: 30, height: 40 }, 100, 200, {});
  assert.equal(value.xc, 0.25);
  assert.equal(value.yc, 0.2);
  assert.equal(value.w, 0.3);
  assert.equal(value.h, 0.2);
  assert.equal(value.angle, undefined);
});

test("rectToValue writes integer VOC pixels", () => {
  const value = mapping.rectToValue({ x: 10.2, y: 20.4, width: 30.2, height: 40.2 }, 100, 200, { voc: true });
  assert.deepEqual(value, { xmin: 10, ymin: 20, xmax: 40, ymax: 61 });
});

test("rectToValue keeps OBB angle", () => {
  const value = mapping.rectToValue({ x: 0, y: 0, width: 10, height: 10, angle: 15.126 }, 100, 100, { obb: true });
  assert.equal(value.angle, 15.13);
});

test("valueToRect round-trips a YOLO box", () => {
  const value = mapping.rectToValue({ x: 10, y: 20, width: 40, height: 60 }, 200, 100, {});
  const rect = mapping.valueToRect(value, 200, 100);
  assert.equal(Math.round(rect.x), 10);
  assert.equal(Math.round(rect.y), 20);
  assert.equal(Math.round(rect.width), 40);
  assert.equal(Math.round(rect.height), 60);
});

test("mapModelDetection keeps score and normalized boxes", () => {
  const detection = mapping.mapModelDetection(
    { labelid: 2, score: 0.81234, xc: 0.5, yc: 0.25, w: 0.2, h: 0.1, angle: 12 },
    { imgW: 100, imgH: 100, obb: true },
  );
  assert.equal(detection.labelid, 2);
  assert.equal(detection.score, 0.8123);
  assert.equal(detection.value.angle, 12);
  assert.equal(detection.value.xc, 0.5);
});
