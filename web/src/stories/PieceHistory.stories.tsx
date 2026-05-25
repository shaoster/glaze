import type { Meta, StoryObj } from "@storybook/react";
import PieceHistory from "../components/PieceHistory";
import { fn } from "@storybook/test";
import type { PieceDetail, PieceState } from "../util/types";
import { http, HttpResponse } from "msw";

/**
 * PieceHistory renders the vertical timeline of all states a piece has transitioned through.
 *
 * Rationale:
 * - Redesigned in Issue #396 to allow editing of historical timestamps.
 * - Supports "Timeline Rewind" (Issue #312), allowing users to view the piece as it existed in the past.
 * - In edit mode, provides affordances for deleting states or inserting missing ones.
 *
 * Edge cases:
 * - Read-only: Timeline items are clickable for rewinding but not editable.
 * - Rewound State: Visual highlighting of the currently selected historical state.
 * - Future States: States chronologically after the rewound state are dimmed.
 * - Insertable States: Shows "+" buttons between items when logical successors exist.
 */
const meta = {
  title: "Components/PieceHistory",
  component: PieceHistory,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PieceHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockPastHistory: PieceState[] = [
  {
    id: "s1",
    state: "designed",
    notes: "Initial sketch.",
    created: new Date("2026-05-01T10:00:00Z"),
    last_modified: new Date("2026-05-01T10:00:00Z"),
    images: [],
    previous_state: null,
    next_state: "wheel_thrown",
    custom_fields: {},
    has_been_edited: false,
  },
  {
    id: "s2",
    state: "wheel_thrown",
    notes: "Thrown with 2lbs clay.",
    created: new Date("2026-05-02T14:00:00Z"),
    last_modified: new Date("2026-05-02T14:00:00Z"),
    images: [],
    previous_state: "designed",
    next_state: "trimmed",
    custom_fields: {},
    has_been_edited: false,
  },
  {
    id: "s3",
    state: "trimmed",
    notes: "Trimmed the foot.",
    created: new Date("2026-05-05T09:00:00Z"),
    last_modified: new Date("2026-05-05T09:00:00Z"),
    images: [],
    previous_state: "wheel_thrown",
    next_state: null,
    custom_fields: {},
    has_been_edited: false,
  },
];

const mockPiece: PieceDetail = {
  id: "p1",
  name: "Test Piece",
  created: new Date(),
  last_modified: new Date(),
  photo_count: 0,
  thumbnail: null,
  shared: false,
  is_editable: false,
  can_edit: true,
  tags: [],
  current_location: "Studio",
  showcase_story: "",
  showcase_fields: [],
  current_state: mockPastHistory[2],
  history: mockPastHistory,
};

export const Default: Story = {
  args: {
    pastHistory: mockPastHistory,
    piece: mockPiece,
    onRewind: fn(),
  },
};

export const Rewinded: Story = {
  args: {
    ...Default.args,
    rewindedStateId: "s2",
  },
};

export const Editable: Story = {
  args: {
    ...Default.args,
    piece: { ...mockPiece, is_editable: true },
    onPieceUpdated: fn(),
  },
  parameters: {
    msw: {
      handlers: [
        http.patch("/api/pieces/p1/states/s1/", () => {
          return HttpResponse.json(mockPiece);
        }),
      ],
    },
  },
};
