import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import PieceHistory from "../PieceHistory";
import type { PieceDetail as PieceDetailType, PieceState } from "../../util/types";
import * as api from "../../util/api";

vi.mock("../../../workflow.yml", () => ({
  default: {
    version: "test",
    globals: {},
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        description: "Design phase.",
        successors: [],
        past_friendly_name: "Designed",
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        description: "Wheel-thrown.",
        successors: [],
        past_friendly_name: "Wheel Thrown",
      },
    ],
  },
}));

vi.mock("../../util/api", () => ({
  fetchGlobalEntries: vi.fn().mockResolvedValue([]),
  fetchGlobalEntriesWithFilters: vi.fn().mockResolvedValue([]),
  updateCurrentState: vi.fn(),
  updatePastState: vi.fn(),
  addPieceState: vi.fn(),
  updatePiece: vi.fn(),
}));

vi.mock("../WorkflowState", () => ({
  default: ({
    initialPieceState,
    onSaved,
    saveStateFn,
  }: {
    initialPieceState: PieceState;
    onSaved: (updated: PieceDetailType) => void;
    saveStateFn?: (payload: { notes: string }) => Promise<PieceDetailType>;
  }) => (
    <div>
      <label>
        Notes
        <input aria-label="Notes" defaultValue={initialPieceState.notes} />
      </label>
      {saveStateFn && (
        <button
          type="button"
          onClick={async () => {
            const updated = await saveStateFn({ notes: "edited note" });
            onSaved(updated);
          }}
        >
          Save past state
        </button>
      )}
    </div>
  ),
}));

function makeState(overrides: Partial<PieceState> = {}): PieceState {
  return {
    id: "state-id-1",
    state: "designed",
    notes: "",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    images: [],
    previous_state: null,
    next_state: null,
    custom_fields: {},
    has_been_edited: false,
    ...overrides,
  };
}

function makePiece(overrides: Partial<PieceDetailType> = {}): PieceDetailType {
  const state = makeState();
  return {
    id: "piece-id-1",
    name: "Test Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    thumbnail: null,
    shared: false,
    is_editable: false,
    can_edit: true,
    current_state: state,
    current_location: "",
    tags: [],
    showcase_story: "",
    showcase_fields: [],
    history: [state],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PieceHistory", () => {
  it("renders nothing when there are no past states", () => {
    const { container } = render(
      <PieceHistory
        pastHistory={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the history toggle button when there is history", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
        />,
      );
    });
    expect(
      screen.getByRole("button", { name: /show history/i }),
    ).toBeInTheDocument();
  });

  it("shows 'Show history' button by default (not 'Hide history')", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[
            makeState({ state: "designed" }),
            makeState({ state: "wheel_thrown" }),
          ]}
        />,
      );
    });
    expect(screen.getByRole("button", { name: /show history/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /hide history/i })).not.toBeInTheDocument();
  });

  it("toggling shows and hides the history panel", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByRole("button", { name: /hide history/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide history/i }));
    expect(screen.getByRole("button", { name: /show history/i })).toBeInTheDocument();
  });

  it("shows past state labels and timestamps when open", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed", notes: "Test note" })]}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByText("Designed")).toBeInTheDocument();
    expect(screen.getByText(/Test note/)).toBeInTheDocument();
  });

  it("does not render image thumbnails in the history list", async () => {
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[
            makeState({
              state: "designed",
              images: [
                {
                  url: "http://example.com/img1.jpg",
                  caption: "First",
                  created: new Date(),
                  cloudinary_public_id: null,
                  cloud_name: null,
                },
              ],
            }),
          ]}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.queryByRole("button", { name: /view image/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
  });

  it("renders 'Add missing state' button when is_editable and history is open", async () => {
    const piece = makePiece({ is_editable: true });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.getByRole("button", { name: /add missing state/i }),
    ).toBeInTheDocument();
  });

  it("does not render 'Add missing state' button when not editable", async () => {
    const piece = makePiece({ is_editable: false });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.queryByRole("button", { name: /add missing state/i }),
    ).not.toBeInTheDocument();
  });

  it("opens 'Add missing state' dialog on button click", async () => {
    const piece = makePiece({ is_editable: true });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: /add missing state/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("adds a missing state and resets the dialog", async () => {
    const updated = makePiece();
    vi.mocked(api.addPieceState).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    const piece = makePiece({ is_editable: true });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          piece={piece}
          onPieceUpdated={onPieceUpdated}
        />,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: /add missing state/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(screen.getByLabelText("State"));
    fireEvent.click(screen.getByRole("option", { name: "Throwing" }));
    fireEvent.change(within(dialog).getByLabelText("Notes"), {
      target: { value: " forgot this step " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add state$/i }));

    await waitFor(() => {
      expect(api.addPieceState).toHaveBeenCalledWith("piece-id-1", {
        state: "wheel_thrown",
        notes: "forgot this step",
      });
    });
    expect(onPieceUpdated).toHaveBeenCalledWith(updated);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("keeps the add dialog open and shows an error when adding fails", async () => {
    vi.mocked(api.addPieceState).mockRejectedValue(new Error("boom"));
    const piece = makePiece({ is_editable: true });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: /add missing state/i }));
    fireEvent.mouseDown(screen.getByLabelText("State"));
    fireEvent.click(screen.getByRole("option", { name: "Throwing" }));
    fireEvent.click(screen.getByRole("button", { name: /^add state$/i }));

    expect(
      await screen.findByText("Failed to add state. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("clears add dialog fields when canceling", async () => {
    const piece = makePiece({ is_editable: true });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed" })]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: /add missing state/i }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("Notes"), {
      target: { value: "discard me" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /add missing state/i }));
    expect(within(screen.getByRole("dialog")).getByLabelText("Notes")).toHaveValue("");
  });

  it("renders editable Notes fields for past states when is_editable", async () => {
    const piece = makePiece({ is_editable: true });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ state: "designed", notes: "old note" })]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    });
  });

  it("saves edits to a past state through the past-state endpoint", async () => {
    const updated = makePiece();
    vi.mocked(api.updatePastState).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    const piece = makePiece({ is_editable: true });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[makeState({ id: "past-state-id", state: "designed" })]}
          piece={piece}
          onPieceUpdated={onPieceUpdated}
        />,
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: /save past state/i }));

    await waitFor(() => {
      expect(api.updatePastState).toHaveBeenCalledWith(
        "piece-id-1",
        "past-state-id",
        { notes: "edited note" },
      );
    });
    expect(onPieceUpdated).toHaveBeenCalledWith(updated);
  });
});
