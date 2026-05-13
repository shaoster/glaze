import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
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
        successors: ["wheel_thrown"],
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
  deletePieceState: vi.fn(),
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

  it("renders 'Insert state' button when is_editable and insertable states exist", async () => {
    // designed → wheel_thrown is possible; history only has designed
    const designedState = makeState({ id: "designed-id", state: "designed" });
    const piece = makePiece({
      is_editable: true,
      history: [designedState],
    });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[designedState]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.getByRole("button", { name: /insert state/i }),
    ).toBeInTheDocument();
  });

  it("does not render 'Insert state' button when not editable", async () => {
    const designedState = makeState({ id: "designed-id", state: "designed" });
    const piece = makePiece({
      is_editable: false,
      history: [designedState],
    });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[designedState]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.queryByRole("button", { name: /insert state/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking 'Insert state' opens a menu and selecting calls addPieceState", async () => {
    const updated = makePiece();
    vi.mocked(api.addPieceState).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    const designedState = makeState({ id: "designed-id", state: "designed" });
    const piece = makePiece({
      is_editable: true,
      history: [designedState],
    });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[designedState]}
          piece={piece}
          onPieceUpdated={onPieceUpdated}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: /insert state/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /throwing/i }));

    await waitFor(() => {
      expect(api.addPieceState).toHaveBeenCalledWith("piece-id-1", {
        state: "wheel_thrown",
      });
    });
    expect(onPieceUpdated).toHaveBeenCalledWith(updated);
  });

  it("renders delete button on non-designed historical states in edit mode", async () => {
    const wheelState = makeState({ id: "wt-id", state: "wheel_thrown" });
    const designedState = makeState({ id: "d-id", state: "designed" });
    const piece = makePiece({
      is_editable: true,
      history: [designedState, wheelState],
    });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[designedState, wheelState]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.getByRole("button", { name: /delete.*state/i }),
    ).toBeInTheDocument();
  });

  it("does not render delete button on designed state", async () => {
    const designedState = makeState({ id: "d-id", state: "designed" });
    const piece = makePiece({
      is_editable: true,
      history: [designedState],
    });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[designedState]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.queryByRole("button", { name: /delete designed state/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render delete button in read mode", async () => {
    const wheelState = makeState({ id: "wt-id", state: "wheel_thrown" });
    const designedState = makeState({ id: "d-id", state: "designed" });
    const piece = makePiece({
      is_editable: false,
      history: [designedState, wheelState],
    });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[designedState, wheelState]}
          piece={piece}
          onPieceUpdated={vi.fn()}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(
      screen.queryByRole("button", { name: /delete/i }),
    ).not.toBeInTheDocument();
  });

  it("clicking delete calls deletePieceState and triggers onPieceUpdated", async () => {
    const updated = makePiece();
    vi.mocked(api.deletePieceState).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    const wheelState = makeState({ id: "wt-id", state: "wheel_thrown" });
    const designedState = makeState({ id: "d-id", state: "designed" });
    const piece = makePiece({
      is_editable: true,
      history: [designedState, wheelState],
    });
    await act(async () => {
      render(
        <PieceHistory
          pastHistory={[designedState, wheelState]}
          piece={piece}
          onPieceUpdated={onPieceUpdated}
        />,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete.*state/i }));
    await waitFor(() => {
      expect(api.deletePieceState).toHaveBeenCalledWith("piece-id-1", "wt-id");
    });
    expect(onPieceUpdated).toHaveBeenCalledWith(updated);
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

  describe("rewind", () => {
    const pastState1 = makeState({ id: "state-1", state: "designed" });
    const pastState2 = makeState({ id: "state-2", state: "wheel_thrown" });

    it("calls onRewind with the state id when a past state is clicked in edit mode", async () => {
      const piece = makePiece({ is_editable: true });
      const onRewind = vi.fn();
      await act(async () => {
        render(
          <PieceHistory
            pastHistory={[pastState1, pastState2]}
            piece={piece}
            onPieceUpdated={vi.fn()}
            rewindedStateId={null}
            onRewind={onRewind}
          />,
        );
      });
      fireEvent.click(screen.getByRole("button", { name: /show history/i }));
      fireEvent.click(screen.getAllByText("Designed")[0].closest("li")!);
      expect(onRewind).toHaveBeenCalledWith("state-1");
    });

    it("calls onRewind with null when the rewound state is clicked again", async () => {
      const piece = makePiece({ is_editable: true });
      const onRewind = vi.fn();
      await act(async () => {
        render(
          <PieceHistory
            pastHistory={[pastState1, pastState2]}
            piece={piece}
            onPieceUpdated={vi.fn()}
            rewindedStateId="state-1"
            onRewind={onRewind}
          />,
        );
      });
      fireEvent.click(screen.getByRole("button", { name: /show history/i }));
      fireEvent.click(screen.getAllByText("Designed")[0].closest("li")!);
      expect(onRewind).toHaveBeenCalledWith(null);
    });

    it("shows a 'Viewing' chip on the rewound state", async () => {
      const piece = makePiece({ is_editable: true });
      await act(async () => {
        render(
          <PieceHistory
            pastHistory={[pastState1, pastState2]}
            piece={piece}
            onPieceUpdated={vi.fn()}
            rewindedStateId="state-1"
            onRewind={vi.fn()}
          />,
        );
      });
      fireEvent.click(screen.getByRole("button", { name: /show history/i }));
      expect(screen.getByText("Viewing")).toBeInTheDocument();
    });

    it("does not show a 'Viewing' chip when no state is rewound", async () => {
      const piece = makePiece({ is_editable: true });
      await act(async () => {
        render(
          <PieceHistory
            pastHistory={[pastState1, pastState2]}
            piece={piece}
            onPieceUpdated={vi.fn()}
            rewindedStateId={null}
            onRewind={vi.fn()}
          />,
        );
      });
      fireEvent.click(screen.getByRole("button", { name: /show history/i }));
      expect(screen.queryByText("Viewing")).not.toBeInTheDocument();
    });

    it("clicking a past state does nothing when onRewind is not provided", async () => {
      const piece = makePiece({ is_editable: true });
      await act(async () => {
        render(
          <PieceHistory
            pastHistory={[pastState1]}
            piece={piece}
            onPieceUpdated={vi.fn()}
          />,
        );
      });
      fireEvent.click(screen.getByRole("button", { name: /show history/i }));
      // Should not throw when clicking without onRewind
      fireEvent.click(screen.getAllByText("Designed")[0].closest("li")!);
    });

    it("calls onRewind with the state id when a past state is clicked in read-only mode", async () => {
      const piece = makePiece({ is_editable: false });
      const onRewind = vi.fn();
      await act(async () => {
        render(
          <PieceHistory
            pastHistory={[pastState1, pastState2]}
            piece={piece}
            onPieceUpdated={vi.fn()}
            rewindedStateId={null}
            onRewind={onRewind}
          />,
        );
      });
      fireEvent.click(screen.getByRole("button", { name: /show history/i }));
      fireEvent.click(screen.getAllByText("Designed")[0].closest("li")!);
      expect(onRewind).toHaveBeenCalledWith("state-1");
    });
  });
});

describe("auto-expand on edit mode", () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    // @ts-expect-error restore
    delete window.HTMLElement.prototype.scrollIntoView;
  });

  it("auto-expands the timeline when is_editable becomes true", async () => {
    const state = makeState({ state: "designed" });
    const piece = makePiece({ is_editable: false });
    const { rerender } = render(
      <PieceHistory pastHistory={[state]} piece={piece} onPieceUpdated={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /show history/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await act(async () => {
      rerender(
        <PieceHistory
          pastHistory={[state]}
          piece={makePiece({ is_editable: true })}
          onPieceUpdated={vi.fn()}
        />,
      );
    });

    expect(screen.getByRole("button", { name: /hide history/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
  });

  it("does not expand the timeline when is_editable stays false", async () => {
    const state1 = makeState({ id: "s1", state: "designed" });
    const state2 = makeState({ id: "s2", state: "wheel_thrown" });
    const piece = makePiece({ is_editable: false });
    const { rerender } = render(
      <PieceHistory pastHistory={[state1]} piece={piece} onPieceUpdated={vi.fn()} />,
    );

    await act(async () => {
      rerender(
        <PieceHistory
          pastHistory={[state1, state2]}
          piece={makePiece({ is_editable: false })}
          onPieceUpdated={vi.fn()}
        />,
      );
    });

    expect(screen.getByRole("button", { name: /show history/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });
});
