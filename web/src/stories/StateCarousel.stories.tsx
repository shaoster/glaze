import type { Meta, StoryObj } from "@storybook/react";
import { http, HttpResponse } from "msw";
import StateCarousel from "../components/StateCarousel";
import { fn } from "@storybook/test";
import type { PieceDetail, PieceState, StateEnum } from "../util/types";
import { STATES, SUCCESSORS, isTerminalState } from "../util/workflow";

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

// Walks SUCCESSORS from the initial workflow state, always preferring an
// unvisited, non-terminal, non-"recycled" successor, so the sample history
// stays a valid path through whatever workflow.yml currently defines rather
// than a hardcoded chain that could drift out of sync with real transitions.
// Some states (e.g. "carved" and "slip_applied") are mutually reachable, so
// the visited set is required to guarantee forward progress and termination
// rather than bouncing between the same two states forever.
function walkHappyPath(steps: number): StateEnum[] {
  const path: StateEnum[] = [STATES[0] as StateEnum];
  const visited = new Set<StateEnum>(path);
  while (path.length < steps) {
    const successors = (SUCCESSORS[path[path.length - 1]] ?? []) as StateEnum[];
    const next = successors.find(
      (s) => s !== "recycled" && !isTerminalState(s) && !visited.has(s),
    );
    if (!next) break;
    path.push(next);
    visited.add(next);
  }
  return path;
}

// Extends a happy-path state sequence to its first terminal state (e.g.
// "completed"), again derived from SUCCESSORS rather than hardcoded, using
// the same visited-set approach to guarantee termination.
function walkToTerminal(path: StateEnum[]): StateEnum[] {
  const extended = [...path];
  const visited = new Set<StateEnum>(extended);
  while (!isTerminalState(extended[extended.length - 1])) {
    const successors = (SUCCESSORS[extended[extended.length - 1]] ?? []) as StateEnum[];
    const next =
      successors.find((s) => s !== "recycled" && !visited.has(s)) ??
      successors.find((s) => !visited.has(s));
    if (!next) break;
    extended.push(next);
    visited.add(next);
  }
  return extended;
}

function statesToHistory(path: StateEnum[]): PieceState[] {
  let created = new Date("2026-05-01T10:00:00Z");
  return path.map((state, i) => {
    const entry = makeState({
      id: `s${i + 1}`,
      state,
      created: new Date(created),
      previous_state: i > 0 ? path[i - 1] : null,
      next_state: i < path.length - 1 ? path[i + 1] : null,
    });
    created = new Date(created.getTime() + 4 * 24 * 60 * 60 * 1000);
    return entry;
  });
}

const midFlowPath = walkHappyPath(5);
const midFlowHistory: PieceState[] = statesToHistory(midFlowPath);
const terminalHistory: PieceState[] = statesToHistory(walkToTerminal(midFlowPath));

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

const editablePiece = makePiece(midFlowHistory, { is_editable: true });

export const EditableWithHistoryModal: Story = {
  args: {
    ...Default.args,
    piece: editablePiece,
  },
  parameters: {
    // The "Edit history" modal (PieceHistory) can edit a date, delete a
    // state, or insert a missing one — each hits a real pieces/:id/states/...
    // endpoint, so all three must be mocked or those controls fail against
    // an unhandled request instead of demonstrating editable history.
    msw: {
      handlers: [
        http.patch("/api/pieces/p1/states/:stateId/", () => HttpResponse.json(editablePiece)),
        http.delete("/api/pieces/p1/states/:stateId/", () => HttpResponse.json(editablePiece)),
        http.post("/api/pieces/p1/states/", () => HttpResponse.json(editablePiece)),
      ],
    },
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
