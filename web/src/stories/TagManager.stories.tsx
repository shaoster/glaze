import type { Meta, StoryObj } from "@storybook/react";
import TagManager from "../components/TagManager";
import { fn } from "@storybook/test";
import { http, HttpResponse } from "msw";

/**
 * TagManager is the orchestration component for managing a piece's tags.
 *
 * Rationale:
 * - Unifies tag display, search, and creation into a single logical unit.
 * - Manages the draft state of tag selections before committing to the backend.
 * - Integrates with the global save status to provide consistent feedback.
 *
 * Edge cases:
 * - Loading Tags: Fetches available tags on-demand when the user starts editing.
 * - Creating Inline: Allows spawning a CreateTagDialog without leaving the context.
 * - Error Handling: Displays a snackbar if tag attachment fails.
 */
const meta = {
  title: "Components/TagManager",
  component: TagManager,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof TagManager>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockTags = [
  { id: "t1", name: "porcelain", color: "#f0f0f0", is_public: false },
  { id: "t2", name: "reduction", color: "#8a5a3a", is_public: true },
  { id: "t3", name: "wheel-thrown", color: "#a0a0a0", is_public: false },
];

export const Default: Story = {
  args: {
    pieceId: "p1",
    initialTags: [mockTags[0]],
    onSaved: fn(),
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/globals/tag/", () => {
          return HttpResponse.json(
            mockTags.map((t) => ({ ...t, isPublic: t.is_public })),
          );
        }),
        http.patch("/api/pieces/p1/", () => {
          return HttpResponse.json({ id: "p1", tags: mockTags });
        }),
      ],
    },
  },
};

export const NoTags: Story = {
  args: {
    ...Default.args,
    initialTags: [],
  },
  parameters: { ...Default.parameters },
};
