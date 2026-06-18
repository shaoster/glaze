import { describe, expect, it } from "vitest";
import {
  entryNameOrEmpty,
  normalizeOptionalText,
  undefinedIfBlank,
} from "../optionalValues";

describe("normalizeOptionalText", () => {
  it("returns empty string for null", () => {
    expect(normalizeOptionalText(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(normalizeOptionalText(undefined)).toBe("");
  });

  it("returns the string as-is for a non-empty value", () => {
    expect(normalizeOptionalText("hello")).toBe("hello");
  });

  it("returns whitespace strings unchanged", () => {
    expect(normalizeOptionalText("   ")).toBe("   ");
  });
});

describe("entryNameOrEmpty", () => {
  it("returns the name from a valid entry", () => {
    expect(entryNameOrEmpty({ name: "Earthen Red" })).toBe("Earthen Red");
  });

  it("returns empty string for null", () => {
    expect(entryNameOrEmpty(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(entryNameOrEmpty(undefined)).toBe("");
  });
});

describe("undefinedIfBlank", () => {
  it("returns undefined for null", () => {
    expect(undefinedIfBlank(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(undefinedIfBlank(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(undefinedIfBlank("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(undefinedIfBlank("   ")).toBeUndefined();
  });

  it("returns the trimmed value for a non-blank string", () => {
    expect(undefinedIfBlank("  hello  ")).toBe("hello");
  });

  it("returns the value unchanged when no surrounding whitespace", () => {
    expect(undefinedIfBlank("hello")).toBe("hello");
  });
});
