import type { Meta, StoryObj } from "@storybook/react";
import PieceList from "../components/PieceList";
import { http, HttpResponse } from "msw";
import type { PieceSummary } from "../util/types";

/**
 * PieceList is the primary dashboard for browsing and managing pieces.
 * 
 * Rationale:
 * - Migrated to a performant virtualized grid (Masonic) in Issue #202 to handle 1000+ pieces.
 * - Implements server-side sorting and pagination (Issue #256).
 * - Features inline tag filtering and search (Issue #290).
 * 
 * Edge cases:
 * - Empty library: Displays an onboarding call-to-action to create the first piece.
 * - Loading more: Shows a spinner at the bottom when fetching the next page of results.
 * - API Error: Provides a failure notification with a clear retry path.
 */
const meta = {
  title: "Components/PieceList",
  component: PieceList,
  parameters: {
    layout: "fullscreen",
    docs: {
      inlineStories: false,
      iframeHeight: 800,
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PieceList>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockPieces: PieceSummary[] = [
  {
    id: "p1",
    name: "Midnight Bowl",
    created: new Date("2026-05-10"),
    last_modified: new Date("2026-05-12"),
    thumbnail: null,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "glaze_fired", created: new Date("2026-05-12") } as any,
    current_location: "Finished Goods Shelf",
    tags: [{ id: "t1", name: "midnight", color: "#121232", is_public: true }],
    shared: false,
    is_editable: false,
    can_edit: true,
    showcase_fields: [],
  },
  {
    id: "p2",
    name: "Spring Plate",
    created: new Date("2026-05-08"),
    last_modified: new Date("2026-05-09"),
    thumbnail: null,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "bisque_fired", created: new Date("2026-05-09") } as any,
    current_location: "Bisque Shelf",
    tags: [{ id: "t2", name: "spring", color: "#8eb89a", is_public: true }],
    shared: true,
    is_editable: false,
    can_edit: true,
    showcase_fields: [],
  },
];

export const Default: Story = {
  args: {
    pieces: mockPieces,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () => {
          return HttpResponse.json({
            count: 2,
            results: mockPieces,
          });
        }),
      ],
    },
  },
};

export const Empty: Story = {
  args: {
    pieces: [],
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () => {
          return HttpResponse.json({
            count: 0,
            results: [],
          });
        }),
      ],
    },
  },
};

export const Loading: Story = {
  args: {
    pieces: [],
    loading: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () => {
          return new Promise(() => {}); // Never resolves
        }),
      ],
    },
  },
};

export const Error: Story = {
  args: {
    pieces: [],
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      ],
    },
  },
};
