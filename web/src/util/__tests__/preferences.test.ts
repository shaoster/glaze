import { describe, expect, it } from "vitest";
import { PREFERENCES_SCHEMA, getFieldDefinition } from "../preferences";

describe("PREFERENCES_SCHEMA", () => {
  it("includes a tutorials section", () => {
    const tutorials = PREFERENCES_SCHEMA.sections.find(
      (s) => s.id === "tutorials",
    );
    expect(tutorials).toBeDefined();
    expect(tutorials?.title).toBe("Tutorials");
  });

  it("includes the identity section from the base YAML", () => {
    const identity = PREFERENCES_SCHEMA.sections.find(
      (s) => s.id === "identity",
    );
    expect(identity).toBeDefined();
  });

  it("has a non-empty fields record in each section", () => {
    for (const section of PREFERENCES_SCHEMA.sections) {
      expect(Object.keys(section.fields).length).toBeGreaterThan(0);
    }
  });
});

describe("getFieldDefinition", () => {
  it("returns definition for a base schema field", () => {
    const field = getFieldDefinition("alias");
    expect(field).toBeDefined();
    expect(field?.type).toBe("string");
  });

  it("returns definition for a tutorial-derived field", () => {
    const field = getFieldDefinition("summary_customize_popover");
    expect(field).toBeDefined();
    expect(field?.type).toBe("boolean");
    expect(field?.storage).toBe("UserProfile.preferences");
  });

  it("returns undefined for an unknown field key", () => {
    expect(getFieldDefinition("nonexistent_key_xyz")).toBeUndefined();
  });
});
