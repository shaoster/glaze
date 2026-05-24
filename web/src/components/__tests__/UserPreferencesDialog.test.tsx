import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../util/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../util/api")>();
  return {
    ...actual,
    fetchUserPreferences: vi.fn().mockResolvedValue({
      alias: "",
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
  type PreferencesSectionId,
} from "../CurrentUserContext";

function renderDialog(activeSectionId: PreferencesSectionId | null) {
  return render(
    <PreferencesDialogProvider
      openPreferencesDialog={vi.fn()}
      saveUserPreferences={async (preferences) => preferences}
    >
      <CurrentUserProvider
        currentUser={{
          id: 1,
          is_staff: false,
          openid_subject: "",
          alias: "",
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
            is_staff: false,
            openid_subject: "",
            alias: "",
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

    await user.click(await screen.findByRole("button", { name: /Process Summary/i, hidden: true }));
    expect(onSectionChange).toHaveBeenCalledWith(null);
  });

  it("expands the Process Summary section when routed there", async () => {
    renderDialog("process-summary");

    expect(await screen.findByText("Process Summary")).toBeInTheDocument();
    expect(
      screen.getByText("Choose which fields appear in process summaries."),
    ).toBeInTheDocument();
    // Tutorials accordion is collapsed — its checkbox should not be visible.
    expect(screen.queryByRole("checkbox", { name: /summary customization tip/i })).not.toBeInTheDocument();
    // Identity accordion is collapsed — its alias textbox should not be visible.
    expect(screen.queryByRole("textbox", { name: /alias/i })).not.toBeInTheDocument();
  });

  it("expands the Tutorials section when routed there", async () => {
    renderDialog("tutorials");

    expect(await screen.findByText("Show the summary customization tip")).toBeInTheDocument();
    // Identity accordion is collapsed — its alias textbox should not be visible.
    expect(screen.queryByRole("textbox", { name: /alias/i })).not.toBeInTheDocument();
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
            is_staff: false,
            openid_subject: "",
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
      await screen.findByRole("checkbox", {
        name: /summary customization tip/i,
        hidden: true,
      }),
    );
    await user.click(await screen.findByRole("button", { name: /save/i, hidden: true }));

    await waitFor(() => {
      expect(saveUserPreferences).toHaveBeenCalledWith(
        {
          process_summary_fields: ["piece.name"],
          tutorials: {
            summary_customize_popover: "don't",
          },
        },
        "",
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("expands the Identity section when routed there", async () => {
    renderDialog("identity");

    expect(await screen.findByText("Identity")).toBeInTheDocument();
    expect(
      screen.getByText("Manage your display name and alias."),
    ).toBeInTheDocument();
    // Alias field should be visible.
    expect(screen.getByRole("textbox", { name: /alias/i })).toBeInTheDocument();
    // Tutorials accordion is collapsed — its checkbox should not be visible.
    expect(screen.queryByRole("checkbox", { name: /summary customization tip/i })).not.toBeInTheDocument();
  });

  it("saves alias when the alias field is filled in", async () => {
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
            is_staff: false,
            openid_subject: "",
            alias: "",
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
            activeSectionId="identity"
            onClose={onClose}
            onSectionChange={vi.fn()}
          />
        </CurrentUserProvider>
      </PreferencesDialogProvider>,
    );

    // fireEvent bypasses aria-hidden; MUI Dialog's Fade transition keeps content
    // aria-hidden in jsdom so userEvent won't reach it.
    const aliasInput = await screen.findByRole("textbox", { hidden: true });
    fireEvent.change(aliasInput, { target: { value: "Studio Mug" } });

    const saveButton = await screen.findByRole("button", { name: /save/i, hidden: true });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(saveUserPreferences).toHaveBeenCalledWith(
        expect.objectContaining({ process_summary_fields: ["piece.name"] }),
        "Studio Mug",
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("shows an error message and does not close when saving fails", async () => {
    const saveUserPreferences = vi.fn().mockRejectedValue(new Error("Server error"));
    const onClose = vi.fn();

    render(
      <PreferencesDialogProvider
        openPreferencesDialog={vi.fn()}
        saveUserPreferences={saveUserPreferences}
      >
        <CurrentUserProvider
          currentUser={{
            id: 1,
            is_staff: false,
            openid_subject: "",
            alias: "",
            preferences: {
              // Match the fetchUserPreferences mock return value so that the
              // preferencesKey doesn't change on fetch, avoiding a PreferencesForm
              // remount that would detach the save button before it can be clicked.
              process_summary_fields: ["piece.name"],
              tutorials: {
                summary_customize_popover: "show",
              },
            },
          }}
        >
          <UserPreferencesDialog
            open
            activeSectionId={null}
            onClose={onClose}
            onSectionChange={vi.fn()}
          />
        </CurrentUserProvider>
      </PreferencesDialogProvider>,
    );

    // fireEvent bypasses aria-hidden; MUI Dialog's Fade transition keeps content
    // aria-hidden in jsdom so userEvent won't reach it.
    const saveButton = await screen.findByRole("button", { name: /save/i, hidden: true });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/couldn't save your preferences/i)).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
