const { spawn } = require("node:child_process");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronPath = require("electron");
const child = spawn(electronPath, ["."], {
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
