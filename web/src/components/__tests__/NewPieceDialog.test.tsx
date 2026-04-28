import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewPieceDialog from "../NewPieceDialog";
import { CURATED_THUMBNAILS } from "../thumbnailConstants";
import * as api from "../../util/api";
import type { PieceDetail } from "../../util/types";

vi.mock("../../util/api", () => ({
  createPiece: vi.fn(),
  fetchGlobalEntries: vi.fn().mockResolvedValue([]),
  fetchGlobalEntriesWithFilters: vi.fn().mockResolvedValue([]),
  createGlobalEntry: vi.fn(),
  toggleGlobalEntryFavorite: vi.fn().mockResolvedValue(undefined),
}));

function makePieceDetail(): PieceDetail {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Test Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-01-15T10:00:00Z"),
    thumbnail: null,
    current_location: null,
    current_state: {
      state: "designed",
      notes: "",
      created: new Date("2024-01-15T10:00:00Z"),
      last_modified: new Date("2024-01-15T10:00:00Z"),
      images: [],
      additional_fields: {},
      previous_state: null,
      next_state: null,
    },
    tags: [],
    history: [],
  };
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onCreated: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGlobalEntries).mockResolvedValue([]);
  vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([]);
});

describe("NewPieceDialog", () => {
  describe("rendering", () => {
    it("renders the dialog title", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      expect(screen.getByText("New Piece")).toBeInTheDocument();
    });

    it("renders the name field as required", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      expect(screen.getByTestId("name-input")).toBeInTheDocument();
    });

    it("renders the notes field", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      expect(screen.getByTestId("notes-input")).toBeInTheDocument();
    });

    it("lets you create a new location option", async () => {
      vi.mocked(api.createGlobalEntry).mockResolvedValue({
        id: "new-id",
        name: "Studio K",
        isPublic: false,
      });
      render(<NewPieceDialog {...defaultProps} />);
      await userEvent.click(
        screen.getByRole("button", { name: "Browse Location" }),
      );
      await userEvent.click(screen.getByRole("tab", { name: "Create" }));
      await userEvent.type(
        screen.getByRole("textbox", { name: "Location" }),
        "Studio K",
      );
      await userEvent.click(screen.getByRole("button", { name: "Create Location" }));
      await waitFor(() =>
        expect(api.createGlobalEntry).toHaveBeenCalledWith(
          "location",
          { field: "name", value: "Studio K" },
        ),
      );
      await waitFor(() => expect(screen.getByText("Studio K")).toBeInTheDocument());
    });

    it("renders the location field", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      expect(screen.getByText("Location")).toBeInTheDocument();
    });

    it("fetches location browse entries when the picker opens", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      await userEvent.click(
        screen.getByRole("button", { name: "Browse Location" }),
      );
      await waitFor(() =>
        expect(api.fetchGlobalEntriesWithFilters).toHaveBeenCalledWith(
          "location",
          {},
        ),
      );
    });

    it("shows curated thumbnail images by default", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      const images = screen.getAllByRole("img");
      expect(images.length).toBe(CURATED_THUMBNAILS.length);
    });
  });

  describe("save button", () => {
    it("is disabled when name is empty", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      expect(screen.getByTestId("save-button")).toBeDisabled();
    });

    it("is enabled when name has a value", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "My Bowl" },
      });
      expect(screen.getByTestId("save-button")).not.toBeDisabled();
    });

    it("remains disabled if name is only whitespace", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "   " },
      });
      expect(screen.getByTestId("save-button")).toBeDisabled();
    });
  });

  describe("notes field", () => {
    it("shows character count", async () => {
      await act(async () => {
        render(<NewPieceDialog {...defaultProps} />);
      });
      expect(screen.getByText("0 / 300")).toBeInTheDocument();
    });
  });

  describe("cancel / close behavior", () => {
    it("calls onClose immediately when no changes have been made", async () => {
      render(<NewPieceDialog {...defaultProps} />);
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(defaultProps.onClose).toHaveBeenCalledOnce();
    });

    it("shows discard confirmation when dialog is dirty and closed", async () => {
      render(<NewPieceDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "Draft" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByText("Discard new piece?")).toBeInTheDocument();
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });

    it("keeps dialog open when user clicks Keep editing in confirmation", async () => {
      render(<NewPieceDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "Draft" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(
        screen.getByRole("button", { name: "Keep editing" }),
      );
      expect(defaultProps.onClose).not.toHaveBeenCalled();
      expect(screen.getByText("New Piece")).toBeInTheDocument();
    });

    it("calls onClose after confirming discard", async () => {
      render(<NewPieceDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "Draft" },
      });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await userEvent.click(screen.getByTestId("discard-button"));
      expect(defaultProps.onClose).toHaveBeenCalledOnce();
    });
  });

  describe("successful save", () => {
    it("calls createPiece with name and notes", async () => {
      const piece = makePieceDetail();
      vi.mocked(api.createPiece).mockResolvedValue(piece);

      render(<NewPieceDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "My Mug" },
      });
      fireEvent.change(screen.getByTestId("notes-input"), {
        target: { value: "Wide handle" },
      });
      await userEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => {
        expect(api.createPiece).toHaveBeenCalledWith(
          expect.objectContaining({ name: "My Mug", notes: "Wide handle" }),
        );
      });
    });

    it("calls onCreated with the returned piece", async () => {
      const piece = makePieceDetail();
      vi.mocked(api.createPiece).mockResolvedValue(piece);

      render(<NewPieceDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "Bowl" },
      });
      await userEvent.click(screen.getByTestId("save-button"));

      await waitFor(() => {
        expect(defaultProps.onCreated).toHaveBeenCalledWith(piece);
      });
    });

    it("trims the name before saving", async () => {
      vi.mocked(api.createPiece).mockResolvedValue(makePieceDetail());
      render(<NewPieceDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "  Trimmed  " },
      });
      await userEvent.click(screen.getByTestId("save-button"));
      await waitFor(() => {
        expect(api.createPiece).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Trimmed" }),
        );
      });
    });

    it("sends location when provided", async () => {
      vi.mocked(api.createPiece).mockResolvedValue(makePieceDetail());
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
        { id: "1", name: "Studio 7", isPublic: false },
      ]);
      render(<NewPieceDialog {...defaultProps} />);
      await userEvent.click(
        screen.getByRole("button", { name: "Browse Location" }),
      );
      await waitFor(() =>
        expect(screen.getByText("Studio 7")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByText("Studio 7"));
      await waitFor(() => expect(screen.getByText("Studio 7")).toBeInTheDocument());
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "Bowl" },
      });
      await userEvent.click(screen.getByTestId("save-button"));
      await waitFor(() => {
        expect(api.createPiece).toHaveBeenCalledWith(
          expect.objectContaining({ current_location: "Studio 7" }),
        );
      });
    });

    it("sends selected curated thumbnail", async () => {
      vi.mocked(api.createPiece).mockResolvedValue(makePieceDetail());
      render(<NewPieceDialog {...defaultProps} />);
      fireEvent.change(screen.getByTestId("name-input"), {
        target: { value: "Bowl" },
      });
      const images = screen.getAllByRole("img");
      fireEvent.click(images[0]);
      await userEvent.click(screen.getByTestId("save-button"));
      await waitFor(() => {
        expect(api.createPiece).toHaveBeenCalledWith(
          expect.objectContaining({ thumbnail: CURATED_THUMBNAILS[0] }),
        );
      });
    });
  });
});
