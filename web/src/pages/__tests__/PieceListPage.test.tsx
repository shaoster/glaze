import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import PieceListPage from "../PieceListPage";
import type { PieceDetail, PieceSummary } from "../../util/types";
import type { PieceSortOrder } from "../../util/api";

const mockFetchPieces = vi.fn();

vi.mock("../../util/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../util/api")>();
  return {
    ...actual,
    fetchPieces: (...args: unknown[]) => mockFetchPieces(...args),
  };
});

vi.mock("../../components/PieceList", () => ({
  default: ({
    pieces,
    onNewPiece,
    onSortChange,
    onLoadMore,
    loading = false,
  }: {
    pieces: PieceSummary[];
    onNewPiece?: () => void;
    onSortChange?: (order: PieceSortOrder) => void;
    onLoadMore?: () => void;
    loading?: boolean;
  }) => (
    <div data-testid="piece-list">
      {onNewPiece && <button onClick={onNewPiece}>New Piece</button>}
      {onSortChange && (
        <button onClick={() => onSortChange("name")}>Sort by Name</button>
      )}
      {onLoadMore && <button onClick={onLoadMore}>Load More</button>}
      {loading && <div>Refreshing Pieces</div>}
      {pieces.map((piece) => piece.name).join(", ")}
    </div>
  ),
}));

vi.mock("../../components/NewPieceDialog", () => ({
  default: ({
    open,
    onClose,
    onCreated,
  }: {
    open: boolean;
    onClose: () => void;
    onCreated: (piece: PieceDetail) => void;
  }) =>
    open ? (
      <div>
        <div>New Piece Dialog</div>
        <button onClick={onClose}>Close Dialog</button>
        <button
          onClick={() =>
            onCreated({
              id: "new-piece",
              name: "Fresh Mug",
              created: new Date("2024-01-01T00:00:00Z"),
              last_modified: new Date("2024-01-01T00:00:00Z"),
              thumbnail: null,
              current_location: null,
              current_state: {
                state: "designed",
                notes: "",
                created: new Date("2024-01-01T00:00:00Z"),
                last_modified: new Date("2024-01-01T00:00:00Z"),
                images: [],
                custom_fields: {},
                previous_state: null,
                next_state: null,
              },
              history: [],
              tags: [],
            } as unknown as PieceDetail)
          }
        >
          Finish Create
        </button>
      </div>
    ) : null,
}));

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const EXISTING_PIECE: PieceSummary = {
  id: "piece-1",
  name: "Existing Bowl",
  created: new Date("2024-01-01T00:00:00Z"),
  last_modified: new Date("2024-01-01T00:00:00Z"),
  thumbnail: null,
  current_state: { state: "designed" } as PieceSummary["current_state"],
  current_location: null,
  tags: [],
  shared: false,
  is_editable: false,
  can_edit: true,
  showcase_story: "",
  showcase_fields: [],
};

describe("PieceListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMatchMedia(false);
  });

  it("shows a loading spinner while pieces are loading", () => {
    mockFetchPieces.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><PieceListPage /></MemoryRouter>);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error message when loading pieces fails", async () => {
    mockFetchPieces.mockRejectedValue(new Error("boom"));
    render(<MemoryRouter><PieceListPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText("Failed to load pieces.")).toBeInTheDocument();
    });
  });

  it("renders pieces after successful load", async () => {
    mockFetchPieces.mockResolvedValue({ count: 1, results: [EXISTING_PIECE] });
    render(<MemoryRouter><PieceListPage /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText("Existing Bowl")).toBeInTheDocument();
    });
  });

  it("opens the dialog from the desktop button and prepends created pieces", async () => {
    mockFetchPieces.mockResolvedValue({ count: 1, results: [EXISTING_PIECE] });
    render(<MemoryRouter><PieceListPage /></MemoryRouter>);

    await waitFor(() => screen.getByText("Existing Bowl"));

    await userEvent.click(screen.getByRole("button", { name: "New Piece" }));
    expect(screen.getByText("New Piece Dialog")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Finish Create" }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("piece-list").textContent).toContain("Fresh Mug");
    });
    expect(screen.getByTestId("piece-list").textContent).toContain("Existing Bowl");
  });

  it("shows the mobile fab on small screens", async () => {
    installMatchMedia(true);
    mockFetchPieces.mockResolvedValue({ count: 0, results: [] });
    render(<MemoryRouter><PieceListPage /></MemoryRouter>);

    await waitFor(() => screen.getByTestId("piece-list"));

    const newPieceButtons = screen.getAllByRole("button", { name: "New Piece" });
    expect(newPieceButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("re-fetches with new sort order when sort changes", async () => {
    mockFetchPieces.mockResolvedValue({ count: 1, results: [EXISTING_PIECE] });
    render(<MemoryRouter><PieceListPage /></MemoryRouter>);

    await waitFor(() => screen.getByTestId("piece-list"));

    mockFetchPieces.mockResolvedValue({ count: 0, results: [] });
    await userEvent.click(screen.getByRole("button", { name: "Sort by Name" }));

    await waitFor(() => {
      expect(mockFetchPieces).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: "name" }),
      );
    });
  });

  it("keeps the current list mounted while refreshing a new sort order", async () => {
    let resolveSortedPage: ((value: { count: number; results: PieceSummary[] }) => void) | null =
      null;

    mockFetchPieces
      .mockResolvedValueOnce({ count: 1, results: [EXISTING_PIECE] })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSortedPage = resolve;
          }),
      );

    render(<MemoryRouter><PieceListPage /></MemoryRouter>);

    await waitFor(() => screen.getByText("Existing Bowl"));
    await userEvent.click(screen.getByRole("button", { name: "Sort by Name" }));

    expect(screen.getByTestId("piece-list")).toBeInTheDocument();
    expect(screen.getByText("Existing Bowl")).toBeInTheDocument();
    expect(screen.getByText("Refreshing Pieces")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

    resolveSortedPage?.({
      count: 1,
      results: [{ ...EXISTING_PIECE, name: "Alphabetized Bowl" }],
    });

    await waitFor(() => {
      expect(screen.getByText("Alphabetized Bowl")).toBeInTheDocument();
    });
  });

  it("loads more pieces on scroll trigger", async () => {
    const firstPage = Array.from({ length: 3 }, (_, i) => ({
      ...EXISTING_PIECE,
      id: `piece-${i}`,
      name: `Piece ${i}`,
    }));
    mockFetchPieces.mockResolvedValueOnce({ count: 6, results: firstPage });
    render(<MemoryRouter><PieceListPage /></MemoryRouter>);

    await waitFor(() => screen.getByTestId("piece-list"));

    const secondPage = Array.from({ length: 3 }, (_, i) => ({
      ...EXISTING_PIECE,
      id: `piece-${i + 3}`,
      name: `Piece ${i + 3}`,
    }));
    mockFetchPieces.mockResolvedValueOnce({ count: 6, results: secondPage });

    await userEvent.click(screen.getByRole("button", { name: "Load More" }));

    await waitFor(() => {
      expect(mockFetchPieces).toHaveBeenCalledWith(
        expect.objectContaining({ offset: 3 }),
      );
    });
  });
});
