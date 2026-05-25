/**
 * Web interface to the user_preferences.yml configuration.
 */
import preferencesSchema from "../../../user_preferences.yml";

export interface PreferenceField {
  type: "string" | "field-multiselect" | "visibility-toggle";
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

export const PREFERENCES_SCHEMA =
  preferencesSchema as unknown as PreferencesSchema;

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
