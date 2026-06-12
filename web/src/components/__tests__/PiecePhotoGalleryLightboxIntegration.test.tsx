/**
 * Integration test: PiecePhotoGallery with real ImageLightbox (not mocked).
 * Verifies that clicking the lightbox backdrop closes the lightbox even when
 * the gallery Dialog is simultaneously open (atPhotos && atLightbox).
 */
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";

// CropOverlay preloads images; stub Image so imageLoading resolves immediately in tests.
Object.defineProperty(globalThis, "Image", {
  value: class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) { this.onload?.(); }
  },
  writable: true,
});

vi.mock("../AppImage", () => ({
  default: ({ alt, url }: { alt?: string; url: string }) => (
    <img alt={alt} src={url} />
  ),
  SuspenseAppImage: ({ alt, url }: { alt?: string; url: string }) => (
    <img alt={alt} src={url} />
  ),
}));

vi.mock("masonic", () => ({
  Masonry: ({
    items,
    render: Row,
  }: {
    items: unknown[];
    render: React.ComponentType<{ data: unknown; index: number; width: number }>;
  }) => (
    <div data-testid="masonry-grid">
      {items.map((item, i) => (
        <Row key={i} data={item} index={i} width={300} />
      ))}
    </div>
  ),
}));

import PiecePhotoGallery, {
  type PiecePhotoGalleryImage,
} from "../PiecePhotoGallery";

function makeImages(): PiecePhotoGalleryImage[] {
  return [
    {
      url: "https://example.com/a.jpg",
      caption: "Photo A",
      created: new Date("2024-01-15T10:00:00Z"),
      image_id: "img-a",
      stateLabel: "Throwing",
      stateId: "state-1",
      editableCurrentStateIndex: 0,
    },
    {
      url: "https://example.com/b.jpg",
      caption: "Photo B",
      created: new Date("2024-01-16T10:00:00Z"),
      image_id: "img-b",
      stateLabel: "Throwing",
      stateId: "state-1",
      editableCurrentStateIndex: 1,
    },
  ];
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/pieces/:id/*",
        element: <PiecePhotoGallery images={makeImages()} pieceId="piece-1" currentStateNotes="" />,
      },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe("PiecePhotoGallery + real ImageLightbox integration", () => {
  it("lightbox backdrop closes lightbox when started directly at lightbox URL (Dialog also open)", async () => {
    // atPhotos=true AND atLightbox=true simultaneously
    renderAt("/pieces/piece-1/photos/0");

    const backdrop = screen.getByTestId("lightbox-backdrop");
    expect(backdrop).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(backdrop);
    });

    expect(screen.queryByTestId("lightbox-backdrop")).not.toBeInTheDocument();
  });

  it("lightbox backdrop closes lightbox after navigating from gallery grid to lightbox", async () => {
    // Simulate the real user flow: gallery grid → click image → lightbox → click backdrop → gallery
    renderAt("/pieces/piece-1/photos");

    // Gallery grid Dialog is open; click the first image to open the lightbox
    await waitFor(() => screen.getByRole("button", { name: "Open piece photo 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Open piece photo 1" }));

    // Lightbox should now be open
    await waitFor(() => expect(screen.getByTestId("lightbox-backdrop")).toBeInTheDocument());

    // Click the lightbox backdrop to close
    fireEvent.click(screen.getByTestId("lightbox-backdrop"));

    // Lightbox should close; gallery Dialog should be back (gallery grid visible)
    await waitFor(() => expect(screen.queryByTestId("lightbox-backdrop")).not.toBeInTheDocument());
    expect(screen.getByTestId("masonry-grid")).toBeInTheDocument();
  });

  it("clicking the swipe area outside the image closes the lightbox", async () => {
    // The swipe area may cover letter-boxed space around the image (especially on mobile).
    // Clicking that space should close the lightbox — only the image translate Box itself
    // stops propagation.
    renderAt("/pieces/piece-1/photos/0");

    await waitFor(() => screen.getByTestId("lightbox-backdrop"));
    fireEvent.click(screen.getByTestId("lightbox-swipe-area"));

    expect(screen.queryByTestId("lightbox-backdrop")).not.toBeInTheDocument();
  });
});
