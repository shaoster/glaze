import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { fn } from "@storybook/test";
import SmallTutorialInlay from "../components/SmallTutorialInlay";
import {
  CurrentUserProvider,
  PreferencesDialogProvider,
} from "../components/CurrentUserContext";
import { SMALL_TUTORIAL_INLAY_PLACEMENTS } from "../components/SmallTutorialInlayConfig";
import type { AuthUser, UserPreferences } from "../util/api";

/**
 * SmallTutorialInlay is an anchored, always-visible popover tip attached to a
 * live DOM element — the "anchored" inlay type in the declarative tutorials
 * system (`tutorials.yml`), dispatched by `TutorialManager`.
 *
 * Rationale (Issue #692 — "single declarative location for tutorials";
 * extended in Issue #911 for the anchored/modal split):
 * - `TutorialManager` resolves `attachment.selector` via `document.querySelector`
 *   and passes the live `HTMLElement` in as `attachedElement`; this story
 *   simulates that by handing the component a ref to a rendered anchor.
 * - Visibility (`shouldShow`) requires an attached element, a signed-in user,
 *   a `saveUserPreferences` function, AND the tutorial's preference key not
 *   already being explicitly `false` — any missing piece hides the tip
 *   entirely rather than rendering in a degraded state.
 * - A gentle infinite bounce animation draws the eye without being disruptive;
 *   respects `prefers-reduced-motion`.
 *
 * Edge cases:
 * - Clicking the tip body dismisses the tutorial (persists the preference)
 *   THEN fires `onClick` — e.g. opening the relevant settings section.
 * - The dedicated close (X) button dismisses without firing `onClick`.
 * - `placement` drives both Popper positioning and the tail/arrow's rotation
 *   and border sides so the tail always points at the anchor.
 */
const meta = {
  title: "Components/SmallTutorialInlay",
  component: SmallTutorialInlay,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  render: (args) => <SmallTutorialInlayHarness {...args} />,
} satisfies Meta<typeof SmallTutorialInlay>;

export default meta;
type Story = StoryObj<typeof meta>;

const initialUser: AuthUser = {
  id: 1,
  is_staff: false,
  openid_subject: "sub-1",
  alias: "test-potter",
  preferences: { process_summary_fields: [] },
};

function SmallTutorialInlayHarness(
  args: React.ComponentProps<typeof SmallTutorialInlay>,
) {
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  // Mirrors App.tsx's real saveUserPreferences wrapper: persist the merged
  // preferences back onto the in-memory user so dismissing the tip (which
  // sets preferences[tutorialKey] = false) actually hides it, the same way
  // it would once TutorialManager re-renders with the updated currentUser.
  const [user, setUser] = useState(initialUser);

  return (
    <CurrentUserProvider currentUser={user}>
      <PreferencesDialogProvider
        openPreferencesDialog={fn()}
        saveUserPreferences={async (p: UserPreferences) => {
          setUser((prev) => ({ ...prev, preferences: p }));
          return p;
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "center", pt: 6, pb: 10 }}>
          <Box ref={setAnchorEl}>
            <Button variant="outlined">Anchor element</Button>
          </Box>
          <SmallTutorialInlay {...args} attachedElement={anchorEl} />
        </Box>
      </PreferencesDialogProvider>
    </CurrentUserProvider>
  );
}

export const RightPlacement: Story = {
  args: {
    attachedElement: null,
    tutorialKey: "change_alias_prompt",
    label: "Change your alias!",
    dismissLabel: "Dismiss alias tip",
    placement: SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT,
    onClick: fn(),
  },
};

export const LeftPlacement: Story = {
  args: {
    ...RightPlacement.args,
    placement: SMALL_TUTORIAL_INLAY_PLACEMENTS.LEFT,
  },
};

export const TopPlacement: Story = {
  args: {
    attachedElement: null,
    tutorialKey: "summary_customize_popover",
    label: "Customize this summary!",
    dismissLabel: "Dismiss summary customization tip",
    placement: SMALL_TUTORIAL_INLAY_PLACEMENTS.TOP,
    onClick: fn(),
  },
};
