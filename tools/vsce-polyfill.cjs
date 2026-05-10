// Tiny polyfill so we can run vsce on Node 18.
//
// vsce 2.32 → undici 7 unconditionally references the global `File`
// class, which was added to Node's globals in Node 19.2. On Node 18
// the module-init code throws ReferenceError before any vsce command
// can run.
//
// `vsce package` (the only command we use here) never actually
// constructs a File — that path is only used by the upload/publish
// flow. So a stub class is enough to keep the require chain happy.
if (typeof globalThis.File === "undefined") {
  globalThis.File = class File {
    constructor() {
      throw new Error(
        "File polyfill stub — vsce should not be constructing File "
        + "during `vsce package`. If this fires, upgrade Node to 20+.",
      );
    }
  };
}
