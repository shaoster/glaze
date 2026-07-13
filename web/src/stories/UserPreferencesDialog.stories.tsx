import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import Button from "@mui/material/Button";
import { http, HttpResponse, delay } from "msw";
import UserPreferencesDialog from "../components/UserPreferencesDialog";
import {
  CurrentUserProvider,
  PreferencesDialogProvider,
  type PreferencesSectionId,
} from "../components/CurrentUserContext";
import {
  updateUserPreferences,
  type AuthUser,
  type UserPreferences,
} from "../util/api";

/**
 * UserPreferencesDialog renders one collapsible `Accordion` section per entry
 * in `user_preferences.yml`, plus a synthesized "Tutorials" section built
 * from every dismissible tutorial in `tutorials.yml`.
 *
 * Rationale:
 * - `activeSectionId` / `onSectionChange` are lifted to the caller (see
 *   `RoutedGlobalEntryField`-style routing elsewhere in the app) so a
 *   `SmallTutorialInlay`'s "open preferences" action can deep-link straight
 *   to the relevant section (e.g. clicking the alias tip opens "Identity").
 * - Field values are seeded from the fetched `UserPreferencesResponse`,
 *   falling back to the in-memory `currentUser` so the dialog isn't blank
 *   while the network request is in flight.
 * - The form remounts (via a `JSON.stringify`-keyed `PreferencesForm`) only
 *   when the *initial* values actually change, so in-progress edits survive
 *   unrelated re-renders.
 *
 * Edge cases:
 * - Loading or saving: a `LinearProgress` bar renders under the title.
 * - Load failure: inline error text, but the form still renders with
 *   fallback values so the dialog isn't stuck.
 * - Save failure: an `Alert` appears above the form; the dialog stays open.
 * - Closing while saving is disabled (`onClose={savePending ? undefined : onClose}`).
 */
const meta = {
  title: "Components/UserPreferencesDialog",
  component: UserPreferencesDialog,
  parameters: {
    layout: "centered",
    docs: {
      inlineStories: false,
      iframeHeight: 650,
      source: {
        code: `
<UserPreferencesDialog
  open={true}
  activeSectionId={null}
  onClose={() => {}}
  onSectionChange={() => {}}
/>`,
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    open: { table: { disable: true } },
  },
  render: (args) => <UserPreferencesDialogWithState {...args} />,
} satisfies Meta<typeof UserPreferencesDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockUser: AuthUser = {
  id: 1,
  is_staff: false,
  openid_subject: "sub-1",
  alias: "clay-wrangler",
  preferences: {
    process_summary_fields: ["piece.name", "glazed.glaze_combination"],
    change_alias_prompt: true,
  },
};

function UserPreferencesDialogWithState(
  args: React.ComponentProps<typeof UserPreferencesDialog>,
) {
  const [open, setOpen] = useState(false);
  const [activeSectionId, setActiveSectionId] =
    useState<PreferencesSectionId | null>(args.activeSectionId);
  return (
    <CurrentUserProvider currentUser={mockUser}>
      <PreferencesDialogProvider
        openPreferencesDialog={() => {}}
        saveUserPreferences={async (
          preferences: UserPreferences,
          alias?: string,
        ) => {
          const response = await updateUserPreferences(preferences, alias);
          return response.preferences;
        }}
      >
        <Button variant="contained" onClick={() => setOpen(true)}>
          Open Preferences
        </Button>
        <UserPreferencesDialog
          {...args}
          open={open}
          activeSectionId={activeSectionId}
          onSectionChange={setActiveSectionId}
          onClose={() => {
            setOpen(false);
            args.onClose();
          }}
        />
      </PreferencesDialogProvider>
    </CurrentUserProvider>
  );
}

const csrfHandler = http.get("/api/auth/csrf/", () => HttpResponse.json({}));
const preferencesHandler = http.get("/api/auth/preferences/", () =>
  HttpResponse.json({ alias: mockUser.alias, preferences: mockUser.preferences }),
);
const saveHandler = http.patch("/api/auth/preferences/", async ({ request }) => {
  const body = (await request.json()) as Record<string, unknown>;
  return HttpResponse.json({
    alias: mockUser.alias,
    preferences: { ...mockUser.preferences, ...(body.preferences as object) },
  });
});

export const Default: Story = {
  args: { open: false, activeSectionId: null, onClose: () => {}, onSectionChange: () => {} },
  parameters: { msw: { handlers: [csrfHandler, preferencesHandler, saveHandler] } },
};

export const IdentitySectionExpanded: Story = {
  args: { ...Default.args, activeSectionId: "identity" },
  parameters: { msw: { handlers: [csrfHandler, preferencesHandler, saveHandler] } },
};

export const Loading: Story = {
  args: { ...Default.args },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        http.get("/api/auth/preferences/", async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
        saveHandler,
      ],
    },
  },
};

export const LoadFailed: Story = {
  args: { ...Default.args },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        http.get("/api/auth/preferences/", () => HttpResponse.json({}, { status: 500 })),
        saveHandler,
      ],
    },
  },
};

export const SaveFailed: Story = {
  args: { ...Default.args, activeSectionId: "identity" },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        preferencesHandler,
        http.patch("/api/auth/preferences/", () => HttpResponse.json({}, { status: 500 })),
      ],
    },
  },
};
