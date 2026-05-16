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
          glaze_types: {
            global: "glaze_type",
            ordered: true,
            filter_label: "Glaze layers",
          },
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
      photo_asset: {
        model: "PhotoAsset",
        fields: {
          image: { type: "image", use_as_thumbnail: true },
          caption: { type: "string" },
        },
      },
      kiln_run: {
        model: "KilnRun",
        fields: {
          name: { type: "string" },
          firing_profile: {
            $ref: "@firing_profile.code",
            filterable: true,
          },
          broken_filter: {
            $ref: "@firing_profile",
            filterable: true,
          },
          atmosphere: { type: "string", filterable: true },
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
    process_summary: {
      sections: [
        {
          title: "Making",
          fields: [
            { label: "Starting weight", value: "wheel_thrown.clay_weight_lbs" },
            {
              label: "Trimming loss",
              compute: {
                op: "difference",
                left: "wheel_thrown.clay_weight_lbs",
                right: "trimmed.trimmed_weight_lbs",
                unit: "lb",
                decimals: 1,
              },
              when: { state_exists: "trimmed" },
            },
            {
              label: "Wax resist",
              text: "Not recorded",
              when: { state_missing: "waxed" },
            },
          ],
        },
        {
          title: "Edges",
          fields: [
            { value: "wheel_thrown.clay_body" },
            { value: "not_a_ref" },
            { value: "unknown_state.some_field" },
            { text: "Fallback label text" },
            {
              compute: {
                op: "sum",
                operands: [
                  "wheel_thrown.clay_weight_lbs",
                  "trimmed.trimmed_weight_lbs",
                ],
              },
            },
          ],
        },
      ],
    },
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        past_friendly_name: "Designed",
        description: "Dreaming it up.",
        successors: ["wheel_thrown", "handbuilt"],
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        past_friendly_name: "Thrown",
        description: "Fresh off the wheel.",
        successors: ["trimmed", "recycled"],
        fields: {
          clay_weight_lbs: {
            type: "number",
            label: "Clay Weight Lbs",
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
        past_friendly_name: "Bisque Fired",
        description: "Waiting on the kiln...",
        successors: ["bisque_fired", "recycled"],
        fields: {
          kiln_location: {
            $ref: "@location.name",
            can_create: true,
          },
          firing_fee_usd: {
            type: "number",
            label: "Firing Fee (USD)",
          },
        },
      },
      {
        id: "trimmed",
        visible: true,
        friendly_name: "Trimming",
        past_friendly_name: "Trimmed",
        description: "Ready for surface work.",
        successors: ["submitted_to_bisque_fire", "recycled"],
        fields: {
          trimmed_weight_lbs: {
            type: "number",
            label: "Trimmed Weight Lbs",
          },
          pre_trim_weight_lbs: {
            $ref: "wheel_thrown.clay_weight_lbs",
            label: "Pre-trim Weight Lbs",
            description: "Weight after trimming",
          },
          inherited_weight_lbs: {
            $ref: "wheel_thrown.clay_weight_lbs",
          },
        },
      },
      {
        id: "edge_cases",
        visible: true,
        friendly_name: "Edge Cases",
        past_friendly_name: "Edge Cased",
        description: "Coverage-only branch state.",
        successors: ["recycled"],
        fields: {
          required_notes: {
            type: "string",
            required: true,
            description: "Must always be filled",
          },
          optional_copy: {
            $ref: "edge_cases.required_notes",
            required: false,
          },
          clay_body_default_label: {
            $ref: "@clay_body.name",
          },
          malformed_global_ref: {
            $ref: "@location",
            can_create: true,
          },
          missing_global_target: {
            $ref: "@unknown_global.name",
          },
          malformed_state_ref: {
            $ref: "wheel_thrown",
          },
          missing_state_target: {
            $ref: "unknown_state.some_field",
          },
          cyclic_a: {
            $ref: "edge_cases.cyclic_b",
          },
          cyclic_b: {
            $ref: "edge_cases.cyclic_a",
          },
        },
      },
      {
        id: "bisque_fired",
        visible: true,
        friendly_name: "Planning → Glaze",
        past_friendly_name: "Glaze Planned",
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
          kiln_location: {
            $ref: "@location.name",
            can_create: true,
          },
        },
      },
      {
        id: "glaze_fired",
        visible: true,
        friendly_name: "Touching Up",
        past_friendly_name: "Touched Up",
        description: "Final cleanup stretch.",
        successors: ["completed", "recycled"],
        fields: {
          kiln_temperature_c: {
            $ref: "bisque_fired.kiln_temperature_c",
          },
          cone: {
            $ref: "bisque_fired.cone",
          },
          // State ref that chains to a global ref — should behave as a global ref.
          kiln_location: {
            $ref: "bisque_fired.kiln_location",
            description: "Carried-forward kiln location",
          },
          volume_shrinkage: {
            label: "Volume Shrinkage",
            unit: "%",
            decimals: 1,
            display_as: "percent",
            compute: {
              op: "product",
              args: [
                {
                  op: "ratio",
                  args: [
                    { constant: 512 },
                    { constant: 1000 },
                  ],
                },
                { constant: 100 },
              ],
            },
          },
        },
      },
      {
        id: "completed",
        visible: true,
        friendly_name: "Completed",
        past_friendly_name: "Completed",
        description: "All done.",
        terminal: true,
      },
      {
        id: "summary_edge_cases",
        visible: true,
        friendly_name: "Summary Edge Cases",
        past_friendly_name: "Summary Edge Cased",
        description: "Coverage-only summary state.",
        terminal: true,
      },
      {
        id: "recycled",
        visible: true,
        friendly_name: "Recycled",
        past_friendly_name: "Recycled",
        description: "Oops! Next time.",
        terminal: true,
      },
    ],
  },
}));

import {
  formatState,
  formatPastState,
  formatWorkflowFieldLabel,
  getStateDescription,
  getCustomFieldDefinitions,
  getFilterableFields,
  getGlobalComposeFrom,
  getGlobalDisplayField,
  getGlobalPickerFilters,
  getGlobalThumbnailField,
  getStateMetadata,
  getProcessSummaryDefinition,
  isFavoritableGlobal,
  isTerminalState,
  isTaggableGlobal,
  insertableStatesBetween,
  getDefinitionsFromSchema,
} from "./workflow";

describe("getDefinitionsFromSchema", () => {
  it("resolves definitions from a UISchema", () => {
    const schema: any = {
      type: "object",
      properties: {
        clay_weight_lbs: {
          type: "number",
          "x-label": "Custom Label",
          "x-description": "Desc",
          "x-required": true,
        },
        clay_body: {
          type: "string",
          "x-global-ref": "clay_body",
          "x-can-create": true,
        },
      },
    };

    const defs = getDefinitionsFromSchema(schema);
    expect(defs).toHaveLength(2);

    expect(defs[0]).toMatchObject({
      name: "clay_weight_lbs",
      label: "Custom Label",
      type: "number",
      description: "Desc",
      required: true,
      isGlobalRef: false,
    });

    expect(defs[1]).toMatchObject({
      name: "clay_body",
      type: "string",
      isGlobalRef: true,
      globalName: "clay_body",
      canCreate: true,
    });
  });

  it("handles missing UI extensions with fallbacks", () => {
    const schema: any = {
      type: "object",
      properties: {
        simple_field: {
          type: "string",
        },
      },
    };

    const defs = getDefinitionsFromSchema(schema);
    expect(defs[0]).toMatchObject({
      name: "simple_field",
      label: "Simple Field",
      required: false,
    });
  });
});

describe("formatWorkflowFieldLabel", () => {
  it("converts a single snake_case word to Title Case", () => {
    expect(formatWorkflowFieldLabel("name")).toBe("Name");
  });

  it("converts a multi-word snake_case name to Title Case", () => {
    expect(formatWorkflowFieldLabel("clay_weight_lbs")).toBe(
      "Clay Weight Lbs",
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

describe("formatPastState", () => {
  it("uses the workflow-authored past_friendly_name for history display", () => {
    expect(formatPastState("submitted_to_bisque_fire")).toBe("Bisque Fired");
  });

  it("returns a distinct label from formatState for states with different past names", () => {
    expect(formatPastState("bisque_fired")).toBe("Glaze Planned");
    expect(formatState("bisque_fired")).toBe("Planning → Glaze");
  });

  it("returns an empty string for an unknown state", () => {
    expect(formatPastState("unknown_state")).toBe("");
  });
});

describe("getStateDescription", () => {
  it("returns the workflow-authored state description", () => {
    expect(getStateDescription("bisque_fired")).toBe(
      "Done with the first firing!",
    );
  });

  it("returns an empty string for an unknown state", () => {
    expect(getStateDescription("unknown_state")).toBe("");
  });
});

describe("isTerminalState", () => {
  it("returns true for a terminal state", () => {
    expect(isTerminalState("recycled")).toBe(true);
  });

  it("returns false for a non-terminal or unknown state", () => {
    expect(isTerminalState("trimmed")).toBe(false);
    expect(isTerminalState("unknown_state")).toBe(false);
  });
});

describe("getStateMetadata", () => {
  it("returns normalized metadata for a known state", () => {
    expect(getStateMetadata("recycled")).toEqual({
      id: "recycled",
      friendlyName: "Recycled",
      pastFriendlyName: "Recycled",
      description: "Oops! Next time.",
      isTerminal: true,
    });
  });

  it("returns null for an unknown state", () => {
    expect(getStateMetadata("unknown_state")).toBeNull();
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
      glaze_types: {
        global: "glaze_type",
        ordered: true,
        filter_label: "Glaze layers",
      },
    });
  });

  it("returns undefined for a global without compose_from", () => {
    expect(getGlobalComposeFrom("location")).toBeUndefined();
  });

  it("returns undefined for an unknown global", () => {
    expect(getGlobalComposeFrom("nonexistent")).toBeUndefined();
  });
});

describe("getGlobalThumbnailField", () => {
  it("returns the field marked use_as_thumbnail", () => {
    expect(getGlobalThumbnailField("photo_asset")).toBe("image");
  });

  it("returns null when no thumbnail field is declared or the global is unknown", () => {
    expect(getGlobalThumbnailField("glaze_combination")).toBeNull();
    expect(getGlobalThumbnailField("unknown_global")).toBeNull();
  });
});

describe("getGlobalPickerFilters", () => {
  it("returns compose_from filters before filterable global-ref filters", () => {
    expect(getGlobalPickerFilters("kiln_run")).toEqual([
      {
        optionsGlobalName: "firing_profile",
        label: "Firing Profile",
        multiple: false,
        paramKey: "firing_profile_id",
        entryKey: "firing_profile",
      },
    ]);

    expect(getGlobalPickerFilters("glaze_combination")).toEqual([
      {
        optionsGlobalName: "glaze_type",
        label: "Glaze layers",
        multiple: true,
        paramKey: "glaze_type_ids",
        entryKey: "glaze_types",
      },
    ]);
  });

  it("skips malformed global refs and unknown globals", () => {
    expect(getGlobalPickerFilters("unknown_global")).toEqual([]);
    expect(
      getGlobalPickerFilters("kiln_run").find(
        (f) => f.entryKey === "broken_filter",
      ),
    ).toBeUndefined();
  });
});

describe("getCustomFieldDefinitions", () => {
  it("returns an empty array for a state with no additional fields", () => {
    expect(getCustomFieldDefinitions("designed")).toEqual([]);
  });

  it("returns an empty array for an unknown state", () => {
    expect(getCustomFieldDefinitions("nonexistent")).toEqual([]);
  });

  describe("inline fields", () => {
    it("resolves type, description, and required flag", () => {
      const fields = getCustomFieldDefinitions("wheel_thrown");
      const f = fields.find((f) => f.name === "clay_weight_lbs")!;
      expect(f.type).toBe("number");
      expect(f.label).toBe("Clay Weight Lbs");
      expect(f.description).toBe("Weight of clay before trimming");
      expect(f.required).toBe(false);
      expect(f.isGlobalRef).toBe(false);
    });

    it("defaults required to false when not declared", () => {
      const fields = getCustomFieldDefinitions("wheel_thrown");
      const f = fields.find((f) => f.name === "clay_weight_lbs")!;
      expect(f.required).toBe(false);
    });

    it("keeps required=true when declared inline", () => {
      const fields = getCustomFieldDefinitions("edge_cases");
      const f = fields.find((field) => field.name === "required_notes")!;
      expect(f.required).toBe(true);
      expect(f.description).toBe("Must always be filled");
    });
  });

  describe("global ref fields", () => {
    it("sets isGlobalRef, globalName, and globalField", () => {
      const fields = getCustomFieldDefinitions("submitted_to_bisque_fire");
      const f = fields.find((f) => f.name === "kiln_location")!;
      expect(f.isGlobalRef).toBe(true);
      expect(f.globalName).toBe("location");
      expect(f.globalField).toBe("name");
    });

    it("sets canCreate true when declared", () => {
      const fields = getCustomFieldDefinitions("submitted_to_bisque_fire");
      expect(fields.find((f) => f.name === "kiln_location")!.canCreate).toBe(
        true,
      );
    });

    it("resolves the type from the referenced global field", () => {
      const fields = getCustomFieldDefinitions("wheel_thrown");
      expect(fields.find((f) => f.name === "clay_body")!.type).toBe("string");
    });

    it("falls back to a formatted label when neither ref nor target declare one", () => {
      const fields = getCustomFieldDefinitions("edge_cases");
      const f = fields.find((field) => field.name === "clay_body_default_label")!;
      expect(f.label).toBe("Clay Body Default Label");
      expect(f.canCreate).toBe(false);
    });

    it("falls back to string metadata for malformed or missing global refs", () => {
      const fields = getCustomFieldDefinitions("edge_cases");
      const malformed = fields.find((field) => field.name === "malformed_global_ref")!;
      const missing = fields.find((field) => field.name === "missing_global_target")!;
      expect(malformed.type).toBe("string");
      expect(malformed.globalName).toBeUndefined();
      expect(malformed.globalField).toBeUndefined();
      expect(malformed.canCreate).toBe(true);
      expect(missing.type).toBe("string");
      expect(missing.canCreate).toBe(false);
    });
  });

  describe("state ref fields", () => {
    it("resolves the type from the referenced state field", () => {
      const fields = getCustomFieldDefinitions("trimmed");
      const f = fields.find((f) => f.name === "pre_trim_weight_lbs")!;
      expect(f.type).toBe("number");
      expect(f.label).toBe("Pre-trim Weight Lbs");
    });

    it("uses the overridden description from the ref field", () => {
      const fields = getCustomFieldDefinitions("trimmed");
      const f = fields.find((f) => f.name === "pre_trim_weight_lbs")!;
      expect(f.description).toBe("Weight after trimming");
    });

    it("is not marked as a global ref", () => {
      const fields = getCustomFieldDefinitions("trimmed");
      expect(
        fields.find((f) => f.name === "pre_trim_weight_lbs")!.isGlobalRef,
      ).toBe(false);
    });

    it("is marked as a state ref", () => {
      const fields = getCustomFieldDefinitions("trimmed");
      expect(
        fields.find((f) => f.name === "pre_trim_weight_lbs")!.isStateRef,
      ).toBe(true);
    });

    it("carries enum values through transitive state refs", () => {
      const fields = getCustomFieldDefinitions("glaze_fired");
      expect(fields.find((f) => f.name === "cone")!.enum).toEqual([
        "04",
        "03",
        "02",
        "01",
      ]);
    });

    it("inherits description metadata when the ref field does not override it", () => {
      const fields = getCustomFieldDefinitions("trimmed");
      expect(
        fields.find((field) => field.name === "inherited_weight_lbs")!
          .description,
      ).toBe("Weight of clay before trimming");
    });

    it("lets the ref field override a required target back to false", () => {
      const fields = getCustomFieldDefinitions("edge_cases");
      expect(fields.find((field) => field.name === "optional_copy")!.required).toBe(
        false,
      );
    });

    it("state ref chaining to a global ref is treated as a global ref, not a plain state ref", () => {
      const fields = getCustomFieldDefinitions("glaze_fired");
      const f = fields.find((f) => f.name === "kiln_location")!;
      expect(f.isGlobalRef).toBe(true);
      expect(f.isStateRef).toBe(false);
      expect(f.globalName).toBe("location");
      expect(f.globalField).toBe("name");
    });

    it("state ref chaining to a global ref uses the overriding description", () => {
      const fields = getCustomFieldDefinitions("glaze_fired");
      const f = fields.find((f) => f.name === "kiln_location")!;
      expect(f.description).toBe("Carried-forward kiln location");
    });

    it("state ref chaining to a global ref defaults canCreate to false (no can_create on the ref)", () => {
      const fields = getCustomFieldDefinitions("glaze_fired");
      expect(fields.find((f) => f.name === "kiln_location")!.canCreate).toBe(false);
    });

    it("falls back to string metadata for malformed, missing, or cyclic state refs", () => {
      const fields = getCustomFieldDefinitions("edge_cases");
      expect(fields.find((field) => field.name === "malformed_state_ref")!.type).toBe(
        "string",
      );
      expect(
        fields.find((field) => field.name === "missing_state_target")!.type,
      ).toBe("string");
      expect(fields.find((field) => field.name === "cyclic_a")!.type).toBe(
        "string",
      );
      expect(fields.find((field) => field.name === "cyclic_b")!.type).toBe(
        "string",
      );
    });
  });

  describe("calculated fields", () => {
    it("sets isCalculated to true and preserves unit/decimals", () => {
      const fields = getCustomFieldDefinitions("glaze_fired");
      const f = fields.find((f) => f.name === "volume_shrinkage")!;
      expect(f.isCalculated).toBe(true);
      expect(f.type).toBe("number");
      expect(f.unit).toBe("%");
      expect(f.decimals).toBe(1);
    });

    it("is not marked as a state ref or global ref", () => {
      const fields = getCustomFieldDefinitions("glaze_fired");
      const f = fields.find((f) => f.name === "volume_shrinkage")!;
      expect(f.isStateRef).toBe(false);
      expect(f.isGlobalRef).toBe(false);
    });
  });

  describe("inline fields are not state refs", () => {

    it("inline field has isStateRef false", () => {
      const fields = getCustomFieldDefinitions("wheel_thrown");
      expect(
        fields.find((f) => f.name === "clay_weight_lbs")!.isStateRef,
      ).toBe(false);
    });
  });

  describe("global ref fields are not state refs", () => {
    it("global ref field has isStateRef false", () => {
      const fields = getCustomFieldDefinitions("submitted_to_bisque_fire");
      expect(fields.find((f) => f.name === "kiln_location")!.isStateRef).toBe(
        false,
      );
    });
  });

  it("uses the workflow label for inline fields", () => {
    const fields = getCustomFieldDefinitions("submitted_to_bisque_fire");
    expect(fields.find((f) => f.name === "firing_fee_usd")!.label).toBe(
      "Firing Fee (USD)",
    );
  });
});

describe("getProcessSummaryDefinition", () => {
  it("returns resolved direct, computed, and text summary items", () => {
    const summary = getProcessSummaryDefinition();

    expect(summary).toHaveLength(2);
    expect(summary[0].title).toBe("Making");
    expect(summary[0].fields[0]).toMatchObject({
      kind: "value",
      label: "Starting weight",
      ref: "wheel_thrown.clay_weight_lbs",
      stateId: "wheel_thrown",
      fieldName: "clay_weight_lbs",
      field: expect.objectContaining({ type: "number" }),
    });
    expect(summary[0].fields[1]).toMatchObject({
      kind: "compute",
      label: "Trimming loss",
      compute: expect.objectContaining({
        op: "difference",
        left: "wheel_thrown.clay_weight_lbs",
        right: "trimmed.trimmed_weight_lbs",
      }),
      when: { state_exists: "trimmed" },
    });
    expect(summary[0].fields[2]).toMatchObject({
      kind: "text",
      label: "Wax resist",
      text: "Not recorded",
      when: { state_missing: "waxed" },
    });
  });

  it("handles omitted labels and skips unresolved value refs", () => {
    const summary = getProcessSummaryDefinition();

    expect(summary).toHaveLength(2);
    expect(summary[1].fields).toHaveLength(3);
    expect(summary[1].fields[0]).toMatchObject({
      kind: "value",
      label: "Clay Body",
      ref: "wheel_thrown.clay_body",
    });
    expect(summary[1].fields[1]).toMatchObject({
      kind: "text",
      label: "",
      text: "Fallback label text",
    });
    expect(summary[1].fields[2]).toMatchObject({
      kind: "compute",
      label: "Sum",
      compute: expect.objectContaining({ op: "sum" }),
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

  it("falls back to a formatted label when a filterable field omits one", () => {
    expect(getFilterableFields("kiln_run")).toEqual([
      {
        name: "firing_profile",
        type: undefined,
        label: "Firing Profile",
      },
      {
        name: "broken_filter",
        type: undefined,
        label: "Broken Filter",
      },
      {
        name: "atmosphere",
        type: "string",
        label: "Atmosphere",
      },
    ]);
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

describe("insertableStatesBetween", () => {
  it("returns all successors of designed when only designed is present", () => {
    const result = insertableStatesBetween("designed", new Set(["designed"]));
    expect(result).toEqual(expect.arrayContaining(["wheel_thrown", "handbuilt"]));
    expect(result).toHaveLength(2);
  });

  it("filters out already-present states", () => {
    const result = insertableStatesBetween("designed", new Set(["designed", "wheel_thrown"]));
    expect(result).toEqual(["handbuilt"]);
  });

  it("returns empty when all successors are already present", () => {
    const result = insertableStatesBetween("designed", new Set(["designed", "wheel_thrown", "handbuilt"]));
    expect(result).toEqual([]);
  });

  it("returns empty for a terminal state with no successors", () => {
    const result = insertableStatesBetween("completed", new Set(["designed", "completed"]));
    expect(result).toEqual([]);
  });
});
