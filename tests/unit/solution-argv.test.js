const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { findSolutionArg } = require("../../src/main/helpers/solution-argv");

test("findSolutionArg skips flags and the app entry", () => {
  const file = path.resolve("demo.VFSln");
  const found = findSolutionArg(["electron.exe", ".", "--inspect", file]);
  assert.equal(found, file);
});

test("findSolutionArg matches the extension case-insensitively", () => {
  const found = findSolutionArg(["VisionForge.exe", "project.vfsln"]);
  assert.equal(found, path.resolve("project.vfsln"));
});

test("findSolutionArg returns the first solution path", () => {
  const found = findSolutionArg(["VisionForge.exe", "a.VFSln", "b.VFSln"]);
  assert.equal(found, path.resolve("a.VFSln"));
});

test("findSolutionArg returns empty when none match", () => {
  assert.equal(findSolutionArg(["--flag", ".", "notes.txt"]), "");
});
