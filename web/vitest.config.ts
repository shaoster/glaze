import { defineConfig } from "vitest/config";
import yaml from "@rollup/plugin-yaml";
import path from "node:path";

export default defineConfig({
  plugins: [yaml()],
  resolve: {
    // In the Bazel sandbox every source file is a symlink whose target lives
    // outside the sandbox directory.  Prevent vitest from following symlinks
    // to the execroot (which isn't mounted in the sandbox) when constructing
    // /@fs/ module URLs.
    preserveSymlinks: true,
    alias: [
      {
        find: "axios",
        replacement: path.resolve(__dirname, "node_modules/axios"),
      },
    ],
  },
  test: {
    setupFiles: ["./src/test-setup.ts"],
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test-setup.ts", "**/*.d.ts", "**/generated-types.ts"],
    },
  },
});
