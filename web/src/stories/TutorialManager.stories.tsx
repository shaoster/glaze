import type { Meta, StoryObj } from "@storybook/react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { fn } from "@storybook/test";
import TutorialManager from "../components/TutorialManager";
import {
  CurrentUserProvider,
  PreferencesDialogProvider,
} from "../components/CurrentUserContext";
import type { AuthUser } from "../util/api";

/**
 * TutorialManager is the app-wide orchestrator for `tutorials.yml`. It takes
 * no props: it reads the declarative config at build time, watches the DOM
 * via `MutationObserver` for elements matching each anchored tutorial's
 * `attachment.selector`, and renders a `SmallTutorialInlay` (or
 * `LargeTutorialInlay` for `type: modal` tutorials, gated by `route`) per
 * still-visible tutorial.
 *
 * Rationale (Issue #692 — "single declarative location for tutorials";
 * extended in Issue #911 for anchored/modal dispatch):
 * - A tutorial is hidden once `currentUser.preferences[key] === false`
 *   (persisted via `useSaveUserPreferences` when the user dismisses it) or
 *   once any of its `depends_on` tutorials is still active (not yet dismissed).
 * - Rendered once near the app root (`App.tsx`) so it can find anchors
 *   anywhere on the page as routes change.
 *
 * This story mounts real elements with the `id`s that the live
 * `tutorials.yml` selectors target (`#process-summary-title`, `#user-chip`)
 * so `TutorialManager`'s real `document.querySelector` scan finds them —
 * exactly like it does in the deployed app.
 *
 * Edge cases:
 * - No signed-in user: renders nothing (`if (!currentUser) return null`).
 * - A tutorial whose `depends_on` entry hasn't been dismissed yet stays hidden
 *   until the user dismisses the dependency first (sequential onboarding).
 */
const meta = {
  title: "Components/TutorialManager",
  component: TutorialManager,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TutorialManager>;

export default meta;
type Story = StoryObj<typeof meta>;

function makeUser(preferences: Record<string, unknown> = {}): AuthUser {
  return {
    id: 1,
    is_staff: false,
    openid_subject: "sub-1",
    alias: "test-potter",
    preferences: { process_summary_fields: [], ...preferences },
  };
}

function MockPage() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Chip id="user-chip" label="test-potter" />
      </Box>
      <Box>
        <Typography id="process-summary-title" variant="h6">
          Process Summary
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Weight loss, glaze coverage, and other computed fields appear here.
        </Typography>
      </Box>
    </Box>
  );
}

export const BothTutorialsActive: Story = {
  render: () => (
    <CurrentUserProvider currentUser={makeUser()}>
      <PreferencesDialogProvider
        openPreferencesDialog={fn()}
        saveUserPreferences={async (p) => p}
      >
        <MockPage />
        <TutorialManager />
      </PreferencesDialogProvider>
    </CurrentUserProvider>
  ),
};

export const OneTutorialDismissed: Story = {
  render: () => (
    <CurrentUserProvider
      currentUser={makeUser({ summary_customize_popover: false })}
    >
      <PreferencesDialogProvider
        openPreferencesDialog={fn()}
        saveUserPreferences={async (p) => p}
      >
        <MockPage />
        <TutorialManager />
      </PreferencesDialogProvider>
    </CurrentUserProvider>
  ),
};

export const NoSignedInUser: Story = {
  render: () => (
    <CurrentUserProvider currentUser={null}>
      <PreferencesDialogProvider
        openPreferencesDialog={fn()}
        saveUserPreferences={async (p) => p}
      >
        <MockPage />
        <TutorialManager />
      </PreferencesDialogProvider>
    </CurrentUserProvider>
  ),
};
