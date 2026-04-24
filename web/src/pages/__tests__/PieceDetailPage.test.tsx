import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PieceDetailPage from "../PieceDetailPage";
import * as api from "@common/api";
import type { PieceDetail } from "@common/types";

vi.mock("@common/api", async (importOriginal) => {
  const actual = await importOriginal<typeof api>();
  return {
    ...actual,
    fetchPiece: vi.fn(),
  };
});

vi.mock("../../components/PieceDetail", () => ({
  default: ({ piece }: { piece: PieceDetail }) => (
    <div data-testid="piece-detail-component">{piece.name}</div>
  ),
}));

const MOCK_PIECE: PieceDetail = {
  id: "piece-1",
  name: "Tall Mug",
  created: new Date("2024-01-01T00:00:00Z"),
  last_modified: new Date("2024-01-02T00:00:00Z"),
  thumbnail: "/thumbnails/question-mark.svg",
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
} as unknown as PieceDetail;

function renderPage({
  fromGallery = false,
  id = "piece-1",
}: { fromGallery?: boolean; id?: string } = {}) {
  const router = createMemoryRouter(
    [
      { path: "/pieces/:id", element: <PieceDetailPage /> },
      { path: "/", element: <div data-testid="pieces-page" /> },
      { path: "/analyze", element: <div data-testid="analyze-page" /> },
    ],
    {
      initialEntries: [
        {
          pathname: `/pieces/${id}`,
          state: fromGallery ? { fromGallery: true } : null,
        },
      ],
    },
  );
  return render(<RouterProvider router={router} />);
}

describe("PieceDetailPage", () => {
  beforeEach(() => {
    vi.mocked(api.fetchPiece).mockResolvedValue(MOCK_PIECE);
  });

  it("shows Back to Pieces button by default", async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Back to Pieces/i }),
      ).toBeInTheDocument(),
    );
  });

  it("shows Back to Gallery button when navigated from gallery", async () => {
    renderPage({ fromGallery: true });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Back to Gallery/i }),
      ).toBeInTheDocument(),
    );
  });

  it("fetches the piece using the route id", async () => {
    renderPage({ id: "piece-42" });

    await waitFor(() => expect(api.fetchPiece).toHaveBeenCalledWith("piece-42"));
  });

  it("renders the piece detail component after the piece loads", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("piece-detail-component")).toHaveTextContent(
        "Tall Mug",
      ),
    );
  });

  it("shows a loading spinner while the piece is loading", () => {
    vi.mocked(api.fetchPiece).mockImplementation(
      () => new Promise(() => undefined),
    );

    renderPage();

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    vi.mocked(api.fetchPiece).mockRejectedValue(new Error("Network error"));

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Failed to load piece.")).toBeInTheDocument(),
    );
  });

  it("navigates back to the pieces list by default", async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: /Back to Pieces/i }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("pieces-page")).toBeInTheDocument(),
    );
  });

  it("navigates back to the analyze page when opened from the gallery", async () => {
    renderPage({ fromGallery: true });

    await userEvent.click(
      await screen.findByRole("button", { name: /Back to Gallery/i }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("analyze-page")).toBeInTheDocument(),
    );
  });
});
