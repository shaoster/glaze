import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePath } from "../../../scripts/generate-types.mjs";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("generate-types script helpers", () => {
  it("passes through absolute paths unchanged", () => {
    expect(resolvePath("/tmp/schema.json")).toBe("/tmp/schema.json");
  });

  it("resolves relative paths from the current working directory", () => {
    vi.stubEnv("BAZEL_BINDIR", "");
    vi.spyOn(process, "cwd").mockReturnValue("/repo/web");

    expect(resolvePath("src/util/generated-types.ts")).toBe(
      "/repo/web/src/util/generated-types.ts",
    );
  });
});
