import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import Button from "@mui/material/Button";
import { http, HttpResponse, delay } from "msw";
import { DeveloperTokensDialog } from "../components/DeveloperTokensDialog";
import type { AgentToken } from "../util/types";

/**
 * DeveloperTokensDialog manages `pdagent_…` bearer tokens for external agent
 * access (MCP servers, ChatGPT actions).
 *
 * Rationale (PR #879 — "feat(auth): API token authentication for external
 * agents"; documented further in PR #1007):
 * - Tokens carry standard user permissions only — staff privileges are never
 *   granted, called out directly in the dialog body copy.
 * - The raw token value is returned exactly once, from the create response —
 *   the list endpoint never re-exposes it, so the dialog shows a one-time
 *   "copy this now" warning banner immediately after creation.
 * - `useQuery` is `enabled: open` so the token list isn't fetched until the
 *   dialog is actually opened.
 *
 * Edge cases:
 * - Empty state: "No active tokens. Create one above." replaces the table.
 * - Loading: a `LinearProgress` bar renders under the title while fetching.
 * - Create failure: an inline `Alert` appears under the create form; the
 *   typed name is only cleared on success, so a failed submission is easy to retry.
 */
const meta = {
  title: "Components/DeveloperTokensDialog",
  component: DeveloperTokensDialog,
  parameters: {
    layout: "centered",
    docs: {
      inlineStories: false,
      iframeHeight: 500,
      source: {
        code: `
<DeveloperTokensDialog
  open={true}
  onClose={() => {}}
  userId={1}
/>`,
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    open: { table: { disable: true } },
  },
  render: (args) => <DeveloperTokensDialogWithState {...args} />,
} satisfies Meta<typeof DeveloperTokensDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function DeveloperTokensDialogWithState(
  args: React.ComponentProps<typeof DeveloperTokensDialog>,
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="contained" onClick={() => setOpen(true)}>
        Manage Developer Tokens
      </Button>
      <DeveloperTokensDialog
        {...args}
        open={open}
        onClose={() => {
          setOpen(false);
          args.onClose();
        }}
      />
    </>
  );
}

const csrfHandler = http.get("/api/auth/csrf/", () => HttpResponse.json({}));
const createTokenHandler = http.post("/api/auth/agent-tokens/", () =>
  HttpResponse.json({
    id: "tok-3",
    name: "New Agent",
    created_at: new Date().toISOString(),
    last_used_at: null,
    token: "pdagent_live_a1b2c3d4e5f6g7h8i9j0",
  }),
);

const mockTokens: AgentToken[] = [
  {
    id: "tok-1",
    name: "Claude MCP",
    created_at: new Date("2026-06-01T10:00:00Z"),
    last_used_at: new Date("2026-07-09T08:30:00Z"),
  },
  {
    id: "tok-2",
    name: "ChatGPT Actions",
    created_at: new Date("2026-06-15T14:00:00Z"),
    last_used_at: undefined,
  },
];

export const WithTokens: Story = {
  args: { open: false, onClose: () => {}, userId: 1 },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        createTokenHandler,
        http.get("/api/auth/agent-tokens/", () => HttpResponse.json(mockTokens)),
        http.delete("/api/auth/agent-tokens/:id/", () => new HttpResponse(null, { status: 204 })),
      ],
    },
  },
};

export const Empty: Story = {
  args: { open: false, onClose: () => {}, userId: 1 },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        createTokenHandler,
        http.get("/api/auth/agent-tokens/", () => HttpResponse.json([])),
      ],
    },
  },
};

export const Loading: Story = {
  args: { open: false, onClose: () => {}, userId: 1 },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        createTokenHandler,
        http.get("/api/auth/agent-tokens/", async () => {
          await delay("infinite");
          return HttpResponse.json([]);
        }),
      ],
    },
  },
};

export const TokenJustCreated: Story = {
  args: { open: false, onClose: () => {}, userId: 1 },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        createTokenHandler,
        http.get("/api/auth/agent-tokens/", () => HttpResponse.json(mockTokens)),
      ],
    },
  },
};

export const CreateFailed: Story = {
  args: { open: false, onClose: () => {}, userId: 1 },
  parameters: {
    msw: {
      handlers: [
        csrfHandler,
        http.get("/api/auth/agent-tokens/", () => HttpResponse.json(mockTokens)),
        http.post("/api/auth/agent-tokens/", () => HttpResponse.json({}, { status: 500 })),
      ],
    },
  },
};
