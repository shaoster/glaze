import { Suspense } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CircularProgress from "@mui/material/CircularProgress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ShowcasePage } from "../PublicPieceShell";
import ErrorBoundary from "../ErrorBoundary";
import * as api from "../../util/api";

vi.mock("../../util/api", () => ({
  fetchPiece: vi.fn(),
}));

vi.mock("../../../workflow.yml", () => ({
  default: {
    version: "test",
    globals: {},
    states: [
      {
        id: "state1",
        visible: true,
        friendly_name: "State 1",
        description: "Test state.",
        successors: [],
      },
    ],
  },
}));

const BASE_PIECE = {
  id: "piece-1",
  name: "Beautiful Bowl",
  showcase_story: "This is a hand-crafted bowl.",
  showcase_fields: [],
  showcase_video_url: null,
  owner_alias: null,
  thumbnail: null,
  can_edit: false,
  history: [
    {
      state: "state1",
      custom_fields: {},
    },
  ],
} as any;

function renderShell(queryClient: QueryClient, isAuthenticated = false, pieceId = "piece-1") {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/pieces/${pieceId}/showcase`]}>
        <Routes>
          <Route
            path="/pieces/:id/showcase"
            element={
              <ErrorBoundary>
                <Suspense fallback={<CircularProgress />}>
                  <ShowcasePage isAuthenticated={isAuthenticated} />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ShowcasePage", () => {
  it("renders a loading indicator while fetching", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockReturnValue(new Promise(() => {}));

    renderShell(queryClient);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders piece name and story when loaded", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue(BASE_PIECE);

    renderShell(queryClient);

    expect(await screen.findByText("Beautiful Bowl")).toBeInTheDocument();
    expect(screen.getByText("This is a hand-crafted bowl.")).toBeInTheDocument();
  });

  it("renders video element when showcase_video_url is present", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const videoUrl = "https://res.cloudinary.com/demo/video/upload/showcase.mp4";
    vi.mocked(api.fetchPiece).mockResolvedValue({
      ...BASE_PIECE,
      showcase_video_url: videoUrl,
    });

    renderShell(queryClient);

    await screen.findByText("Beautiful Bowl");
    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video?.src).toBe(videoUrl);
  });

  it("does not render video element when showcase_video_url is null", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue({
      ...BASE_PIECE,
      showcase_video_url: null,
    });

    renderShell(queryClient);

    await screen.findByText("Beautiful Bowl");
    expect(document.querySelector("video")).toBeNull();
  });

  it("shows Log in button for unauthenticated visitor", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue(BASE_PIECE);

    renderShell(queryClient, false);

    await screen.findByText("Beautiful Bowl");
    const loginBtn = screen.getByRole("link", { name: "Log in" });
    expect(loginBtn).toBeInTheDocument();
    expect(loginBtn).toHaveAttribute("href", "/?next=%2Fpieces%2Fpiece-1%2Fshowcase");
  });

  it("shows Edit button for authenticated owner", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue({
      ...BASE_PIECE,
      can_edit: true,
    });

    renderShell(queryClient, true);

    await screen.findByText("Beautiful Bowl");
    const editBtn = screen.getByRole("link", { name: "Edit" });
    expect(editBtn).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });

  it("shows owner alias context for authenticated non-owner", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue({
      ...BASE_PIECE,
      can_edit: false,
      owner_alias: "Alice",
    });

    renderShell(queryClient, true);

    await screen.findByText("Beautiful Bowl");
    expect(screen.getByText("Viewing Alice's piece")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
  });

  // Regression tests for #890

  it("does not render hero image when showcase_video_url is present", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue({
      ...BASE_PIECE,
      showcase_video_url: "https://res.cloudinary.com/demo/video/upload/showcase.mp4",
      thumbnail: { url: "https://example.com/thumb.jpg", cloud_name: "demo", cloudinary_public_id: "thumb", crop: null },
    });

    renderShell(queryClient);

    await screen.findByText("Beautiful Bowl");
    expect(document.querySelector("video")).not.toBeNull();
    expect(document.querySelector("img[alt='Beautiful Bowl']")).toBeNull();
  });

  it("does not render Process Summary section", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue(BASE_PIECE);

    renderShell(queryClient);

    await screen.findByText("Beautiful Bowl");
    expect(screen.queryByText(/process summary/i)).toBeNull();
  });

  it("renders piece name before video", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue({
      ...BASE_PIECE,
      showcase_video_url: "https://res.cloudinary.com/demo/video/upload/showcase.mp4",
    });

    renderShell(queryClient);

    await screen.findByText("Beautiful Bowl");
    const nameEl = screen.getByRole("heading", { name: "Beautiful Bowl" });
    const videoEl = document.querySelector("video")!;
    // Node.DOCUMENT_POSITION_FOLLOWING means videoEl comes after nameEl in the DOM
    expect(nameEl.compareDocumentPosition(videoEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not render PotterDoc logo for authenticated owner", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue({
      ...BASE_PIECE,
      can_edit: true,
    });

    renderShell(queryClient, true);

    await screen.findByText("Beautiful Bowl");
    expect(screen.queryByAltText("PotterDoc")).toBeNull();
  });
});
