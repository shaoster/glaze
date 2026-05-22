import { describe, expect, it } from "vitest";
import { BUNDLE_DEFINE_ALLOWLIST } from "../vite.config";
import viteConfig from "../vite.config";

const resolvedConfig =
  typeof viteConfig === "function"
    ? await viteConfig({ mode: "production", command: "build", isSsrBuild: false })
    : viteConfig;

const define = (resolvedConfig.define ?? {}) as Record<string, string>;

describe("vite bundle injection contract", () => {
  it("define keys match allowlist exactly — extra keys leak secrets, missing keys break prod", () => {
    const actual = new Set(Object.keys(define));
    const extra = [...actual].filter((k) => !BUNDLE_DEFINE_ALLOWLIST.has(k));
    const missing = [...BUNDLE_DEFINE_ALLOWLIST].filter((k) => !actual.has(k));
    expect(extra, "unexpected vars baked into bundle — add to BUNDLE_DEFINE_ALLOWLIST only if non-secret").toEqual([]);
    expect(missing, "required bundle vars missing from define block — prod will be broken").toEqual([]);
  });

  it("every allowlisted key resolves to a non-empty value when loaded from .env.*", () => {
    for (const key of BUNDLE_DEFINE_ALLOWLIST) {
      const raw = define[key];
      // Vite serializes values as JSON strings e.g. '"myvalue"' — unwrap one layer.
      const value: unknown = JSON.parse(raw);
      expect(value, `${key} resolved to empty — check that .env.local is present and populated`).toBeTruthy();
    }
  });
});
