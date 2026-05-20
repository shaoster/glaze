import type { components } from "./generated-types";

type SavedUserPreferences = NonNullable<
  components["schemas"]["UserPreferences"]["preferences"]
>;

type TutorialPreferences = NonNullable<SavedUserPreferences["tutorials"]>;

export type TutorialToggleKey = keyof TutorialPreferences;

export const TUTORIAL_TOGGLE_KEYS = {
  SUMMARY_CUSTOMIZE_POPUP: "summary_customize_popover",
} as const satisfies Record<string, TutorialToggleKey>;

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
};

export const TUTORIAL_TOGGLE_VALUES = Object.keys(
  TUTORIAL_TOGGLE_METADATA,
) as TutorialToggleKey[];
