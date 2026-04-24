import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PieceListPage from "../PieceListPage";
import type { PieceDetail, PieceSummary } from "@common/types";

const mockUseAsync = vi.fn();

vi.mock("../..//util/useAsync", () => ({
  useAsync: (...args: unknown[]) => mockUseAsync(...args),
}));

vi.mock("../../components/PieceList", () => ({
  default: ({ pieces }: { pieces: PieceSummary[] }) => (
    <div data-testid="piece-list">{pieces.map((piece) => piece.name).join(", ")}</div>
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
                additional_fields: {},
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

describe("PieceListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMatchMedia(false);
  });

  it("shows a loading spinner while pieces are loading", () => {
    mockUseAsync.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      setData: vi.fn(),
    });

    render(<PieceListPage />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error message when loading pieces fails", () => {
    mockUseAsync.mockReturnValue({
      data: null,
      loading: false,
      error: new Error("boom"),
      setData: vi.fn(),
    });

    render(<PieceListPage />);

    expect(screen.getByText("Failed to load pieces.")).toBeInTheDocument();
  });

  it("opens the dialog from the desktop button and prepends created pieces", async () => {
    const setData = vi.fn();
    mockUseAsync.mockReturnValue({
      data: [
        {
          id: "piece-1",
          name: "Existing Bowl",
          created: new Date("2024-01-01T00:00:00Z"),
          last_modified: new Date("2024-01-01T00:00:00Z"),
          thumbnail: null,
          current_state: { state: "designed" },
          current_location: null,
          tags: [],
        },
      ],
      loading: false,
      error: null,
      setData,
    });

    render(<PieceListPage />);

    await userEvent.click(screen.getByRole("button", { name: "New Piece" }));
    expect(screen.getByText("New Piece Dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Finish Create" }));

    expect(setData).toHaveBeenCalledTimes(1);
    const updateFn = setData.mock.calls[0][0] as (prev: PieceSummary[] | null) => PieceSummary[];
    expect(updateFn([{ id: "piece-1", name: "Existing Bowl" } as PieceSummary])[0].name).toBe("Fresh Mug");
    expect(updateFn([{ id: "piece-1", name: "Existing Bowl" } as PieceSummary])[1].name).toBe("Existing Bowl");
  });

  it("shows the mobile fab on small screens", () => {
    installMatchMedia(true);
    mockUseAsync.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      setData: vi.fn(),
    });

    render(<PieceListPage />);

    expect(screen.getByRole("button", { name: "New Piece" })).toBeInTheDocument();
  });
});
