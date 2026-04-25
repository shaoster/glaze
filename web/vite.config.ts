import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import yaml from "@rollup/plugin-yaml";
import path from "node:path";
import fs from "node:fs";

// In the Bazel sandbox every source file is a symlink whose target lives in
// the execroot, outside the sandbox directory.  During `vite build`, Rolldown
// resolves symlinks to compute output file names, so path.relative(root,
// realPath) produces a long "../../.." string that Rolldown rejects.
// Anchoring root to the real path of the config directory keeps relative paths
// short and correct.  During vitest the execroot is not mounted inside the
// sandbox, so we keep root as __dirname (the sandbox symlink path) and let
// vitest's preserveSymlinks option prevent it from escaping the sandbox.
const isVitest = !!process.env.VITEST;
const root = isVitest ? __dirname : fs.realpathSync(__dirname);

// https://vite.dev/config/
export default defineConfig({
  root,
  resolve: {
    // frontend_common is outside web/, so bare imports inside it resolve from
    // the repo root upward (not web/node_modules). Pin axios to web's install.
    alias: {
      axios: path.resolve(root, "node_modules/axios"),
      "@common": path.resolve(root, "../frontend_common/src"),
    },
  },
  plugins: [yaml(), react(), babel({ presets: [reactCompilerPreset()] })],
  build: {
    // root is the real (symlink-resolved) path; write output to the sandbox
    // CWD so Bazel's declared output tree artifact is populated correctly.
    // root is the real (execroot) path during build; write output to the
    // sandbox CWD so Bazel's declared output tree artifact is populated.
    outDir: path.resolve(process.cwd(), "dist"),
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "vendor-react";
          }
          if (
            id.includes("node_modules/@mui") ||
            id.includes("node_modules/@emotion")
          ) {
            return "vendor-mui";
          }
        },
      },
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
    proxy: {
      "/api": "http://localhost:8080",
      "/admin": "http://localhost:8080",
      "/static": "http://localhost:8080",
      // Rewrite any request for /favicon.ico to /favicon.svg
      "/favicon.ico": {
        target: "http://localhost:5173", // Your dev server address
        rewrite: (path) => path.replace("/favicon.ico", "/favicon.svg"),
      },
    },
  },
});
