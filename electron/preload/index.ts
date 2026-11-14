// The bridge preload. It runs sandboxed, so esbuild bundles it as one CommonJS file for the
// browser platform and any Node built-in import fails the build. The platform-bridge work adds
// the window.wkBridge object here through contextBridge. Until then the file is empty, and
// .oxlintrc.json turns off unicorn/no-empty-file for this one path. Remove that override then.
