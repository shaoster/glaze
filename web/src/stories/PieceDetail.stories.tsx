import type { Meta, StoryObj } from "@storybook/react";
import PieceDetail from "../components/PieceDetail";
import type { PieceDetail as PieceDetailType } from "../util/types";
import { http, HttpResponse } from "msw";

/**
 * PieceDetail is the central orchestration component for viewing and editing a single piece.
 * 
 * Rationale:
 * - Redesigned in Issue #172 to support "Edit Piece History" (is_editable toggle).
 * - Implements Autosave (Issue #245) for name and showcase story.
 * - Supports "Rewind" viewing of past states (Issue #312).
 * 
 * Edge cases:
 * - Publicly shared pieces: Share controls show "Public" status and prevent history editing.
 * - Terminal states: Shows "Process Summary" and "Showcase" sections.
 * - Editing historical states: Allows patching past notes/fields if is_editable is active.
 */
const meta = {
  title: "Components/PieceDetail",
  component: PieceDetail,
  parameters: {
    layout: "fullscreen",
    docs: {
      inlineStories: false,
      iframeHeight: 800,
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PieceDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockPiece: PieceDetailType = {
  id: "p1",
  name: "Hand-thrown Vase",
  created: new Date("2026-05-01"),
  last_modified: new Date("2026-05-15"),
  photo_count: 0,
  thumbnail: null,
  shared: false,
  is_editable: false,
  can_edit: true,
  tags: [
    { id: "t1", name: "porcelain", color: "#f0f0f0", is_public: false },
    { id: "t2", name: "wheel", color: "#a0a0a0", is_public: false },
  ],
  current_location: "Studio Shelf A",
  showcase_story: "",
  showcase_fields: [],
  current_state: {
    id: "s2",
    state: "trimmed",
    notes: "Trimmed the foot ring. Feeling good about the weight.",
    created: new Date("2026-05-10"),
    last_modified: new Date("2026-05-10"),
    images: [],
    previous_state: "wheel_thrown",
    next_state: null,
    custom_fields: {
      trimmed_weight_lbs: 1.2,
      pre_trim_weight_lbs: 1.5,
    },
    has_been_edited: false,
  },
  history: [
    {
      id: "s1",
      state: "wheel_thrown",
      notes: "Started with 1.5lbs of porcelain.",
      created: new Date("2026-05-01"),
      last_modified: new Date("2026-05-01"),
      images: [],
      previous_state: "designed",
      next_state: "trimmed",
      custom_fields: {
        clay_weight_lbs: 1.5,
        clay_body: "B-Mix",
      },
      has_been_edited: false,
    },
    {
      id: "s2",
      state: "trimmed",
      notes: "Trimmed the foot ring. Feeling good about the weight.",
      created: new Date("2026-05-10"),
      last_modified: new Date("2026-05-10"),
      images: [],
      previous_state: "wheel_thrown",
      next_state: null,
      custom_fields: {
        trimmed_weight_lbs: 1.2,
        pre_trim_weight_lbs: 1.5,
      },
      has_been_edited: false,
    },
  ],
};

export const Default: Story = {
  args: {
    piece: mockPiece,
    onPieceUpdated: () => {},
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/globals/location/", () => {
          return HttpResponse.json([
            { id: "l1", name: "Studio Shelf A", is_public: false },
            { id: "l2", name: "Kiln Room", is_public: false },
          ]);
        }),
        http.get("/api/workflow/schema/:state", () => {
          return HttpResponse.json({
            type: "object",
            properties: {
              trimmed_weight_lbs: { type: "number", "x-label": "Trimmed Weight Lbs" },
              pre_trim_weight_lbs: { type: "number", "x-label": "Pre-trim Weight Lbs" },
            },
          });
        }),
      ],
    },
  },
};

export const Editable: Story = {
  args: {
    piece: { ...mockPiece, is_editable: true },
    onPieceUpdated: () => {},
  },
  parameters: { ...Default.parameters },
};

export const PublicShared: Story = {
  args: {
    piece: { ...mockPiece, shared: true, can_edit: false },
    onPieceUpdated: () => {},
  },
  parameters: { ...Default.parameters },
};

export const TerminalState: Story = {
  args: {
    piece: {
      ...mockPiece,
      current_state: {
        id: "s3",
        state: "completed",
        notes: "Finished and beautiful.",
        created: new Date("2026-05-15"),
        last_modified: new Date("2026-05-15"),
        images: [],
        previous_state: "glaze_fired",
        next_state: null,
        custom_fields: {},
        has_been_edited: false,
      },
      history: [
        ...mockPiece.history,
        {
          id: "s3",
          state: "completed",
          notes: "Finished and beautiful.",
          created: new Date("2026-05-15"),
          last_modified: new Date("2026-05-15"),
          images: [],
          previous_state: "glaze_fired",
          next_state: null,
          custom_fields: {},
          has_been_edited: false,
        },
      ],
    },
    onPieceUpdated: () => {},
  },
  parameters: { ...Default.parameters },
};

/**
 * Demonstrates the navigation blocking behavior. 
 * If you try to navigate away while the form is dirty (e.g. by changing notes),
 * the `useBlocker` hook will trigger a confirmation dialog.
 */
export const DirtyState: Story = {
  args: {
    ...Editable.args,
    piece: {
      ...mockPiece,
      is_editable: true,
      current_state: {
        ...mockPiece.current_state,
        notes: "I have changed these notes but not saved yet...",
      },
    },
  },
  parameters: { ...Default.parameters },
};
