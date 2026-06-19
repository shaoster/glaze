import { describe, expect, it } from "vitest";
import { GLAZE_COMBINATION_IMAGES_QUERY_KEY } from "../queryKeys";

describe("GLAZE_COMBINATION_IMAGES_QUERY_KEY", () => {
  it("is a tuple with the expected key string", () => {
    expect(GLAZE_COMBINATION_IMAGES_QUERY_KEY).toEqual(["glazeCombinationImages"]);
  });
});
