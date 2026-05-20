import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SmallTutorialInlay from "../SmallTutorialInlay";
import {
  CurrentUserProvider,
  PreferencesDialogProvider,
} from "../CurrentUserContext";
import type { UserPreferences } from "../../util/api";
import {
  TUTORIAL_TOGGLE_KEYS,
} from "../../util/tutorials";
import { SMALL_TUTORIAL_INLAY_PLACEMENTS } from "../SmallTutorialInlayConfig";

function makeCurrentUser() {
  return {
    id: 1,
    email: "user@example.com",
    first_name: "Jane",
    last_name: "Doe",
    is_staff: false,
    openid_subject: "",
    profile_image_url: "",
    preferences: {
      process_summary_fields: [],
      tutorials: {
        summary_customize_popover: "show" as const,
      },
    },
  };
}

describe("SmallTutorialInlay", () => {
  it("clicking the tip opens preferences and dismisses it", async () => {
    const user = userEvent.setup();
    const anchor = document.createElement("h3");
    document.body.appendChild(anchor);
    const openPreferencesDialog = vi.fn();
    const saveUserPreferencesMock = vi.fn(
      async (preferences: UserPreferences) => preferences,
    );

    function Harness() {
      const [currentUser, setCurrentUser] = useState(makeCurrentUser());

      return (
        <PreferencesDialogProvider
          openPreferencesDialog={openPreferencesDialog}
          saveUserPreferences={async (preferences) => {
            await saveUserPreferencesMock(preferences);
            setCurrentUser((prev) => ({ ...prev, preferences }));
            return preferences;
          }}
        >
          <CurrentUserProvider currentUser={currentUser}>
            <SmallTutorialInlay
              attachedElement={anchor}
              tutorialKey={TUTORIAL_TOGGLE_KEYS.SUMMARY_CUSTOMIZE_POPUP}
              placement={SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT}
              onClick={() => openPreferencesDialog("process-summary")}
            />
          </CurrentUserProvider>
        </PreferencesDialogProvider>
      );
    }

    render(<Harness />);

    await screen.findByRole("button", { name: "Customize this summary!" });
    await user.click(screen.getByRole("button", { name: "Customize this summary!" }));

    await waitFor(() => {
      expect(openPreferencesDialog).toHaveBeenCalledWith("process-summary");
      expect(saveUserPreferencesMock).toHaveBeenCalledWith({
        process_summary_fields: [],
        tutorials: {
          summary_customize_popover: "don't",
        },
      });
      expect(screen.queryByText("Customize this summary!")).not.toBeInTheDocument();
    });

    anchor.remove();
  });

  it("dismissing the tip hides it without opening preferences", async () => {
    const user = userEvent.setup();
    const anchor = document.createElement("h3");
    document.body.appendChild(anchor);
    const openPreferencesDialog = vi.fn();
    const saveUserPreferencesMock = vi.fn(
      async (preferences: UserPreferences) => preferences,
    );

    function Harness() {
      const [currentUser, setCurrentUser] = useState(makeCurrentUser());

      return (
        <PreferencesDialogProvider
          openPreferencesDialog={openPreferencesDialog}
          saveUserPreferences={async (preferences) => {
            await saveUserPreferencesMock(preferences);
            setCurrentUser((prev) => ({ ...prev, preferences }));
            return preferences;
          }}
        >
          <CurrentUserProvider currentUser={currentUser}>
            <SmallTutorialInlay
              attachedElement={anchor}
              tutorialKey={TUTORIAL_TOGGLE_KEYS.SUMMARY_CUSTOMIZE_POPUP}
              placement={SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT}
              onClick={() => openPreferencesDialog("process-summary")}
            />
          </CurrentUserProvider>
        </PreferencesDialogProvider>
      );
    }

    render(<Harness />);

    await screen.findByRole("button", { name: "Customize this summary!" });
    await user.click(
      screen.getByRole("button", {
        name: "Dismiss summary customization tip",
      }),
    );

    await waitFor(() => {
      expect(openPreferencesDialog).not.toHaveBeenCalled();
      expect(saveUserPreferencesMock).toHaveBeenCalledWith({
        process_summary_fields: [],
        tutorials: {
          summary_customize_popover: "don't",
        },
      });
      expect(screen.queryByText("Customize this summary!")).not.toBeInTheDocument();
    });

    anchor.remove();
  });
});
