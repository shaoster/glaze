import { describe, expect, it } from "vitest";
import { normalizeFields } from "../normalizeWorkflowFields";

describe("normalizeFields", () => {
  it("keeps primitive values and extracts string ids from global refs", () => {
    expect(
      normalizeFields({
        clay_body: { id: "clay-1", name: "Porcelain" },
        shelf: "A1",
        weight: 12.5,
        food_safe: true,
        archived_at: null,
      }),
    ).toEqual({
      clay_body: "clay-1",
      shelf: "A1",
      weight: 12.5,
      food_safe: true,
      archived_at: null,
    });
  });

  it("falls back to null for unsupported values and non-string ref ids", () => {
    expect(
      normalizeFields({
        empty_ref: { id: 12 },
        unsupported_array: ["x"],
        unsupported_object: { name: "Studio shelf" },
        missing_value: undefined,
      }),
    ).toEqual({
      empty_ref: null,
      unsupported_array: null,
      unsupported_object: null,
      missing_value: null,
    });
  });
});
