import { describe, it, expect, vi } from "vitest";

// Snapshot-style fixture based on the current workflow.yml shape and names.
// It is still local to this test, so the suite remains decoupled from file edits.
vi.mock("../../../workflow.yml", () => ({
  default: {
    version: "0.0.2",
    globals: {
      location: {
        model: "Location",
        fields: {
          name: { type: "string" },
        },
      },
      clay_body: {
        model: "ClayBody",
        fields: {
          name: { type: "string" },
          short_description: { type: "string" },
        },
      },
      // Synthetic extra global to keep fallback-path coverage.
      firing_profile: {
        model: "FiringProfile",
        fields: {
          code: { type: "string" },
        },
      },
      glaze_type: {
        model: "GlazeType",
        fields: {
          name: { type: "string" },
        },
      },
      glaze_combination: {
        model: "GlazeCombination",
        favoritable: true,
        compose_from: {
          glaze_types: { global: "glaze_type" },
        },
        fields: {
          name: { type: "string" },
          is_food_safe: {
            type: "boolean",
            filterable: true,
            label: "Food safe",
          },
          runs: { type: "boolean", filterable: true, label: "Runs" },
          test_tile_image: { type: "image" },
        },
      },
      piece: {
        model: "Piece",
        taggable: true,
        fields: {
          name: { type: "string" },
        },
      },
    },
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        description: "Dreaming it up.",
        successors: ["wheel_thrown", "handbuilt"],
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        description: "Fresh off the wheel.",
        successors: ["trimmed", "recycled"],
        fields: {
          clay_weight_grams: {
            type: "number",
            description: "Weight of clay before trimming",
          },
          clay_body: {
            $ref: "@clay_body.name",
            can_create: true,
          },
        },
      },
      {
        id: "submitted_to_bisque_fire",
        visible: true,
        friendly_name: "Queued → Bisque",
        description: "Waiting on the kiln...",
        successors: ["bisque_fired", "recycled"],
        fields: {
          kiln_location: {
            $ref: "@location.name",
            can_create: true,
          },
        },
      },
      {
        id: "trimmed",
        visible: true,
        friendly_name: "Trimming",
        description: "Ready for surface work.",
        successors: ["submitted_to_bisque_fire", "recycled"],
        fields: {
          trimmed_weight_grams: {
            type: "number",
          },
          pre_trim_weight_grams: {
            $ref: "wheel_thrown.clay_weight_grams",
            description: "Weight after trimming",
          },
        },
      },
      {
        id: "bisque_fired",
        visible: true,
        friendly_name: "Planning → Glaze",
        description: "Done with the first firing!",
        successors: ["glazed", "recycled"],
        fields: {
          kiln_temperature_c: {
            type: "integer",
          },
          cone: {
            type: "string",
            enum: ["04", "03", "02", "01"],
          },
        },
      },
      {
        id: "glaze_fired",
        visible: true,
        friendly_name: "Touching Up",
        description: "Final cleanup stretch.",
        successors: ["completed", "recycled"],
        fields: {
          kiln_temperature_c: {
            $ref: "bisque_fired.kiln_temperature_c",
          },
          cone: {
            $ref: "bisque_fired.cone",
          },
        },
      },
      {
        id: "recycled",
        visible: true,
        friendly_name: "Recycled",
        description: "Oops! Next time.",
        terminal: true,
      },
    ],
  },
}));

import {
  formatState,
  formatWorkflowFieldLabel,
  getStateDescription,
  getAdditionalFieldDefinitions,
  getFilterableFields,
  getGlobalComposeFrom,
  getGlobalDisplayField,
  isFavoritableGlobal,
  isTaggableGlobal,
} from "./workflow";

describe("formatWorkflowFieldLabel", () => {
  it("converts a single snake_case word to Title Case", () => {
    expect(formatWorkflowFieldLabel("name")).toBe("Name");
  });

  it("converts a multi-word snake_case name to Title Case", () => {
    expect(formatWorkflowFieldLabel("clay_weight_grams")).toBe(
      "Clay Weight Grams",
    );
  });
});

describe("formatState", () => {
  it("uses the workflow-authored friendly_name", () => {
    expect(formatState("submitted_to_bisque_fire")).toBe("Queued → Bisque");
  });

  it("returns an empty string for an unknown state instead of synthesizing a fallback", () => {
    expect(formatState("unknown_state")).toBe("");
  });
});

describe("getStateDescription", () => {
  it("returns the workflow-authored state description", () => {
    expect(getStateDescription("bisque_fired")).toBe(
      "Done with the first firing!",
    );
  });
});

describe("getGlobalDisplayField", () => {
  it("returns 'name' when the global declares a name field", () => {
    expect(getGlobalDisplayField("location")).toBe("name");
  });

  it("returns the first declared field when there is no name field", () => {
    expect(getGlobalDisplayField("firing_profile")).toBe("code");
  });

  it("falls back to 'name' for an unknown global", () => {
    expect(getGlobalDisplayField("nonexistent")).toBe("name");
  });
});

describe("getGlobalComposeFrom", () => {
  it("returns the compose_from map for a global that declares it", () => {
    expect(getGlobalComposeFrom("glaze_combination")).toEqual({
      glaze_types: { global: "glaze_type" },
    });
  });

  it("returns undefined for a global without compose_from", () => {
    expect(getGlobalComposeFrom("location")).toBeUndefined();
  });

  it("returns undefined for an unknown global", () => {
    expect(getGlobalComposeFrom("nonexistent")).toBeUndefined();
  });
});

describe("getAdditionalFieldDefinitions", () => {
  it("returns an empty array for a state with no additional fields", () => {
    expect(getAdditionalFieldDefinitions("designed")).toEqual([]);
  });

  it("returns an empty array for an unknown state", () => {
    expect(getAdditionalFieldDefinitions("nonexistent")).toEqual([]);
  });

  describe("inline fields", () => {
    it("resolves type, description, and required flag", () => {
      const fields = getAdditionalFieldDefinitions("wheel_thrown");
      const f = fields.find((f) => f.name === "clay_weight_grams")!;
      expect(f.type).toBe("number");
      expect(f.description).toBe("Weight of clay before trimming");
      expect(f.required).toBe(false);
      expect(f.isGlobalRef).toBe(false);
    });

    it("defaults required to false when not declared", () => {
      const fields = getAdditionalFieldDefinitions("wheel_thrown");
      const f = fields.find((f) => f.name === "clay_weight_grams")!;
      expect(f.required).toBe(false);
    });
  });

  describe("global ref fields", () => {
    it("sets isGlobalRef, globalName, and globalField", () => {
      const fields = getAdditionalFieldDefinitions("submitted_to_bisque_fire");
      const f = fields.find((f) => f.name === "kiln_location")!;
      expect(f.isGlobalRef).toBe(true);
      expect(f.globalName).toBe("location");
      expect(f.globalField).toBe("name");
    });

    it("sets canCreate true when declared", () => {
      const fields = getAdditionalFieldDefinitions("submitted_to_bisque_fire");
      expect(fields.find((f) => f.name === "kiln_location")!.canCreate).toBe(
        true,
      );
    });

    it("resolves the type from the referenced global field", () => {
      const fields = getAdditionalFieldDefinitions("wheel_thrown");
      expect(fields.find((f) => f.name === "clay_body")!.type).toBe("string");
    });
  });

  describe("state ref fields", () => {
    it("resolves the type from the referenced state field", () => {
      const fields = getAdditionalFieldDefinitions("trimmed");
      const f = fields.find((f) => f.name === "pre_trim_weight_grams")!;
      expect(f.type).toBe("number");
    });

    it("uses the overridden description from the ref field", () => {
      const fields = getAdditionalFieldDefinitions("trimmed");
      const f = fields.find((f) => f.name === "pre_trim_weight_grams")!;
      expect(f.description).toBe("Weight after trimming");
    });

    it("is not marked as a global ref", () => {
      const fields = getAdditionalFieldDefinitions("trimmed");
      expect(
        fields.find((f) => f.name === "pre_trim_weight_grams")!.isGlobalRef,
      ).toBe(false);
    });

    it("is marked as a state ref", () => {
      const fields = getAdditionalFieldDefinitions("trimmed");
      expect(
        fields.find((f) => f.name === "pre_trim_weight_grams")!.isStateRef,
      ).toBe(true);
    });

    it("carries enum values through transitive state refs", () => {
      const fields = getAdditionalFieldDefinitions("glaze_fired");
      expect(fields.find((f) => f.name === "cone")!.enum).toEqual([
        "04",
        "03",
        "02",
        "01",
      ]);
    });
  });

  describe("inline fields are not state refs", () => {
    it("inline field has isStateRef false", () => {
      const fields = getAdditionalFieldDefinitions("wheel_thrown");
      expect(
        fields.find((f) => f.name === "clay_weight_grams")!.isStateRef,
      ).toBe(false);
    });
  });

  describe("global ref fields are not state refs", () => {
    it("global ref field has isStateRef false", () => {
      const fields = getAdditionalFieldDefinitions("submitted_to_bisque_fire");
      expect(fields.find((f) => f.name === "kiln_location")!.isStateRef).toBe(
        false,
      );
    });
  });
});

describe("getFilterableFields", () => {
  it("returns metadata for fields with filterable: true", () => {
    const fields = getFilterableFields("glaze_combination");
    const names = fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["is_food_safe", "runs"]));
  });

  it("includes type and label for each filterable field", () => {
    const fields = getFilterableFields("glaze_combination");
    const foodSafe = fields.find((f) => f.name === "is_food_safe")!;
    expect(foodSafe.type).toBe("boolean");
    expect(foodSafe.label).toBe("Food safe");
  });

  it("does not include non-filterable fields", () => {
    const fields = getFilterableFields("glaze_combination");
    const names = fields.map((f) => f.name);
    expect(names).not.toContain("name");
    expect(names).not.toContain("test_tile_image");
  });

  it("returns an empty array when no fields are filterable", () => {
    expect(getFilterableFields("location")).toEqual([]);
  });

  it("returns an empty array for an unknown global", () => {
    expect(getFilterableFields("nonexistent")).toEqual([]);
  });
});

describe("isFavoritableGlobal", () => {
  it("returns true for a global with favoritable: true", () => {
    expect(isFavoritableGlobal("glaze_combination")).toBe(true);
  });

  it("returns false for a global without the favoritable flag", () => {
    expect(isFavoritableGlobal("location")).toBe(false);
  });

  it("returns false for an unknown global", () => {
    expect(isFavoritableGlobal("nonexistent")).toBe(false);
  });
});

describe("isTaggableGlobal", () => {
  it("returns true for a global with taggable: true", () => {
    expect(isTaggableGlobal("piece")).toBe(true);
  });

  it("returns false for a global without the taggable flag", () => {
    expect(isTaggableGlobal("location")).toBe(false);
  });

  it("returns false for an unknown global", () => {
    expect(isTaggableGlobal("nonexistent")).toBe(false);
  });
});
