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
import { SMALL_TUTORIAL_INLAY_PLACEMENTS } from "../SmallTutorialInlayConfig";

function makeCurrentUser() {
  return {
    id: 1,
    is_staff: false,
    openid_subject: "",
    preferences: {
      process_summary_fields: [],
      summary_customize_popover: true as const,
      change_alias_prompt: true as const,
    },
  };
}

function renderHarness({
  openPreferencesDialog,
  saveUserPreferencesMock,
  placement,
}: {
  openPreferencesDialog: ReturnType<typeof vi.fn>;
  saveUserPreferencesMock: ReturnType<typeof vi.fn>;
  placement: (typeof SMALL_TUTORIAL_INLAY_PLACEMENTS)[keyof typeof SMALL_TUTORIAL_INLAY_PLACEMENTS];
}) {
  const anchor = document.createElement("h3");
  document.body.appendChild(anchor);

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
            tutorialKey="summary_customize_popover"
            label="Customize this summary!"
            dismissLabel="Dismiss summary customization tip"
            placement={placement}
            onClick={() => openPreferencesDialog("process-summary")}
          />
        </CurrentUserProvider>
      </PreferencesDialogProvider>
    );
  }

  return { anchor, Harness };
}

describe("SmallTutorialInlay", () => {
  it.each([
    SMALL_TUTORIAL_INLAY_PLACEMENTS.LEFT,
    SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT,
    SMALL_TUTORIAL_INLAY_PLACEMENTS.TOP,
  ])("renders %s placement without elevating the layer", async (placement) => {
    const openPreferencesDialog = vi.fn();
    const saveUserPreferencesMock = vi.fn(
      async (preferences: UserPreferences) => preferences,
    );
    const { anchor, Harness } = renderHarness({
      openPreferencesDialog,
      saveUserPreferencesMock,
      placement,
    });

    render(<Harness />);

    const button = await screen.findByRole("button", {
      name: "Customize this summary!",
    });
    const popper = button.closest("[data-popper-placement]");

    expect(popper).toHaveAttribute("data-popper-placement", placement);
    expect(window.getComputedStyle(popper ?? button).zIndex).toBe("auto");

    anchor.remove();
  });

  it("clicking the tip opens preferences and dismisses it", async () => {
    const user = userEvent.setup();
    const openPreferencesDialog = vi.fn();
    const saveUserPreferencesMock = vi.fn(
      async (preferences: UserPreferences) => preferences,
    );
    const { anchor, Harness } = renderHarness({
      openPreferencesDialog,
      saveUserPreferencesMock,
      placement: SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT,
    });

    render(<Harness />);

    await screen.findByRole("button", { name: "Customize this summary!" });
    await user.click(
      screen.getByRole("button", { name: "Customize this summary!" }),
    );

    await waitFor(() => {
      expect(openPreferencesDialog).toHaveBeenCalledWith("process-summary");
      expect(saveUserPreferencesMock).toHaveBeenCalledWith({
        process_summary_fields: [],
        summary_customize_popover: false,
        change_alias_prompt: true,
      });
      expect(
        screen.queryByText("Customize this summary!"),
      ).not.toBeInTheDocument();
    });

    anchor.remove();
  });

  it("dismissing the tip hides it without opening preferences", async () => {
    const user = userEvent.setup();
    const openPreferencesDialog = vi.fn();
    const saveUserPreferencesMock = vi.fn(
      async (preferences: UserPreferences) => preferences,
    );
    const { anchor, Harness } = renderHarness({
      openPreferencesDialog,
      saveUserPreferencesMock,
      placement: SMALL_TUTORIAL_INLAY_PLACEMENTS.RIGHT,
    });

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
        summary_customize_popover: false,
        change_alias_prompt: true,
      });
      expect(
        screen.queryByText("Customize this summary!"),
      ).not.toBeInTheDocument();
    });

    anchor.remove();
  });
});
