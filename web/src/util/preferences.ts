/**
 * Web interface to the user_preferences.yml configuration.
 */
import preferencesSchema from "../../../user_preferences.yml";
import tutorialsConfig from "../../../tutorials.yml";

export interface PreferenceField {
  type: "string" | "field-list" | "boolean";
  label: string;
  hint?: string;
  storage: "UserProfile" | "UserProfile.preferences";
  max_length?: number;
  provider?: string;
}

export interface PreferenceSection {
  id: string;
  title: string;
  description?: string;
  fields: Record<string, PreferenceField>;
}

export interface PreferencesSchema {
  version: string;
  sections: PreferenceSection[];
}

const baseSchema = preferencesSchema as unknown as PreferencesSchema;
const tutorials = (
  tutorialsConfig as unknown as {
    tutorials: Record<string, { preference: { label: string; hint?: string } }>;
  }
).tutorials;

const tutorialFields: Record<string, PreferenceField> = {};
for (const [key, tutorial] of Object.entries(tutorials)) {
  tutorialFields[key] = {
    type: "boolean",
    label: tutorial.preference.label,
    hint: tutorial.preference.hint,
    storage: "UserProfile.preferences",
  };
}

export const PREFERENCES_SCHEMA: PreferencesSchema = {
  ...baseSchema,
  sections: [
    ...baseSchema.sections,
    {
      id: "tutorials",
      title: "Tutorials",
      description: "Control which helpful tips and guides are shown.",
      fields: tutorialFields,
    },
  ],
};

export function getFieldDefinition(
  fieldId: string,
): PreferenceField | undefined {
  for (const section of PREFERENCES_SCHEMA.sections) {
    if (section.fields[fieldId]) {
      return section.fields[fieldId];
    }
  }
  return undefined;
}
