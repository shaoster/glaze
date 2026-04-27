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
import type { PieceDetail as PieceDetailType, PieceState } from "../..//types";
import * as api from "../../util/api";

// Zero-duration theme so MUI Dialog/Fade animations complete in the next tick
// rather than after their default 225–300ms CSS transition timeouts.
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
  updateCurrentState: vi.fn(),
  addPieceState: vi.fn(),
  updatePiece: vi.fn(),
  createTagEntry: vi.fn(),
  createGlobalEntry: vi.fn(),
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
    additional_fields: {},
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
    thumbnail: { url: "/thumbnails/bowl.svg", cloudinary_public_id: null },
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
  // Use createMemoryRouter (data router) so useBlocker works in tests
  const router = createMemoryRouter(
    [
      {
        path: "/pieces/:id",
        element: <PieceDetail piece={piece} onPieceUpdated={onPieceUpdated} />,
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
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
});

describe("PieceDetail", () => {
  it("renders piece name", async () => {
    await renderPieceDetail();
    expect(screen.getByText("Test Bowl")).toBeInTheDocument();
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

  it("renders current location input", async () => {
    await renderPieceDetail();
    expect(screen.getByLabelText("Current location")).toBeInTheDocument();
  });

  it("creates a new current location through the autocomplete", async () => {
    const updated = makePiece({ current_location: "Studio K" });
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
    vi.mocked(api.createGlobalEntry).mockResolvedValue({
      id: "new-id",
      name: "Studio K",
      isPublic: false,
    });
    vi.mocked(api.updateCurrentState).mockResolvedValue(updated);
    vi.mocked(api.updatePiece).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    await renderPieceDetail(undefined, onPieceUpdated);
    const input = screen.getByLabelText("Current location");
    fireEvent.change(input, { target: { value: "Studio K" } });
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: 'Create "Studio K"' }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("option", { name: 'Create "Studio K"' }));
    await waitFor(() =>
      expect(api.createGlobalEntry).toHaveBeenCalledWith(
        "location",
        "name",
        "Studio K",
      ),
    );
    await waitFor(() => expect(input).toHaveValue("Studio K"));
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() =>
      expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
        current_location: "Studio K",
      }),
    );
    await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated));
  });

  it("saves location updates when confirmed", async () => {
    const updated = makePiece({ current_location: "Studio 7" });
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([
      { id: "1", name: "Studio 7", isPublic: false },
    ]);
    vi.mocked(api.updateCurrentState).mockResolvedValue(updated);
    vi.mocked(api.updatePiece).mockResolvedValue(updated);
    const onPieceUpdated = vi.fn();
    await renderPieceDetail(undefined, onPieceUpdated);
    const input = screen.getByLabelText("Current location");
    fireEvent.change(input, { target: { value: "Studio 7" } });
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Studio 7" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("option", { name: "Studio 7" }));
    await waitFor(() => expect(input).toHaveValue("Studio 7"));
    fireEvent.click(screen.getByTestId("save-button"));
    await waitFor(() =>
      expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
        current_location: "Studio 7",
      }),
    );
    await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated));
  });

  it("renders successor state buttons for non-terminal state", async () => {
    await renderPieceDetail();
    // 'designed' has successors: wheel_thrown, handbuilt
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
    // The dialog body contains both state names (human-readable)
    expect(screen.getAllByText(/Designing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Throwing/).length).toBeGreaterThan(0);
  });

  it("cancelling confirmation closes dialog", async () => {
    await renderPieceDetail();
    fireEvent.click(screen.getByRole("button", { name: "Throwing" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    // MUI Dialog exit animation is a macro-task; use waitFor to let it complete.
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
    expect(screen.getByText("Designing")).toBeInTheDocument();
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
      // Name input starts as 'Test Bowl' and we do not change it
      fireEvent.click(screen.getByRole("button", { name: "Save name" }));
      expect(
        screen.queryByRole("textbox", { name: "Piece name" }),
      ).not.toBeInTheDocument();
      expect(api.updatePiece).not.toHaveBeenCalled();
    });
  });

  describe("tag creation", () => {
    it("shows tag chips with an edit button by default", async () => {
      await renderPieceDetail(
        makePiece({
          tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
        }),
      );

      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Edit tags" }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
    });

    it("shows the tag editor when the edit button is pressed", async () => {
      await renderPieceDetail();

      fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));

      expect(screen.getByLabelText("Tags")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save tags" }),
      ).toBeInTheDocument();
    });

    it("fetched tags are selectable in the autocomplete dropdown", async () => {
      vi.mocked(api.fetchGlobalEntries).mockResolvedValue([
        { id: "gift", name: "Gift", isPublic: false, color: "#2A9D8F" },
      ]);

      await renderPieceDetail();

      fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
      fireEvent.mouseDown(screen.getByLabelText("Tags"));
      await waitFor(() => screen.getByRole("option", { name: "Gift" }));
      fireEvent.click(screen.getByRole("option", { name: "Gift" }));

      // Draft chip appears; Save not yet called
      expect(
        screen.getByRole("button", { name: "Save tags" }),
      ).toBeInTheDocument();
      expect(api.updatePiece).not.toHaveBeenCalled();
    });

    it("does not save tag changes until Save is pressed", async () => {
      const piece = makePiece({
        tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
      });

      await renderPieceDetail(piece);

      fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));

      expect(api.updatePiece).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Save tags" }));

      await waitFor(() =>
        expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
          tags: ["gift"],
        }),
      );
    });

    it("returns to the chip list after a successful tag save", async () => {
      const piece = makePiece({
        tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
      });
      const updated = makePiece({
        tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
      });
      vi.mocked(api.updatePiece).mockResolvedValue(updated);

      await renderPieceDetail(piece);

      fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
      fireEvent.click(screen.getByRole("button", { name: "Save tags" }));

      await waitFor(() =>
        expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument(),
      );
      expect(screen.getByText("Gift")).toBeInTheDocument();
    });

    it("shows a self-closing snackbar when saving selected tags fails", async () => {
      const piece = makePiece({
        tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
      });
      vi.mocked(api.updatePiece).mockRejectedValue(new Error("Network error"));

      await renderPieceDetail(piece);

      fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
      fireEvent.click(screen.getByRole("button", { name: "Save tags" }));

      await waitFor(() =>
        expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
          tags: ["gift"],
        }),
      );
      await waitFor(() =>
        expect(
          screen.getByText(
            "Failed to attach the selected tag. Please check your connection and try again.",
          ),
        ).toBeInTheDocument(),
      );
    });
    // TODO(https://github.com/shaoster/glaze/issues/163)
    it.skip("shows a descriptive error and keeps the dialog open when the tag name already exists", async () => {
      vi.mocked(api.fetchGlobalEntries).mockResolvedValue([
        { id: "gift", name: "Gift", isPublic: false, color: "#2A9D8F" },
      ]);

      await renderPieceDetail();

      fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.change(screen.getByLabelText("Tag name"), {
        target: { value: "gift" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      expect(api.createTagEntry).not.toHaveBeenCalled();
      const dialog = screen.getByRole("dialog", { name: "Create Tag" });
      expect(dialog).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          "A tag with that name already exists. Choose the existing tag or enter a different name.",
        ),
      ).toBeInTheDocument();
    });

    // TODO(https://github.com/shaoster/glaze/issues/163)
    it.skip("adds a newly created tag to the draft selection and waits for Save to persist it", async () => {
      vi.mocked(api.createTagEntry).mockResolvedValue({
        id: "sale",
        name: "For Sale",
        color: "#4FC3F7",
      });

      await renderPieceDetail();

      fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
      fireEvent.click(screen.getByRole("button", { name: "New" }));
      fireEvent.change(screen.getByLabelText("Tag name"), {
        target: { value: "For Sale" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => {
        expect(screen.getByText("For Sale")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Save tags" }),
        ).toBeInTheDocument();
      });
      expect(api.updatePiece).not.toHaveBeenCalled();
    });
  });
});
