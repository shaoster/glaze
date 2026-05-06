import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PieceDetail from "../PieceDetail";
import WorkflowState from "../WorkflowState";
import type {
  PieceDetail as PieceDetailType,
  PieceState,
} from "../../util/types";
import * as api from "../../util/api";

const { mockWorkflow } = vi.hoisted(() => ({
  mockWorkflow: {
    version: "test",
    globals: {
      location: {
        model: "Location",
        fields: {
          name: { type: "string" },
        },
      },
    },
    states: [
      {
        id: "designed",
        visible: true,
        friendly_name: "Designing",
        description: "Design phase.",
        successors: ["wheel_thrown", "handbuilt"],
      },
      {
        id: "wheel_thrown",
        visible: true,
        friendly_name: "Throwing",
        description: "Wheel-thrown.",
        successors: ["trimmed", "recycled"],
      },
      {
        id: "handbuilt",
        visible: true,
        friendly_name: "Handbuilding",
        description: "Handbuilt.",
        successors: ["recycled"],
      },
      {
        id: "trimmed",
        visible: true,
        friendly_name: "Trimming",
        description: "Trimmed.",
        successors: ["recycled"],
      },
      {
        id: "glaze_fired",
        visible: true,
        friendly_name: "Touching Up",
        description: "Glaze fired.",
        successors: ["sanded", "completed", "recycled"],
      },
      {
        id: "sanded",
        visible: true,
        friendly_name: "Sanding",
        description: "Sanding.",
        successors: ["completed", "recycled"],
      },
      {
        id: "glazed",
        visible: true,
        friendly_name: "Glazing",
        description: "Glazing.",
        successors: ["glaze_fired", "recycled"],
      },
      {
        id: "completed",
        visible: true,
        friendly_name: "Completed",
        description: "Completed.",
        terminal: true,
      },
      {
        id: "recycled",
        visible: true,
        friendly_name: "Recycled",
        description: "Recycled.",
        terminal: true,
      },
    ],
  },
}));

vi.mock("../../../workflow.yml", () => ({
  default: mockWorkflow,
}));

// Zero-duration theme so MUI Dialog/Fade animations complete in the next tick
const TEST_THEME = createTheme({
  transitions: {
    create: () => "none",
    duration: {
      shortest: 0,
      shorter: 0,
      short: 0,
      standard: 0,
      complex: 0,
      enteringScreen: 0,
      leavingScreen: 0,
    },
  },
});

vi.mock("../../util/api", () => ({
  fetchGlobalEntries: vi.fn().mockResolvedValue([]),
  fetchGlobalEntriesWithFilters: vi.fn().mockResolvedValue([]),
  updateCurrentState: vi.fn(),
  addPieceState: vi.fn(),
  updatePiece: vi.fn(),
  createTagEntry: vi.fn(),
  createGlobalEntry: vi.fn(),
  toggleGlobalEntryFavorite: vi.fn().mockResolvedValue(undefined),
  hasCloudinaryUploadConfig: vi.fn().mockReturnValue(false),
  uploadImageToCloudinary: vi.fn(),
}));

function makeState(overrides: Partial<PieceState> = {}): PieceState {
  return {
    state: "designed",
    notes: "",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    images: [],
    custom_fields: {},
    previous_state: null,
    next_state: null,
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
    thumbnail: {
      url: "/thumbnails/bowl.svg",
      cloudinary_public_id: null,
      cloud_name: null,
    },
    shared: false,
    can_edit: true,
    current_state: state,
    current_location: "",
    tags: [],
    history: [state],
    ...overrides,
  };
}

async function renderPieceDetail(
  piece = makePiece(),
  onPieceUpdated = vi.fn(),
) {
  const router = createMemoryRouter(
    [
      {
        path: "/pieces/:id",
        element: <PieceDetail piece={piece} onPieceUpdated={onPieceUpdated} />,
      },
      {
        path: "/other",
        element: <div>Elsewhere</div>,
      },
    ],
    { initialEntries: ["/pieces/piece-id-1"] },
  );
  await act(async () => {
    render(
      <ThemeProvider theme={TEST_THEME}>
        <RouterProvider router={router} />
      </ThemeProvider>,
    );
  });
  return { router };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
  vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([]);
});

describe("PieceDetail", () => {
  it("renders piece name", async () => {
    await renderPieceDetail();
    expect(screen.getByText("Test Bowl")).toBeInTheDocument();
  });

  it("does not overwrite newer note drafts when stale piece state props arrive", async () => {
    const onSaved = vi.fn();
    const initialState = makeState({ notes: "Trim foot" });
    const { rerender } = render(
      <ThemeProvider theme={TEST_THEME}>
        <WorkflowState
          initialPieceState={initialState}
          pieceId="piece-id-1"
          onSaved={onSaved}
          autosaveDelayMs={60_000}
        />
      </ThemeProvider>,
    );

    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Trim foot  " },
    });

    rerender(
      <ThemeProvider theme={TEST_THEME}>
        <WorkflowState
          initialPieceState={makeState({ notes: "Trim foot " })}
          pieceId="piece-id-1"
          onSaved={onSaved}
          autosaveDelayMs={60_000}
        />
      </ThemeProvider>,
    );

    expect(screen.getByLabelText("Notes")).toHaveValue("Trim foot  ");
  });

  it("renders current state label", async () => {
    await renderPieceDetail();
    expect(screen.getAllByText("Designing").length).toBeGreaterThan(0);
  });

  it("renders thumbnail image", async () => {
    await renderPieceDetail();
    const imgs = screen.getAllByRole("img");
    expect(
      imgs.some((img) => img.getAttribute("src") === "/thumbnails/bowl.svg"),
    ).toBe(true);
  });

  it("counts all piece images in the hero chip and opens the gallery", async () => {
    const designed = makeState({
      state: "designed",
      images: [
        {
          url: "http://example.com/one.jpg",
          caption: "First image",
          created: new Date("2024-01-15T10:00:00Z"),
          cloudinary_public_id: null,
          cloud_name: null,
        },
      ],
    });
    const thrown = makeState({
      state: "wheel_thrown",
      images: [
        {
          url: "http://example.com/two.jpg",
          caption: "Second image",
          created: new Date("2024-01-16T10:00:00Z"),
          cloudinary_public_id: null,
        },
      ],
    });
    await renderPieceDetail(
      makePiece({
        current_state: thrown,
        history: [designed, thrown],
      }),
    );
    await userEvent.click(
      screen.getAllByRole("button", { name: /2 photos/i })[0],
    );
    expect(screen.getByLabelText("Piece photos")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /open piece photo/i }),
    ).toHaveLength(2);
  });

  it("renders current location controls", async () => {
    await renderPieceDetail();
    expect(
      screen.getByRole("button", { name: "Browse Current location" }),
    ).toBeInTheDocument();
  });

  it("keeps current location browse-only when create is not enabled by workflow metadata", async () => {
    await renderPieceDetail();
    await userEvent.click(
      screen.getByRole("button", { name: "Browse Current location" }),
    );
    expect(
      screen.queryByRole("tab", { name: "Create" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create Location" }),
    ).not.toBeInTheDocument();
  });

  it("saves location updates when confirmed", async () => {
    const updated = makePiece({ current_location: "Studio 7" });
    vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
      { id: "1", name: "Studio 7", isPublic: false },
    ]);
    vi.mocked(api.updateCurrentState).mockResolvedValue(updated);
    vi.mocked(api.updatePiece).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    await renderPieceDetail(undefined, onPieceUpdated);
    await userEvent.click(
      screen.getByRole("button", { name: "Browse Current location" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Studio 7")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("Studio 7"));
    await waitFor(() =>
      expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
        current_location: "Studio 7",
      }),
    );
    await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated));
  });

  it("shows an error when saving location fails", async () => {
    vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
      { id: "1", name: "Studio 7", isPublic: false },
    ]);
    vi.mocked(api.updatePiece).mockRejectedValue(new Error("Network error"));

    await renderPieceDetail();
    await userEvent.click(
      screen.getByRole("button", { name: "Browse Current location" }),
    );
    await waitFor(() =>
      expect(screen.getByText("Studio 7")).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByText("Studio 7"));

    await waitFor(() =>
      expect(
        screen.getByText("Failed to save location. Please try again."),
      ).toBeInTheDocument(),
    );
  });

  it("renders successor state buttons for non-terminal state", async () => {
    await renderPieceDetail();
    const stateFlow = screen.getByRole("group", { name: "State flow" });
    expect(within(stateFlow).getByText("Designing")).toBeInTheDocument();
    expect(
      within(stateFlow).getByRole("button", { name: "Throwing" }),
    ).toBeInTheDocument();
    expect(
      within(stateFlow).getByRole("button", { name: "Handbuilding" }),
    ).toBeInTheDocument();
  });

  it("renders completed before recycled at the end of the successor list", async () => {
    const piece = makePiece({
      current_state: makeState({ state: "glaze_fired" }),
    });
    await renderPieceDetail(piece);

    const stateFlow = screen.getByRole("group", { name: "State flow" });
    const buttons = within(stateFlow).getAllByRole("button");

    expect(buttons.map((button) => button.textContent)).toEqual([
      "Sanding",
      "Completed",
      "Recycled",
    ]);
  });

  it("shows terminal state alert for terminal states", async () => {
    const piece = makePiece({
      current_state: makeState({ state: "completed" }),
      history: [makeState({ state: "completed" })],
    });
    await renderPieceDetail(piece);
    expect(screen.getByText(/terminal state/i)).toBeInTheDocument();
  });

  it("shows share controls for editable terminal pieces", async () => {
    await renderPieceDetail(
      makePiece({
        current_state: makeState({ state: "completed" }),
        history: [makeState({ state: "completed" })],
      }),
    );

    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("shares an editable terminal piece through the PieceDetail API interaction", async () => {
    const updated = makePiece({
      shared: true,
      current_state: makeState({ state: "completed" }),
      history: [makeState({ state: "completed" })],
    });
    vi.mocked(api.updatePiece).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    await renderPieceDetail(
      makePiece({
        current_state: makeState({ state: "completed" }),
        history: [makeState({ state: "completed" })],
      }),
      onPieceUpdated,
    );

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
        shared: true,
      }),
    );
    expect(onPieceUpdated).toHaveBeenCalledWith(updated);
    expect(screen.getByText("Public link created.")).toBeInTheDocument();
  });

  it("copies the public link for a shared terminal piece", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    await renderPieceDetail(
      makePiece({
        shared: true,
        current_state: makeState({ state: "completed" }),
        history: [makeState({ state: "completed" })],
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost:3000/pieces/piece-id-1",
      ),
    );
  });

  it("uses native share when available for a shared terminal piece", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    await renderPieceDetail(
      makePiece({
        shared: true,
        current_state: makeState({ state: "completed" }),
        history: [makeState({ state: "completed" })],
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        text: "Powered by PotterDoc",
        title: "Test Bowl — Completed",
        url: "http://localhost:3000/pieces/piece-id-1",
      }),
    );
  });

  it("shows no transition buttons for terminal states", async () => {
    const piece = makePiece({
      current_state: makeState({ state: "completed" }),
      history: [makeState({ state: "completed" })],
    });
    await renderPieceDetail(piece);
    expect(
      screen.queryByRole("button", { name: "Throwing" }),
    ).not.toBeInTheDocument();
  });

  it("hides editing controls in read-only mode", async () => {
    await renderPieceDetail(
      makePiece({
        can_edit: false,
        shared: true,
        current_state: makeState({ state: "completed" }),
        history: [makeState({ state: "completed" })],
      }),
    );

    expect(
      screen.queryByRole("button", { name: "Edit piece name" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add or edit tags" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Upload Image" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unshare" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Browse Current location" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notes")).not.toBeInTheDocument();
  });

  it("transition buttons disabled when there are unsaved changes", async () => {
    await renderPieceDetail();
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Dirty notes" },
    });
    const transitionBtn = screen.getByRole("button", { name: "Throwing" });
    expect(transitionBtn).toBeDisabled();
  });

  it("clicking transition button opens confirmation dialog", async () => {
    await renderPieceDetail();
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    expect(screen.getByText(/Confirm State Transition/i)).toBeInTheDocument();
  });

  it("confirmation dialog shows from/to states", async () => {
    await renderPieceDetail();
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    expect(screen.getAllByText(/Designing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Throwing/).length).toBeGreaterThan(0);
  });

  it("cancelling confirmation closes dialog", async () => {
    await renderPieceDetail();
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("confirming transition calls addPieceState", async () => {
    const updated = makePiece({
      current_state: makeState({ state: "wheel_thrown" }),
    });
    vi.mocked(api.addPieceState).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    await renderPieceDetail(makePiece(), onPieceUpdated);
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(api.addPieceState).toHaveBeenCalledWith("piece-id-1", {
        state: "wheel_thrown",
      }),
    );
    await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated));
  });

  it("history panel hidden by default", async () => {
    const piece = makePiece({
      history: [
        makeState({ state: "designed" }),
        makeState({ state: "wheel_thrown" }),
      ],
      current_state: makeState({ state: "wheel_thrown" }),
    });
    await renderPieceDetail(piece);
    expect(
      screen.getByRole("button", { name: /show history/i }),
    ).toBeInTheDocument();
  });

  it("history panel toggles on click", async () => {
    const piece = makePiece({
      history: [
        makeState({
          state: "designed",
          created: new Date("2024-01-14T10:00:00Z"),
        }),
        makeState({
          state: "wheel_thrown",
          created: new Date("2024-01-15T10:00:00Z"),
        }),
      ],
      current_state: makeState({
        state: "wheel_thrown",
        created: new Date("2024-01-15T10:00:00Z"),
      }),
    });
    await renderPieceDetail(piece);
    fireEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByText("Designed")).toBeInTheDocument();
  });

  it("no history panel when piece has only one state", async () => {
    await renderPieceDetail();
    expect(
      screen.queryByRole("button", { name: /show history/i }),
    ).not.toBeInTheDocument();
  });

  describe("piece name editing", () => {
    it("shows edit icon button next to piece name", async () => {
      await renderPieceDetail();
      expect(
        screen.getByRole("button", { name: "Edit piece name" }),
      ).toBeInTheDocument();
    });

    it("clicking edit icon shows name input field", async () => {
      await renderPieceDetail();
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      expect(
        screen.getByRole("textbox", { name: "Piece name" }),
      ).toBeInTheDocument();
    });

    it("name input is pre-filled with current piece name", async () => {
      await renderPieceDetail();
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      expect(screen.getByRole("textbox", { name: "Piece name" })).toHaveValue(
        "Test Bowl",
      );
    });

    it("cancel button restores display mode", async () => {
      await renderPieceDetail();
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel name edit" }));
      expect(
        screen.queryByRole("textbox", { name: "Piece name" }),
      ).not.toBeInTheDocument();
      expect(screen.getByText("Test Bowl")).toBeInTheDocument();
    });

    it("pressing Escape cancels editing", async () => {
      await renderPieceDetail();
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      const input = screen.getByRole("textbox", { name: "Piece name" });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(
        screen.queryByRole("textbox", { name: "Piece name" }),
      ).not.toBeInTheDocument();
    });

    it("save button calls updatePiece with new name", async () => {
      const updated = makePiece({ name: "New Vase" });
      vi.mocked(api.updatePiece).mockResolvedValue(updated);
      const onPieceUpdated = vi.fn();
      await renderPieceDetail(makePiece(), onPieceUpdated);
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      const input = screen.getByRole("textbox", { name: "Piece name" });
      fireEvent.change(input, { target: { value: "New Vase" } });
      fireEvent.click(screen.getByRole("button", { name: "Save name" }));
      await waitFor(() =>
        expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
          name: "New Vase",
        }),
      );
      await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated));
    });

    it("pressing Enter saves the name", async () => {
      const updated = makePiece({ name: "Pressed Enter Bowl" });
      vi.mocked(api.updatePiece).mockResolvedValue(updated);
      const onPieceUpdated = vi.fn();
      await renderPieceDetail(makePiece(), onPieceUpdated);
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      const input = screen.getByRole("textbox", { name: "Piece name" });
      fireEvent.change(input, { target: { value: "Pressed Enter Bowl" } });
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() =>
        expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
          name: "Pressed Enter Bowl",
        }),
      );
    });

    it("shows error if name is empty and save is attempted", async () => {
      await renderPieceDetail();
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      const input = screen.getByRole("textbox", { name: "Piece name" });
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Save name" }));
      await waitFor(() =>
        expect(screen.getByText("Name cannot be empty.")).toBeInTheDocument(),
      );
      expect(api.updatePiece).not.toHaveBeenCalled();
    });

    it("does not call API if name is unchanged", async () => {
      await renderPieceDetail();
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      fireEvent.click(screen.getByRole("button", { name: "Save name" }));
      expect(
        screen.queryByRole("textbox", { name: "Piece name" }),
      ).not.toBeInTheDocument();
      expect(api.updatePiece).not.toHaveBeenCalled();
    });

    it("shows an error when saving the name fails", async () => {
      vi.mocked(api.updatePiece).mockRejectedValue(new Error("Network error"));

      await renderPieceDetail();
      fireEvent.click(screen.getByRole("button", { name: "Edit piece name" }));
      fireEvent.change(screen.getByRole("textbox", { name: "Piece name" }), {
        target: { value: "Broken Save Bowl" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Save name" }));

      await waitFor(() =>
        expect(
          screen.getByText("Failed to save name. Please try again."),
        ).toBeInTheDocument(),
      );
      expect(
        screen.getByRole("textbox", { name: "Piece name" }),
      ).toBeInTheDocument();
    });
  });

  describe("navigation blocker", () => {
    it("lets the user stay on the page when blocked navigation is canceled", async () => {
      const { router } = await renderPieceDetail();

      fireEvent.change(screen.getByLabelText("Notes"), {
        target: { value: "Unsaved notes" },
      });
      await act(async () => {
        await router.navigate("/other");
      });

      expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Stay" }));

      expect(screen.queryByText("Elsewhere")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    });

    it("allows leaving after confirmation when there are unsaved changes", async () => {
      const { router } = await renderPieceDetail();

      fireEvent.change(screen.getByLabelText("Notes"), {
        target: { value: "Unsaved notes" },
      });
      await act(async () => {
        await router.navigate("/other");
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Leave without saving" }),
      );

      await waitFor(() =>
        expect(screen.getByText("Elsewhere")).toBeInTheDocument(),
      );
    });
  });

  describe("tag management", () => {
    it("shows tag chips with an edit button by default", async () => {
      await renderPieceDetail(
        makePiece({
          tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
        }),
      );

      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Add or edit tags" }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
    });

    it("shows the tag editor when the edit button is pressed", async () => {
      await renderPieceDetail();

      fireEvent.click(screen.getByRole("button", { name: "Add or edit tags" }));

      expect(screen.getByLabelText("Tags")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(
        screen.getByRole("option", { name: "+ New tag" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save tags" }),
      ).toBeInTheDocument();
    });
  });
});
