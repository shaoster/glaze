import { describe, it, expect } from "vitest";
import { formatValue } from "../PublicPieceShell";

describe("formatValue", () => {
  it("handles null, undefined, and empty string", () => {
    expect(formatValue(null)).toBe("");
    expect(formatValue(undefined)).toBe("");
    expect(formatValue("")).toBe("");
  });

  it("handles strings and numbers", () => {
    expect(formatValue("hello")).toBe("hello");
    expect(formatValue(123)).toBe("123");
  });

  it("handles booleans", () => {
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(false)).toBe("No");
  });

  it("handles objects with a name property", () => {
    expect(formatValue({ name: "Location A" })).toBe("Location A");
  });

  it("throws error for unsupported types", () => {
    expect(() => formatValue({})).toThrow("Unsupported value type");
    expect(() => formatValue([])).toThrow("Unsupported value type");
  });
});
