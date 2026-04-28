import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlobalEntryPicker from "../GlobalEntryPicker";
import * as api from "../../util/api";
import type { GlazeCombinationEntry } from "../../util/api";

vi.mock("../../util/api", () => ({
  fetchGlobalEntriesWithFilters: vi.fn(),
  fetchGlobalEntries: vi.fn(),
  toggleGlobalEntryFavorite: vi.fn(),
}));

vi.mock("../CloudinaryImage", () => ({
  default: ({ url, alt }: { url: string; alt: string }) => (
    <img src={url} alt={alt} />
  ),
}));

function makeCombo(
  overrides: Partial<GlazeCombinationEntry> = {},
): GlazeCombinationEntry {
  return {
    id: "1",
    name: "Iron Red!Clear",
    test_tile_image: "",
    is_food_safe: true,
    runs: false,
    highlights_grooves: null,
    is_different_on_white_and_brown_clay: null,
    firing_temperature: null,
    is_public: true,
    is_favorite: false,
    glaze_types: [
      { id: "gt1", name: "Iron Red" },
      { id: "gt2", name: "Clear" },
    ],
    ...overrides,
  };
}

const defaultProps = {
  globalName: "glaze_combination",
  open: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([makeCombo()]);
  vi.mocked(api.fetchGlobalEntries).mockImplementation((globalName) => {
    if (globalName === "glaze_type") {
      return Promise.resolve([
        { id: "gt1", name: "Iron Red", isPublic: true },
        { id: "gt2", name: "Clear", isPublic: true },
      ]);
    }
    return Promise.resolve([]);
  });
  vi.mocked(api.toggleGlobalEntryFavorite).mockResolvedValue(undefined);
});

describe("GlobalEntryPicker (glaze_combination)", () => {
  describe("rendering", () => {
    it("renders the dialog title when open", async () => {
      await act(async () => {
        render(<GlobalEntryPicker {...defaultProps} />);
      });
      expect(screen.getByText("Browse Glaze Combinations")).toBeInTheDocument();
    });

    it("does not render when closed", () => {
      render(<GlobalEntryPicker {...defaultProps} open={false} />);
      expect(
        screen.queryByText("Browse Glaze Combinations"),
      ).not.toBeInTheDocument();
    });

    it("shows entry name after load", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByText("Iron Red!Clear")).toBeInTheDocument(),
      );
    });

    it("shows glaze type chips", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() => {
        expect(screen.getByText("Iron Red")).toBeInTheDocument();
        expect(screen.getByText("Clear")).toBeInTheDocument();
      });
    });

    it('shows "public" chip for public combinations', async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByText("public")).toBeInTheDocument(),
      );
    });

    it("shows empty state when no entries match", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([]);
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByText(/No entries match/)).toBeInTheDocument(),
      );
    });

    it("shows an error alert when fetchGlobalEntriesWithFilters fails", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockRejectedValue(
        new Error("Network error"),
      );
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(
          screen.getByText("Failed to load entries. Please try again."),
        ).toBeInTheDocument(),
      );
    });

    it("does not show the empty state when there is a fetch error", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockRejectedValue(
        new Error("Network error"),
      );
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(
          screen.getByText("Failed to load entries. Please try again."),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/No entries match/)).not.toBeInTheDocument();
    });
  });

  describe("selection", () => {
    it("calls onSelect with entry name when clicked", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByText("Iron Red!Clear")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByText("Iron Red!Clear"));
      expect(defaultProps.onSelect).toHaveBeenCalledWith({
        id: "1",
        name: "Iron Red!Clear",
      });
    });

    it("calls onClose after selecting", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByText("Iron Red!Clear")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByText("Iron Red!Clear"));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe("favorites", () => {
    it("renders unfavorited star for non-favorites", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByText("Iron Red!Clear")).toBeInTheDocument(),
      );
      expect(screen.getByLabelText("Add to favorites")).toBeInTheDocument();
    });

    it("renders filled star for favorites", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
        makeCombo({ is_favorite: true }),
      ]);
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(
          screen.getByLabelText("Remove from favorites"),
        ).toBeInTheDocument(),
      );
    });

    it("calls toggleGlobalEntryFavorite with correct args when favoriting", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByLabelText("Add to favorites")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByLabelText("Add to favorites"));
      await waitFor(() =>
        expect(api.toggleGlobalEntryFavorite).toHaveBeenCalledWith(
          "glaze_combination",
          "1",
          true,
        ),
      );
    });

    it("shows saved status after favoriting", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByLabelText("Add to favorites")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByLabelText("Add to favorites"));
      await waitFor(() =>
        expect(screen.getByTestId("autosave-status")).toHaveTextContent(
          "Saved",
        ),
      );
    });

    it("shows autosave status when favorite update fails", async () => {
      vi.mocked(api.toggleGlobalEntryFavorite).mockRejectedValue(
        new Error("Network error"),
      );
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByLabelText("Add to favorites")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByLabelText("Add to favorites"));
      await waitFor(() =>
        expect(screen.getByTestId("autosave-status")).toHaveTextContent(
          "Failed to update favorite. Please try again.",
        ),
      );
    });

    it("calls toggleGlobalEntryFavorite with false when unfavoriting", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
        makeCombo({ is_favorite: true }),
      ]);
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(
          screen.getByLabelText("Remove from favorites"),
        ).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByLabelText("Remove from favorites"));
      await waitFor(() =>
        expect(api.toggleGlobalEntryFavorite).toHaveBeenCalledWith(
          "glaze_combination",
          "1",
          false,
        ),
      );
    });

    it("favorite button click does not trigger selection", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByLabelText("Add to favorites")).toBeInTheDocument(),
      );
      await userEvent.click(screen.getByLabelText("Add to favorites"));
      expect(defaultProps.onSelect).not.toHaveBeenCalled();
    });
  });

  describe("Only Favorites toggle", () => {
    it("shows only favorites when toggle is on", async () => {
      const fav = makeCombo({ id: "1", name: "Fav Combo", is_favorite: true });
      const notFav = makeCombo({
        id: "2",
        name: "Other Combo",
        is_favorite: false,
      });
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([
        fav,
        notFav,
      ]);

      render(<GlobalEntryPicker {...defaultProps} />);
      await waitFor(() =>
        expect(screen.getByText("Other Combo")).toBeInTheDocument(),
      );

      await userEvent.click(screen.getByLabelText("Only favorites"));

      await waitFor(() =>
        expect(screen.getByText("Fav Combo")).toBeInTheDocument(),
      );
      expect(screen.queryByText("Other Combo")).not.toBeInTheDocument();
    });
  });

  describe("Cancel button", () => {
    it("calls onClose", async () => {
      render(<GlobalEntryPicker {...defaultProps} />);
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe("generic globalName", () => {
    it("uses a generic dialog title for non-glaze-combination globals", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([]);
      await act(async () => {
        render(<GlobalEntryPicker {...defaultProps} globalName="clay_body" />);
      });
      expect(screen.getByText("Browse Clay Bodys")).toBeInTheDocument();
    });

    it("passes globalName as param to fetchGlobalEntriesWithFilters", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([]);
      render(<GlobalEntryPicker {...defaultProps} globalName="clay_body" />);
      await waitFor(() =>
        expect(api.fetchGlobalEntriesWithFilters).toHaveBeenCalledWith(
          "clay_body",
          {},
        ),
      );
    });

    it("does not show favorites toggle for non-favoritable globals", async () => {
      vi.mocked(api.fetchGlobalEntriesWithFilters).mockResolvedValue([]);
      await act(async () => {
        render(<GlobalEntryPicker {...defaultProps} globalName="clay_body" />);
      });
      expect(screen.queryByLabelText("Only favorites")).not.toBeInTheDocument();
    });
  });
});
