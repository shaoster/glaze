import { defineConfig, loadEnv } from "vite";
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

// The single source of truth for env vars baked into the JS bundle.
// Add a var here and it is automatically injected via the define block below.
// Also populate it in .env.local and add it to CI repo variables +
// the "Write Vite env file" step in ci.yml.
// The contract test enforces this set matches the define block exactly —
// extra keys are a potential secret leak, missing keys are broken prod.
export const BUNDLE_DEFINE_ALLOWLIST = new Set([
  "import.meta.env.GOOGLE_OAUTH_CLIENT_ID",
]);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // loadEnv reads .env.* from __dirname (the web/ directory).  In Bazel,
  // process.cwd() is the execroot — not web/ — so __dirname is correct here.
  const env = loadEnv(mode, __dirname, "");
  const define = Object.fromEntries(
    [...BUNDLE_DEFINE_ALLOWLIST].map((key) => {
      const varName = key.replace(/^import\.meta\.env\./, "");
      return [key, JSON.stringify(env[varName])];
    })
  );
  return {
    root,
    define,
    resolve: {
      alias: {
        axios: path.resolve(root, "node_modules/axios"),
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
        input: {
          main: path.resolve(root, "index.html"),
          "admin-widget": path.resolve(root, "src/admin.tsx"),
        },
        output: {
          // Hash the frontend entry and split chunks so each release gets its
          // own immutable asset URLs. The admin widget stays stable because
          // Django loads it via `static("admin-widget.js")`.
          entryFileNames(chunkInfo) {
            return chunkInfo.name === "admin-widget"
              ? "[name].js"
              : "[name]-[hash].js";
          },
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    server: {
      fs: {
        allow: [".."],
      },
      // WSL2 inotify events are unreliable; polling ensures HMR never misses edits.
      watch: {
        usePolling: true,
        interval: 300,
      },
      proxy: {
        "/api": `http://localhost:${process.env.BACKEND_PORT ?? "8080"}`,
        "/admin": `http://localhost:${process.env.BACKEND_PORT ?? "8080"}`,
        "/static": `http://localhost:${process.env.BACKEND_PORT ?? "8080"}`,
        // Rewrite any request for /favicon.ico to /favicon.svg
        "/favicon.ico": {
          target: "http://localhost:5173", // Your dev server address
          rewrite: (path) => path.replace("/favicon.ico", "/favicon.svg"),
        },
      },
    },
  };
});
