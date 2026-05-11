import { expect, it, describe } from "vitest";
import { formatValue } from "../format";

describe("formatValue", () => {
  it("formats boolean values", () => {
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(false)).toBe("No");
  });

  it("formats object with name property", () => {
    expect(formatValue({ name: "foo" })).toBe("foo");
  });

  it("returns empty string when object name is not a string", () => {
    expect(formatValue({ name: 42 })).toBe("");
  });

  it("throws on unsupported type", () => {
    expect(() => formatValue(42n)).toThrow("Unsupported value type");
  });

  it("handles null, undefined, and empty string", () => {
    expect(formatValue(null)).toBe("");
    expect(formatValue(undefined)).toBe("");
    expect(formatValue("")).toBe("");
  });

  it("formats strings and numbers", () => {
    expect(formatValue("test")).toBe("test");
    expect(formatValue(123)).toBe("123");
  });
});
