import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PieceDetailPage from "../PieceDetailPage";
import * as api from "../../util/api";
import type { PieceDetail } from "../../util/types";

vi.mock("../../util/api", () => ({
  fetchPiece: vi.fn(),
}));

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
  shared: false,
  can_edit: true,
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
} as unknown as PieceDetail;

function renderPage({
  fromGallery = false,
  id = "piece-1",
  showBackToPieces,
}: {
  fromGallery?: boolean;
  id?: string;
  showBackToPieces?: boolean;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/pieces/:id",
        element: <PieceDetailPage showBackToPieces={showBackToPieces} />,
      },
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
  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )};
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

  it("hides Back to Pieces when disabled for public views", async () => {
    renderPage({ showBackToPieces: false });

    await waitFor(() =>
      expect(screen.getByTestId("piece-detail-component")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Back to Pieces/i }),
    ).not.toBeInTheDocument();
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

    await waitFor(() =>
      expect(api.fetchPiece).toHaveBeenCalledWith("piece-42"),
    );
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

  it("invalidates appInit when loading fails so an expired session triggers re-login", async () => {
    // Regression test for #807: PieceDetailPage always renders inside AuthenticatedApp
    // so currentUser is non-null even after iOS Safari silently drops the session cookie.
    // On error we invalidate appInit; if the session is gone, appInit refetches as
    // user: null and the app switches to UnauthenticatedApp (login screen).
    vi.mocked(api.fetchPiece).mockRejectedValue(new Error("Not Found"));

    const { queryClient } = renderPage();
    vi.spyOn(queryClient, "invalidateQueries");

    await waitFor(() =>
      expect(screen.getByText("Failed to load piece.")).toBeInTheDocument(),
    );

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["appInit"] }),
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

  it("returns to the originating pieces list state even if preferences are in history", async () => {
    function PiecesPage() {
      const location = useLocation();
      return <div data-testid="pieces-page">pieces{location.search}</div>;
    }

    const router = createMemoryRouter(
      [
        {
          path: "/pieces/:id",
          element: <PieceDetailPage showBackToPieces />,
        },
        { path: "/", element: <PiecesPage /> },
        {
          path: "/preferences/:sectionId",
          element: <div data-testid="prefs-page" />,
        },
      ],
      {
        initialEntries: [
          { pathname: "/", search: "?sort=created&filter=wip" },
          {
            pathname: "/preferences/process-summary",
          },
          {
            pathname: "/pieces/piece-1",
            state: {
              returnTo: {
                pathname: "/",
                search: "?sort=created&filter=wip",
                hash: "",
              },
            },
          },
        ],
        initialIndex: 2,
      },
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Back to Pieces/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("pieces-page")).toHaveTextContent(
        "pieces?sort=created&filter=wip",
      );
    });
    expect(screen.queryByTestId("prefs-page")).not.toBeInTheDocument();
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
