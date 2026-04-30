import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TagManager from "../TagManager";
import type { PieceDetail, TagEntry } from "../../util/types";
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
      },
    ],
  },
}));

vi.mock("../../util/api", () => ({
  fetchGlobalEntries: vi.fn().mockResolvedValue([]),
  updatePiece: vi.fn(),
  createTagEntry: vi.fn(),
}));

function makePiece(overrides = {}): PieceDetail {
  const state = {
    state: "designed" as const,
    notes: "",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    images: [],
    previous_state: null,
    next_state: null,
    additional_fields: {},
  };
  return {
    id: "piece-id-1",
    name: "Test Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    thumbnail: null,
    current_state: state,
    current_location: "",
    tags: [],
    history: [state],
    ...overrides,
  };
}

function renderTagManager(
  initialTags: TagEntry[] = [],
  onSaved = vi.fn(),
) {
  return render(
    <TagManager pieceId="piece-id-1" initialTags={initialTags} onSaved={onSaved} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
});

describe("TagManager", () => {
  it("shows tag chips with an edit button by default", async () => {
    await act(async () => {
      renderTagManager([{ id: "gift", name: "Gift", color: "#2A9D8F" }]);
    });
    expect(screen.getByText("Gift")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add or edit tags" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
  });

  it("does not fetch tags until editing starts", async () => {
    await act(async () => {
      renderTagManager([]);
    });
    expect(api.fetchGlobalEntries).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add or edit tags" }));

    await waitFor(() =>
      expect(api.fetchGlobalEntries).toHaveBeenCalledWith("tag"),
    );
    expect(api.fetchGlobalEntries).toHaveBeenCalledTimes(1);
  });

  it("shows the tag editor when the edit button is pressed", async () => {
    await act(async () => {
      renderTagManager();
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Add or edit tags" }),
    );
    expect(screen.getByLabelText("Tags")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("option", { name: "+ New tag" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save tags" })).toBeInTheDocument();
  });

  it("fetched tags are selectable in the autocomplete dropdown", async () => {
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([
      { id: "gift", name: "Gift", isPublic: false, color: "#2A9D8F" },
    ]);
    await act(async () => {
      renderTagManager();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add or edit tags" }));
    fireEvent.mouseDown(screen.getByLabelText("Tags"));
    await waitFor(() => screen.getByRole("option", { name: "Gift" }));
    fireEvent.click(screen.getByRole("option", { name: "Gift" }));
    expect(screen.getByRole("button", { name: "Save tags" })).toBeInTheDocument();
    expect(api.updatePiece).not.toHaveBeenCalled();
  });

  it("does not save tag changes until Save is pressed", async () => {
    await act(async () => {
      renderTagManager([{ id: "gift", name: "Gift", color: "#2A9D8F" }]);
    });
    fireEvent.click(screen.getByRole("button", { name: "Add or edit tags" }));
    expect(api.updatePiece).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
    await waitFor(() =>
      expect(api.updatePiece).toHaveBeenCalledWith("piece-id-1", {
        tags: ["gift"],
      }),
    );
  });

  it("returns to the chip list after a successful tag save", async () => {
    vi.mocked(api.updatePiece).mockResolvedValue(makePiece({
      tags: [{ id: "gift", name: "Gift", color: "#2A9D8F" }],
    }));
    await act(async () => {
      renderTagManager([{ id: "gift", name: "Gift", color: "#2A9D8F" }]);
    });
    fireEvent.click(screen.getByRole("button", { name: "Add or edit tags" }));
    fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Gift")).toBeInTheDocument();
  });

  it("shows a self-closing snackbar when saving selected tags fails", async () => {
    vi.mocked(api.updatePiece).mockRejectedValue(new Error("Network error"));
    await act(async () => {
      renderTagManager([{ id: "gift", name: "Gift", color: "#2A9D8F" }]);
    });
    fireEvent.click(screen.getByRole("button", { name: "Add or edit tags" }));
    fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Failed to attach the selected tag. Please check your connection and try again.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("shows a descriptive error and keeps the dialog open when the tag name already exists", async () => {
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([
      { id: "gift", name: "Gift", isPublic: false, color: "#2A9D8F" },
    ]);
    await act(async () => {
      renderTagManager();
    });
    // Wait for tags to load
    await userEvent.click(
      screen.getByRole("button", { name: "Add or edit tags" }),
    );
    await waitFor(() => expect(api.fetchGlobalEntries).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("option", { name: "+ New tag" }));

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

  it("shows an inline error when trying to create an empty tag", async () => {
    await act(async () => {
      renderTagManager();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Add or edit tags" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("option", { name: "+ New tag" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(api.createTagEntry).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tag name cannot be empty."),
    ).toBeInTheDocument();
  });

  it("adds a newly created tag to the draft selection and waits for Save to persist it", async () => {
    vi.mocked(api.createTagEntry).mockResolvedValue({
      id: "sale",
      name: "For Sale",
      color: "#4FC3F7",
    });
    await act(async () => {
      renderTagManager();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Add or edit tags" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("option", { name: "+ New tag" }));

    fireEvent.change(screen.getByLabelText("Tag name"), {
      target: { value: "For Sale" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Create Tag" })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("For Sale")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Save tags" })).toBeInTheDocument();
    expect(api.updatePiece).not.toHaveBeenCalled();
  });

  it("shows a generic error when creating a tag fails", async () => {
    vi.mocked(api.createTagEntry).mockRejectedValue(new Error("Network error"));
    await act(async () => {
      renderTagManager();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Add or edit tags" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("option", { name: "+ New tag" }));
    fireEvent.change(screen.getByLabelText("Tag name"), {
      target: { value: "For Sale" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(
      screen.getByText("Failed to create tag. Please try again."),
    ).toBeInTheDocument();
  });

  it("closes the create tag dialog when Cancel is pressed", async () => {
    await act(async () => {
      renderTagManager();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Add or edit tags" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    await userEvent.click(screen.getByRole("option", { name: "+ New tag" }));
    await userEvent.click(
      within(screen.getByRole("dialog", { name: "Create Tag" })).getByRole(
        "button",
        { name: "Cancel" },
      ),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Create Tag" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("closes the attach-failure snackbar when dismissed", async () => {
    vi.mocked(api.updatePiece).mockRejectedValue(new Error("Network error"));

    await act(async () => {
      renderTagManager([{ id: "gift", name: "Gift", color: "#2A9D8F" }]);
    });

    fireEvent.click(screen.getByRole("button", { name: "Add or edit tags" }));
    fireEvent.click(screen.getByRole("button", { name: "Save tags" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Failed to attach the selected tag. Please check your connection and try again.",
        ),
      ).toBeInTheDocument(),
    );

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByText(
          "Failed to attach the selected tag. Please check your connection and try again.",
        ),
      ).not.toBeInTheDocument(),
    );
  });
});
