import type { Meta, StoryObj } from "@storybook/react";
import StateCarousel from "../components/StateCarousel";
import { fn } from "@storybook/test";
import type { PieceDetail, PieceState } from "../util/types";

/**
 * StateCarousel renders a piece's full state history as a horizontal snap-scroll
 * carousel, replacing the old side-by-side StateTransition picker + Timeline
 * SectionCard.
 *
 * Rationale (Issue/PR #994 — "replace StateTransition + Timeline with StateCarousel"):
 * - One card per history entry; the current card additionally renders a
 *   Bezier-fan `BranchConnector` fanning out to all valid successor states.
 * - Clicking a past card's StateChip sets/clears "rewind" (viewing the piece
 *   as it existed at that point in history); the current card's chip always
 *   clears rewind.
 * - `useLayoutEffect` instant-scrolls to the correct card before first paint
 *   (current state, or the rewound state if `rewindedStateId` is set on
 *   load) to avoid a visible flash of card 0.
 * - Mouse drag-to-scroll uses a 5px threshold so drags don't suppress the
 *   click that starts them.
 *
 * Edge cases:
 * - Terminal state (`completed`/`recycled`): centered grid, no successor zone, "end" label.
 * - Rewinded: past chip glows (`rewindSelected`), integrated status Chip appears below the pager dots.
 * - Editable (`piece.is_editable`): reveals an "Edit history" icon button opening a `PieceHistory` modal.
 * - Loading / error: history fetch spinner or retry banner render below the rail without blocking transitions.
 */
const meta = {
  title: "Components/StateCarousel",
  component: StateCarousel,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StateCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

function makeState(overrides: Partial<PieceState> & Pick<PieceState, "id" | "state">): PieceState {
  return {
    notes: "",
    created: new Date("2026-05-01T10:00:00Z"),
    last_modified: new Date("2026-05-01T10:00:00Z"),
    images: [],
    previous_state: null,
    next_state: null,
    custom_fields: {},
    has_been_edited: false,
    ...overrides,
  };
}

const midFlowHistory: PieceState[] = [
  makeState({ id: "s1", state: "designed", created: new Date("2026-05-01T10:00:00Z"), previous_state: null, next_state: "wheel_thrown" }),
  makeState({ id: "s2", state: "wheel_thrown", created: new Date("2026-05-02T14:00:00Z"), previous_state: "designed", next_state: "trimmed" }),
  makeState({ id: "s3", state: "trimmed", created: new Date("2026-05-05T09:00:00Z"), previous_state: "wheel_thrown", next_state: "bisque_fired" }),
  makeState({ id: "s4", state: "bisque_fired", created: new Date("2026-05-10T09:00:00Z"), previous_state: "trimmed", next_state: "glazed" }),
  makeState({ id: "s5", state: "glazed", created: new Date(), previous_state: "bisque_fired", next_state: null }),
];

const terminalHistory: PieceState[] = [
  ...midFlowHistory.slice(0, 4),
  makeState({ id: "s5", state: "glazed", created: new Date("2026-05-12T09:00:00Z"), previous_state: "bisque_fired", next_state: "submitted_to_glaze_fire" }),
  makeState({ id: "s6", state: "submitted_to_glaze_fire", created: new Date("2026-05-13T09:00:00Z"), previous_state: "glazed", next_state: "glaze_fired" }),
  makeState({ id: "s7", state: "glaze_fired", created: new Date("2026-05-20T09:00:00Z"), previous_state: "submitted_to_glaze_fire", next_state: "completed" }),
  makeState({ id: "s8", state: "completed", created: new Date(), previous_state: "glaze_fired", next_state: null }),
];

function makePiece(history: PieceState[], overrides: Partial<PieceDetail> = {}): PieceDetail {
  const current = history[history.length - 1];
  return {
    id: "p1",
    name: "Test Piece",
    created: history[0].created,
    last_modified: current.created,
    photo_count: 0,
    thumbnail: null,
    shared: false,
    is_editable: false,
    can_edit: true,
    tags: [],
    current_location: "Studio",
    showcase_story: "",
    showcase_fields: [],
    showcase_video_url: null,
    owner_alias: null,
    current_state: current,
    history,
    ...overrides,
  };
}

export const Default: Story = {
  args: {
    statesHistory: midFlowHistory,
    piece: makePiece(midFlowHistory),
    onPieceUpdated: fn(),
    onRewind: fn(),
    onTransition: fn(),
  },
};

export const TerminalState: Story = {
  args: {
    ...Default.args,
    statesHistory: terminalHistory,
    piece: makePiece(terminalHistory),
  },
};

export const Rewinded: Story = {
  args: {
    ...Default.args,
    rewindedStateId: "s2",
  },
};

export const EditableWithHistoryModal: Story = {
  args: {
    ...Default.args,
    piece: makePiece(midFlowHistory, { is_editable: true }),
  },
};

export const HistoryLoading: Story = {
  args: {
    ...Default.args,
    historyLoading: true,
  },
};

export const HistoryLoadFailed: Story = {
  args: {
    ...Default.args,
    historyError: new Error("Network error"),
    refetchHistory: fn(),
  },
};

export const AutosaveFailedBlocksTransition: Story = {
  args: {
    ...Default.args,
    hasSaveError: true,
    transitionError: "Auto-save failed. Your changes may not be saved.",
  },
};
