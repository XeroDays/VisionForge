const path = require("path");

const SOLUTION_EXT = ".vfsln";

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function findSolutionArg(argv) {
  const args = Array.isArray(argv) ? argv : [];
  for (const raw of args) {
    const arg = stripQuotes(String(raw || "").trim());
    if (!arg || arg === "." || arg.startsWith("-")) continue;
    if (path.extname(arg).toLowerCase() !== SOLUTION_EXT) continue;
    return path.resolve(arg);
  }
  return "";
}

module.exports = {
  findSolutionArg,
};
