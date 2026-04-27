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
      // TODO(#165): Upstream something to obviate this hack
      //
      // This is a pretty elaborate workaround to integrate with bazel's coverage
      // so make sure you understand what's happening before changing:
      // - Bazel has 2 interfaces for coverage: $COVERAGE_DIR and $COVERAGE_OUTPUT_FILE.
      // - The standard thing to do is to set $COVERAGE_DIR as our reportsDirectory
      //   but this doesn't work because $COVERAGE_DIR isn't a child of our cwd where
      //   the tests are run.
      // - The next thing to do is to write to the $COVERAGE_OUTPUT_FILE, but v8/istanbul
      //   refuse to write to absolute paths.
      // - Thus, we write to $COVERAGE_OUTPUT_FILE by setting the reportsDirectory to the
      //   parent of $COVERAGE_OUTPUT_FILE and then setting the relative filename to
      //   the last token of the $COVERAGE_OUTPUT_FILE absolute path.
      reporter: [
        [
          "lcov",
          {
            file:
              process.env.COVERAGE_OUTPUT_FILE?.split("/").pop() ||
              "coverage.dat",
          },
        ],
      ],
      reportsDirectory: process.env.COVERAGE_OUTPUT_FILE
        ? process.env.COVERAGE_OUTPUT_FILE + "/.."
        : "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/test-setup.ts", "**/*.d.ts", "**/generated-types.ts"],
    },
  },
});
