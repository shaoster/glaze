import type { Meta, StoryObj } from "@storybook/react";
import PublicPieceShell from "../components/PublicPieceShell";
import { http, HttpResponse } from "msw";

/**
 * PublicPieceShell is the visitor-facing view for a single piece.
 *
 * Rationale:
 * - Redesigned in PR #338 to provide an immersive "Showcase" experience for public visitors.
 * - Highlights the final result with a hero image, story, and selected detail fields.
 * - Provides a "Process Summary" at the bottom to show the making-of journey.
 *
 * Edge cases:
 * - Missing Story: Layout collapses gracefully if no showcase story is provided.
 * - No Showcase Fields: Hides the "Details" section if no fields are selected for showcase.
 * - Large Images: Hero image uses Cloudinary's "detail" context for high quality.
 */
const meta = {
  title: "Components/PublicPieceShell",
  component: PublicPieceShell,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PublicPieceShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockPiece = {
  id: "p1",
  name: "Hand-thrown Vase",
  thumbnail: {
    url: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
  },
  showcase_story:
    "This piece was inspired by traditional Korean celadon techniques, focusing on the subtle crackle glaze and elegant form.",
  showcase_fields: ["wheel_thrown.clay_body", "trimmed.trimmed_weight_lbs"],
  history: [
    {
      id: "s1",
      state: "wheel_thrown",
      created: new Date("2026-05-01T10:00:00Z"),
      custom_fields: { clay_body: "Porcelain" },
      images: [],
    },
    {
      id: "s2",
      state: "trimmed",
      created: new Date("2026-05-05T09:00:00Z"),
      custom_fields: { trimmed_weight_lbs: 1.2 },
      images: [],
    },
  ],
};

export const Default: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/:id/", () => {
          return HttpResponse.json(mockPiece);
        }),
      ],
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/:id/", () => {
          return new Promise(() => {});
        }),
      ],
    },
  },
};
