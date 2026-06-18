import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Regression test for #809: @rolldown/plugin-babel defaults sourceMap:true,
// causing Rolldown to embed //# sourceMappingURL= in the production bundle even
// when build.sourcemap is false. The .map files are not deployed, so the
// reference produces a 404. Guard that the babel plugin is always explicitly
// told not to emit source maps.

const __dirname = dirname(fileURLToPath(import.meta.url));
const configSource = readFileSync(
  resolve(__dirname, "../vite.config.ts"),
  "utf8",
);

describe("vite.config.ts source map configuration", () => {
  it("disables source maps in the babel plugin to prevent sourceMappingURL 404s", () => {
    expect(configSource).toMatch(/babel\([\s\S]*?sourceMap:\s*false/);
  });

  it("explicitly disables build.sourcemap", () => {
    expect(configSource).toMatch(/sourcemap:\s*false/);
  });
});
