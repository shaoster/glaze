import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../util/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../util/api")>();
  return {
    ...actual,
    fetchUserPreferences: vi.fn().mockResolvedValue({
      preferences: {
        process_summary_fields: ["piece.name"],
        tutorials: {
          summary_customize_popover: "show",
        },
      },
    }),
  };
});

import UserPreferencesDialog from "../UserPreferencesDialog";
import {
  CurrentUserProvider,
  PreferencesDialogProvider,
} from "../CurrentUserContext";

function renderDialog(activeSectionId: "process-summary" | "tutorials") {
  return render(
    <PreferencesDialogProvider
      openPreferencesDialog={vi.fn()}
      saveUserPreferences={async (preferences) => preferences}
    >
      <CurrentUserProvider
        currentUser={{
          id: 1,
          email: "user@example.com",
          first_name: "Jane",
          last_name: "Doe",
          is_staff: false,
          openid_subject: "",
          profile_image_url: "",
          preferences: {
            process_summary_fields: ["piece.name"],
            tutorials: {
              summary_customize_popover: "show",
            },
          },
        }}
      >
        <UserPreferencesDialog
          open
          activeSectionId={activeSectionId}
          onClose={vi.fn()}
          onSectionChange={vi.fn()}
        />
      </CurrentUserProvider>
    </PreferencesDialogProvider>,
  );
}

describe("UserPreferencesDialog", () => {
  it("can collapse the active section back to no section", async () => {
    const user = userEvent.setup();
    const onSectionChange = vi.fn();

    render(
      <PreferencesDialogProvider
        openPreferencesDialog={vi.fn()}
        saveUserPreferences={async (preferences) => preferences}
      >
        <CurrentUserProvider
          currentUser={{
            id: 1,
            email: "user@example.com",
            first_name: "Jane",
            last_name: "Doe",
            is_staff: false,
            openid_subject: "",
            profile_image_url: "",
            preferences: {
              process_summary_fields: ["piece.name"],
              tutorials: {
                summary_customize_popover: "show",
              },
            },
          }}
        >
          <UserPreferencesDialog
            open
            activeSectionId="process-summary"
            onClose={vi.fn()}
            onSectionChange={onSectionChange}
          />
        </CurrentUserProvider>
      </PreferencesDialogProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Process Summary" }));
    expect(onSectionChange).toHaveBeenCalledWith(null);
  });

  it("expands the Process Summary section when routed there", async () => {
    renderDialog("process-summary");

    expect(await screen.findByText("Process Summary")).toBeInTheDocument();
    expect(
      screen.getByText("Choose which fields appear in process summaries."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Show the summary customization tip"),
    ).not.toBeInTheDocument();
  });

  it("expands the Tutorials section when routed there", async () => {
    renderDialog("tutorials");

    expect(await screen.findByText("Show the summary customization tip")).toBeInTheDocument();
    expect(
      screen.queryByText("Select the fields that should appear in your process summaries. Images are excluded."),
    ).not.toBeInTheDocument();
  });

  it("saves the full preferences document when toggling tutorials", async () => {
    const user = userEvent.setup();
    const saveUserPreferences = vi.fn(async (preferences) => preferences);
    const onClose = vi.fn();

    render(
      <PreferencesDialogProvider
        openPreferencesDialog={vi.fn()}
        saveUserPreferences={saveUserPreferences}
      >
        <CurrentUserProvider
          currentUser={{
            id: 1,
            email: "user@example.com",
            first_name: "Jane",
            last_name: "Doe",
            is_staff: false,
            openid_subject: "",
            profile_image_url: "",
            preferences: {
              process_summary_fields: ["piece.name"],
              tutorials: {
                summary_customize_popover: "show",
              },
            },
          }}
        >
          <UserPreferencesDialog
            open
            activeSectionId="tutorials"
            onClose={onClose}
            onSectionChange={vi.fn()}
          />
        </CurrentUserProvider>
      </PreferencesDialogProvider>,
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Show the summary customization tip",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(saveUserPreferences).toHaveBeenCalledWith({
        process_summary_fields: ["piece.name"],
        tutorials: {
          summary_customize_popover: "don't",
        },
      });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
