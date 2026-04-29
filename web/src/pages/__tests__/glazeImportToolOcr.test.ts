import { describe, expect, it } from "vitest";

import {
  detectFoodSafeFromOcrText,
  detectRunsFromOcrText,
  parseOcrSuggestion,
} from "../glazeImportToolOcr";

describe("glazeImportToolOcr", () => {
  it("parses structured glaze combinations", () => {
    const suggestion = parseOcrSuggestion(
      "1st Glaze: Iron Red\n2nd Glaze: Clear",
      "glaze_type",
    );

    expect(suggestion.suggestedKind).toBe("glaze_combination");
    expect(suggestion.suggestedName).toBe("Iron Red!Clear");
    expect(suggestion.suggestedFirstGlaze).toBe("Iron Red");
    expect(suggestion.suggestedSecondGlaze).toBe("Clear");
  });

  it("detects runs and not-food-safe annotations", () => {
    expect(detectRunsFromOcrText("CAUTION RUNS")).toBe(true);
    expect(detectFoodSafeFromOcrText("NOT FOOD SAFE")).toBe(false);
  });
});
