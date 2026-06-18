import { describe, expect, it } from "vitest";
import { parseFilterParam, parseTagIdsParam } from "../pieceFilters";

describe("parseFilterParam", () => {
  it("returns empty array for null", () => {
    expect(parseFilterParam(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseFilterParam("")).toEqual([]);
  });

  it("returns a single valid category", () => {
    expect(parseFilterParam("wip")).toEqual(["wip"]);
  });

  it("returns multiple valid categories", () => {
    expect(parseFilterParam("wip,completed")).toEqual(["wip", "completed"]);
  });

  it("filters out invalid categories", () => {
    expect(parseFilterParam("wip,invalid,completed")).toEqual([
      "wip",
      "completed",
    ]);
  });

  it("returns empty array when all categories are invalid", () => {
    expect(parseFilterParam("unknown,bad")).toEqual([]);
  });

  it("accepts all valid categories", () => {
    expect(parseFilterParam("wip,completed,discarded,shared")).toEqual([
      "wip",
      "completed",
      "discarded",
      "shared",
    ]);
  });
});

describe("parseTagIdsParam", () => {
  it("returns empty array for null", () => {
    expect(parseTagIdsParam(null)).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTagIdsParam("")).toEqual([]);
  });

  it("returns a single tag ID", () => {
    expect(parseTagIdsParam("abc123")).toEqual(["abc123"]);
  });

  it("splits comma-separated tag IDs", () => {
    expect(parseTagIdsParam("abc,def,ghi")).toEqual(["abc", "def", "ghi"]);
  });

  it("filters out empty segments from trailing commas", () => {
    expect(parseTagIdsParam("abc,,def")).toEqual(["abc", "def"]);
  });
});
