const Module = require("module");
const os = require("os");
const original = Module.prototype.require;

if (!Module.prototype.__visionforgeStubbed) {
  Module.prototype.require = function patchedRequire(id) {
    if (id === "electron") {
      return {
        app: {
          getPath: () => os.tmpdir(),
          getAppPath: () => process.cwd(),
        },
        BrowserWindow: { fromWebContents: () => null },
        ipcMain: { handle() {} },
      };
    }
    return original.apply(this, arguments);
  };
  Module.prototype.__visionforgeStubbed = true;
}
