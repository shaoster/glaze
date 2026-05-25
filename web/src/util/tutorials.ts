
/**
 * Metadata for tutorial toggles driven by user_preferences.yml.
 *
 * NOTE: The field keys here must match the field IDs in user_preferences.yml.
 */
export const TUTORIAL_TOGGLE_KEYS = {
  SUMMARY_CUSTOMIZE_POPUP: "summary_customize_popover",
  CHANGE_ALIAS_PROMPT: "change_alias_prompt",
} as const;

export type TutorialToggleKey =
  (typeof TUTORIAL_TOGGLE_KEYS)[keyof typeof TUTORIAL_TOGGLE_KEYS];

export const TUTORIAL_TOGGLE_METADATA: Record<
  TutorialToggleKey,
  {
    label: string;
    dismissLabel: string;
  }
> = {
  [TUTORIAL_TOGGLE_KEYS.SUMMARY_CUSTOMIZE_POPUP]: {
    label: "Customize this summary!",
    dismissLabel: "Dismiss summary customization tip",
  },
  [TUTORIAL_TOGGLE_KEYS.CHANGE_ALIAS_PROMPT]: {
    label: "Change your alias!",
    dismissLabel: "Dismiss alias tip",
  },
};

export const TUTORIAL_TOGGLE_VALUES = Object.keys(
  TUTORIAL_TOGGLE_METADATA,
) as TutorialToggleKey[];
