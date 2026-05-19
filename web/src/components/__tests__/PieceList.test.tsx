import type React from "react";
import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PieceList from "../PieceList";
import { CARD_CHROME_HEIGHT, DEFAULT_CARD_HEIGHT_ESTIMATE, DEFAULT_THUMBNAIL_ASPECT_HEIGHT, DEFAULT_THUMBNAIL_ASPECT_WIDTH, estimateCardHeight, getThumbnailRequestedHeight } from "../pieceCardHeight";
import type { PieceSummary } from "../../util/types";

vi.mock("../CloudinaryImage", () => ({
  default: ({
    crop,
    requestedHeight,
    requestedWidth,
    url,
    alt,
  }: {
    crop?: unknown;
    requestedHeight?: number;
    requestedWidth?: number;
    url: string;
    alt?: string;
  }) => (
    <img
      src={url}
      alt={alt ?? ""}
      data-crop={crop ? "yes" : "no"}
      data-requested-height={requestedHeight}
      data-requested-width={requestedWidth}
    />
  ),
}));

const { mockPositioner, mockContainerPosition } = vi.hoisted(() => {
  const mockContainerPosition = { width: 440, offset: 0 };
  return {
    mockPositioner: {
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
      columnWidth: 220,
      columnCount: 2,
      update: vi.fn(),
      range: vi.fn(),
      size: vi.fn().mockReturnValue(0),
      estimateHeight: vi.fn().mockReturnValue(0),
      shortestColumn: vi.fn().mockReturnValue(0),
      all: vi.fn().mockReturnValue([]),
    },
    mockContainerPosition,
  };
});

let rerenderMasonryScroller: (() => void) | undefined;

vi.mock("masonic", () => ({
  MasonryScroller: ({
    items,
    render: RenderComponent,
    itemHeightEstimate,
    itemKey,
  }: {
    items: PieceSummary[];
    render: React.ComponentType<{ data: PieceSummary; index: number; width: number }>;
    itemHeightEstimate: number;
    itemKey?: (item: PieceSummary, index: number) => string | number;
  }) => {
    const [, forceRender] = useState(0);
    rerenderMasonryScroller = () => forceRender((value) => value + 1);

    return (
      <div data-testid="piece-grid" style={{ position: "relative" }}>
        {(() => {
          const gutter = 8;
          const columnCount = mockPositioner.columnCount;
          const columnWidth = mockPositioner.columnWidth;
          const columnHeights = Array.from({ length: columnCount }, () => 0);
          const seededHeights = new Map<number, number>([
            ...mockPositioner.set.mock.calls.map(([index, height]) => [
              index as number,
              height as number,
            ]),
            ...mockPositioner.update.mock.calls.flatMap(([updates]) =>
              updates.flatMap((value, position) =>
                position % 2 === 0
                  ? [[value as number, updates[position + 1] as number]]
                  : [],
              ),
            ),
          ]);

          return items.map((item, index) => {
            const height = seededHeights.get(index) ?? itemHeightEstimate;
            const column = columnHeights.indexOf(Math.min(...columnHeights));
            const top = columnHeights[column];
            const left = column * (columnWidth + gutter);
            columnHeights[column] = top + height + gutter;

            return (
              <div
                key={itemKey ? itemKey(item, index) : index}
                data-key={itemKey ? itemKey(item, index) : index}
                data-column={column}
                data-top={top}
                data-height={height}
                style={{
                  position: "absolute",
                  top,
                  left,
                  width: columnWidth,
                }}
              >
                <RenderComponent data={item} index={index} width={240} />
              </div>
            );
          });
        })()}
      </div>
    );
    },
  useContainerPosition: () => ({ width: mockContainerPosition.width, offset: mockContainerPosition.offset }),
  usePositioner: () => mockPositioner,
  useResizeObserver: () => undefined,
}));

function makePiece(overrides: Partial<PieceSummary> = {}): PieceSummary {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Clay Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-02-20T12:00:00Z"),
    thumbnail: {
      url: "https://example.com/bowl.jpg",
      cloudinary_public_id: null,
      cloud_name: null,
    },
    current_location: null,
    current_state: { state: "designed" } as any,
    tags: [],
    shared: false,
    is_editable: false,
    can_edit: true,
    ...overrides,
  };
}

function renderPieceList(pieces: PieceSummary[]) {
  const router = createMemoryRouter(
    [{ path: "/", element: <PieceList pieces={pieces} /> }],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

// Open the condensed filter panel
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /toggle filters/i }));
}

function RerenderHarness({ pieces }: { pieces: PieceSummary[] }) {
  const [tick, setTick] = useState(0);

  return (
    <>
      <button type="button" onClick={() => setTick((value) => value + 1)}>
        rerender
      </button>
      <PieceList pieces={pieces} />
      <span data-testid="tick">{tick}</span>
    </>
  );
}

describe("PieceList", () => {
  beforeEach(() => {
    mockPositioner.set.mockReset();
    mockPositioner.get.mockReset();
    mockPositioner.update.mockReset();
    mockPositioner.set.mockImplementation(() => undefined);
    mockPositioner.get.mockImplementation(() => undefined);
    mockPositioner.update.mockImplementation(() => {
      rerenderMasonryScroller?.();
      return undefined;
    });
    rerenderMasonryScroller = undefined;
    mockContainerPosition.width = 440;
    mockContainerPosition.offset = 0;
  });

  describe("MasonryScroller container-width guard", () => {
    it("does not render the masonry grid when container width is zero", () => {
      // Root cause of the prod-only initial-overlap bug: useContainerPosition
      // returns width=0 on the first React commit. If MasonryScroller renders
      // then, masonic lays out Phase-1 items at columnWidth=0, the thumbnail
      // shell collapses, and offsetHeight measurements are chrome-only (~112 px).
      // Those heights are copied into the next positioner when the real width
      // arrives, causing items to be placed too close and overlap.
      mockContainerPosition.width = 0;
      renderPieceList([makePiece()]);
      expect(screen.queryByTestId("piece-grid")).not.toBeInTheDocument();
    });

    it("renders the masonry grid when container width is exactly 1 (boundary)", () => {
      // Verifies the guard is `> 0` not `>= some threshold`. A wrong condition
      // like `> 1` would let width=0 contaminate the positioner for narrow
      // containers.
      mockContainerPosition.width = 1;
      renderPieceList([makePiece()]);
      expect(screen.getByTestId("piece-grid")).toBeInTheDocument();
    });
  });

  describe("masonry height pre-seeding", () => {
    it("pre-seeds the positioner with crop-derived height for pieces with a crop", () => {
      // 200×400 crop at columnWidth 220 → image height = 220*400/200 = 440 → + CARD_CHROME_HEIGHT
      const piece = makePiece({
        thumbnail: {
          url: "https://example.com/img.jpg",
          cloudinary_public_id: "id",
          cloud_name: "demo",
          crop: { x: 0, y: 0, width: 200, height: 400 },
        },
      });
      renderPieceList([piece]);
      expect(mockPositioner.update).toHaveBeenCalledWith([
        0,
        Math.round(220 * 400 / 200) + CARD_CHROME_HEIGHT,
      ]);
    });

    it("does not pre-seed the positioner for pieces without a crop", () => {
      const piece = makePiece({ thumbnail: null });
      renderPieceList([piece]);
      expect(mockPositioner.update).not.toHaveBeenCalled();
    });

    it("applies the tall crop height before the first masonry pass", async () => {
      const pieces = [
        makePiece({
          id: "tall",
          thumbnail: {
            url: "https://example.com/tall.jpg",
            cloudinary_public_id: "id",
            cloud_name: "demo",
            crop: { x: 0, y: 0, width: 200, height: 400 },
          },
        }),
        makePiece({ id: "middle" }),
        makePiece({ id: "bottom" }),
      ];

      const { container } = renderPieceList(pieces);
      const expectedHeight = estimateCardHeight(pieces[0], mockPositioner.columnWidth);

      await waitFor(() => {
        const cards = container.querySelectorAll('[data-testid="piece-grid"] > div');
        expect(Number(cards[0]?.getAttribute("data-height"))).toBe(expectedHeight);
        expect(Number(cards[0]?.getAttribute("data-height"))).toBeGreaterThan(
          DEFAULT_CARD_HEIGHT_ESTIMATE,
        );
      });
    });

    it("does not re-seed already-positioned items", () => {
      mockPositioner.get.mockReturnValue({ top: 0, left: 0, height: 300, column: 0 });
      const piece = makePiece({
        thumbnail: {
          url: "https://example.com/img.jpg",
          cloudinary_public_id: "id",
          cloud_name: "demo",
          crop: { x: 0, y: 0, width: 200, height: 400 },
        },
      });
      renderPieceList([piece]);
      expect(mockPositioner.update).not.toHaveBeenCalled();
    });

    it("does not reseed on an unrelated rerender", async () => {
      const user = userEvent.setup();
      const piece = makePiece({
        thumbnail: {
          url: "https://example.com/img.jpg",
          cloudinary_public_id: "id",
          cloud_name: "demo",
          crop: { x: 0, y: 0, width: 200, height: 400 },
        },
      });
      const router = createMemoryRouter(
        [{ path: "/", element: <RerenderHarness pieces={[piece]} /> }],
        { initialEntries: ["/"] },
      );

      render(<RouterProvider router={router} />);
      expect(mockPositioner.update).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: /rerender/i }));
      expect(mockPositioner.update).toHaveBeenCalledTimes(1);
    });

    it("reserves the thumbnail crop ratio in the card shell", () => {
      renderPieceList([
        makePiece({
          thumbnail: {
            url: "https://example.com/img.jpg",
            cloudinary_public_id: "id",
            cloud_name: "demo",
            crop: { x: 0, y: 0, width: 200, height: 400 },
          },
        }),
      ]);

      expect(screen.getByTestId("piece-thumbnail-shell")).toHaveStyle({
        aspectRatio: "200 / 400",
      });
    });

    it("falls back to 4/3 aspect ratio on the thumbnail shell for pieces without a crop", () => {
      // Without this fallback the shell collapses to zero height while
      // CloudinaryImage loads (opacity:0, no intrinsic size), causing masonic
      // to measure the card as chrome-only height and place the next card too
      // close, resulting in visible overlap once the image loads.
      renderPieceList([makePiece({ thumbnail: null })]);
      expect(screen.getByTestId("piece-thumbnail-shell")).toHaveStyle({
        aspectRatio: `${DEFAULT_THUMBNAIL_ASPECT_WIDTH} / ${DEFAULT_THUMBNAIL_ASPECT_HEIGHT}`,
      });
    });

    it("passes requestedHeight matching the 4/3 fallback to CloudinaryImage for pieces without a crop", () => {
      // The Cloudinary fill request must match the shell aspect ratio so the
      // delivered image fills the container without driving reflow after load.
      const { container } = renderPieceList([
        makePiece({
          thumbnail: {
            url: "https://example.com/img.jpg",
            cloudinary_public_id: "pieces/nocrop",
            cloud_name: "demo",
            crop: null,
          },
        }),
      ]);
      const image = container.querySelector("img")!;
      const rw = Number(image.getAttribute("data-requested-width"));
      const rh = Number(image.getAttribute("data-requested-height"));
      const piece = { thumbnail: { crop: null } } as PieceSummary;
      expect(rh).toBe(getThumbnailRequestedHeight(piece, rw));
    });

    it("reserves the crop-derived card height for mocked image payloads", () => {
      const pieces = [
        makePiece({
          id: "portrait",
          name: "Tall Pitcher",
          thumbnail: {
            url: "https://example.com/tall.jpg",
            cloudinary_public_id: "pieces/tall",
            cloud_name: "demo",
            crop: { x: 0, y: 0, width: 200, height: 400 },
          },
        }),
        makePiece({
          id: "landscape",
          name: "Low Tray",
          thumbnail: {
            url: "https://example.com/wide.jpg",
            cloudinary_public_id: "pieces/wide",
            cloud_name: "demo",
            crop: { x: 0, y: 0, width: 400, height: 200 },
          },
        }),
        makePiece({
          id: "square",
          name: "Small Cup",
          thumbnail: {
            url: "https://example.com/square.jpg",
            cloudinary_public_id: "pieces/square",
            cloud_name: "demo",
            crop: { x: 0, y: 0, width: 200, height: 200 },
          },
        }),
      ];

      renderPieceList(pieces);

      const cards = screen.getAllByRole("link");
      expect(cards[0]).toHaveAttribute(
        "data-estimated-height",
        `${estimateCardHeight(pieces[0], 240)}`,
      );
      expect(cards[1]).toHaveAttribute(
        "data-estimated-height",
        `${estimateCardHeight(pieces[1], 240)}`,
      );
      expect(cards[2]).toHaveAttribute(
        "data-estimated-height",
        `${estimateCardHeight(pieces[2], 240)}`,
      );
      expect(Number(cards[0].getAttribute("data-estimated-height"))).toBeGreaterThan(
        DEFAULT_CARD_HEIGHT_ESTIMATE,
      );
    });
  });

  describe("estimateCardHeight", () => {
    // Helper: the 4:3 fallback height at an arbitrary column width.
    // Uses a width that differs from the reference 220px so the test is not
    // tautological (DEFAULT_CARD_HEIGHT_ESTIMATE is also computed at 220px).
    function fallbackAt(columnWidth: number) {
      return (
        Math.round((columnWidth * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) / DEFAULT_THUMBNAIL_ASPECT_WIDTH) +
        CARD_CHROME_HEIGHT
      );
    }

    it("falls back to 4:3 aspect ratio height when thumbnail is null", () => {
      expect(estimateCardHeight({ thumbnail: null } as PieceSummary, 160)).toBe(fallbackAt(160));
    });

    it("falls back to 4:3 aspect ratio height when crop is null", () => {
      expect(
        estimateCardHeight({ thumbnail: { crop: null } } as PieceSummary, 160),
      ).toBe(fallbackAt(160));
    });

    it("falls back to 4:3 aspect ratio height when crop is absent", () => {
      expect(
        estimateCardHeight({ thumbnail: {} } as PieceSummary, 160),
      ).toBe(fallbackAt(160));
    });

    it("computes height from landscape crop aspect ratio", () => {
      // 400×200 crop → ratio 0.5 → at width 220 → image height 110 + CARD_CHROME_HEIGHT
      const piece = {
        thumbnail: { crop: { x: 0, y: 0, width: 400, height: 200 } },
      } as PieceSummary;
      expect(estimateCardHeight(piece, 220)).toBe(Math.round(220 * 0.5) + CARD_CHROME_HEIGHT);
    });

    it("computes height from portrait crop aspect ratio", () => {
      // 200×400 crop → ratio 2 → at width 220 → image height 440 + CARD_CHROME_HEIGHT
      const piece = {
        thumbnail: { crop: { x: 0, y: 0, width: 200, height: 400 } },
      } as PieceSummary;
      expect(estimateCardHeight(piece, 220)).toBe(Math.round(220 * 2) + CARD_CHROME_HEIGHT);
    });

    it("falls back to 4:3 aspect ratio height when crop.width is 0 (guard against division by zero)", () => {
      const piece = {
        thumbnail: { crop: { x: 0, y: 0, width: 0, height: 200 } },
      } as PieceSummary;
      expect(estimateCardHeight(piece, 160)).toBe(fallbackAt(160));
    });

    it("DEFAULT_CARD_HEIGHT_ESTIMATE equals the 4:3 fallback at the desktop column width", () => {
      // Ensures the itemHeightEstimate passed to MasonryScroller is consistent
      // with what estimateCardHeight returns for no-crop pieces on desktop.
      expect(DEFAULT_CARD_HEIGHT_ESTIMATE).toBe(fallbackAt(220));
    });
  });

  describe("with no pieces", () => {
    it("renders the piece count as 0", () => {
      renderPieceList([]);
      expect(screen.getByText(/· 0 pieces/)).toBeInTheDocument();
    });
  });

  describe("with one piece", () => {
    it("renders the piece name", () => {
      renderPieceList([makePiece()]);
      expect(screen.getByText("Clay Bowl")).toBeInTheDocument();
    });

    it("renders the current state", () => {
      renderPieceList([
        makePiece({ current_state: { state: "bisque_fired" } }),
      ]);
      expect(screen.getByText("Planning → Glaze")).toBeInTheDocument();
    });

    it("renders the thumbnail image with correct src", () => {
      const { container } = renderPieceList([makePiece()]);
      const imgs = container.querySelectorAll("img");
      expect(
        Array.from(imgs).some(
          (img) => img.getAttribute("src") === "https://example.com/bowl.jpg",
        ),
      ).toBe(true);
    });

    it("passes only requestedWidth (not requestedHeight) to CloudinaryImage for cropped pieces", () => {
      // For cropped pieces, Cloudinary infers height from the crop ratio after
      // scale().width() — passing requestedHeight would override that inference.
      // requestedHeight is only set for no-crop pieces (covered by the separate test above).
      const { container } = renderPieceList([
        makePiece({
          thumbnail: {
            url: "https://example.com/tall.jpg",
            cloudinary_public_id: "pieces/tall",
            cloud_name: "demo",
            crop: { x: 0, y: 0, width: 0.5, height: 1 },
          },
        }),
      ]);

      const image = container.querySelector("img")!;
      expect(image.getAttribute("data-crop")).toBe("yes");
      expect(image.getAttribute("data-requested-width")).toBe("240");
      expect(image.hasAttribute("data-requested-height")).toBe(false);
    });

    it("card links to piece detail page", () => {
      renderPieceList([makePiece()]);
      const link = screen.getByRole("link");
      expect(link.getAttribute("href")).toBe(
        "/pieces/aaaaaaaa-0000-0000-0000-000000000001",
      );
    });

    it("renders tags as chips", () => {
      renderPieceList([
        makePiece({
          tags: [
            { id: "tag-1", name: "Gift", color: "#2A9D8F", is_public: false },
            { id: "tag-2", name: "Functional", color: "#E76F51", is_public: false },
          ],
        }),
      ]);
      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(screen.getByText("Functional")).toBeInTheDocument();
    });

    it("renders a piece card without tag chips when the piece has no tags", () => {
      renderPieceList([makePiece({ tags: [] })]);
      expect(screen.queryByRole("button", { name: /\+\d+/i })).not.toBeInTheDocument();
    });
  });

  describe("with multiple pieces", () => {
    it("renders a card for each piece", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl" }),
        makePiece({ id: "id-2", name: "Mug" }),
        makePiece({ id: "id-3", name: "Vase" }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("shows the state chip label on each card", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "glazed" } as any }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Designing")).toBeInTheDocument();
      expect(screen.getByText("Glazing")).toBeInTheDocument();
    });

    it("passes stable piece ids to the masonry renderer as item keys", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Tagged Bowl", tags: [{ id: "tag-1", name: "Gift", color: "#2A9D8F", is_public: false }] }),
        makePiece({ id: "id-2", name: "Plain Mug", tags: [] }),
      ];

      const { container } = renderPieceList(pieces);
      const wrappers = container.querySelectorAll('[data-testid="piece-grid"] > div');

      expect(wrappers[0]?.getAttribute("data-key")).toBe("id-1");
      expect(wrappers[1]?.getAttribute("data-key")).toBe("id-2");
    });
  });

  describe("filter toolbar", () => {
    it("renders the condensed filter toggle button", () => {
      renderPieceList([]);
      expect(
        screen.getByRole("button", { name: /toggle filters/i }),
      ).toBeInTheDocument();
    });

    it("filter panel is not expanded on initial render", () => {
      renderPieceList([]);
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
    });

    it("expands the filter panel when the toggle is clicked", async () => {
      const user = userEvent.setup();
      renderPieceList([]);
      await openFilters(user);
      expect(screen.getByText("Active")).toBeVisible();
    });

    it("shows all pieces when no filter is selected", () => {
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("filters to work in progress pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      // Click the "Active" chip inside the filter panel
      const activeChip = screen.getAllByText("Active").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(activeChip!.closest('[role="button"]')!);

      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
      expect(screen.queryByText("Vase")).not.toBeInTheDocument();
    });

    it("filters to completed pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const completedChip = screen.getAllByText("Completed").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(completedChip!.closest('[role="button"]')!);

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.queryByText("Vase")).not.toBeInTheDocument();
    });

    it("filters to recycled pieces only", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const recycledChip = screen.getAllByText("Recycled").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(recycledChip!.closest('[role="button"]')!);

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("supports combining multiple filters", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
        makePiece({ id: "id-3", name: "Vase", current_state: { state: "recycled" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const completedChip = screen.getAllByText("Completed").find(
        (el) => el.closest('[role="button"]'),
      );
      const recycledChip = screen.getAllByText("Recycled").find(
        (el) => el.closest('[role="button"]'),
      );
      await user.click(completedChip!.closest('[role="button"]')!);
      await user.click(recycledChip!.closest('[role="button"]')!);

      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    it("shows all pieces again when a filter chip is toggled off", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({ id: "id-1", name: "Bowl", current_state: { state: "designed" } as any }),
        makePiece({ id: "id-2", name: "Mug", current_state: { state: "completed" } as any }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      const completedChip = screen.getAllByText("Completed").find(
        (el) => el.closest('[role="button"]'),
      );
      // Activate filter
      await user.click(completedChip!.closest('[role="button"]')!);
      expect(screen.queryByText("Bowl")).not.toBeInTheDocument();

      // Deactivate filter
      await user.click(completedChip!.closest('[role="button"]')!);
      await waitFor(() => {
        expect(screen.getByText("Bowl")).toBeInTheDocument();
      });
      expect(screen.getByText("Mug")).toBeInTheDocument();
    });

    it("filters pieces using AND between state and shared filters", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Active Shared",
          current_state: { state: "designed" } as any,
          shared: true,
        }),
        makePiece({
          id: "id-2",
          name: "Active Not Shared",
          current_state: { state: "designed" } as any,
          shared: false,
        }),
        makePiece({
          id: "id-3",
          name: "Completed Shared",
          current_state: { state: "completed" } as any,
          shared: true,
        }),
      ];
      renderPieceList(pieces);

      await openFilters(user);

      // Select "Active"
      const activeChip = screen.getAllByText("Active").find((el) => el.closest('[role="button"]'));
      await user.click(activeChip!.closest('[role="button"]')!);

      // Select "Shared"
      const sharedChip = screen.getAllByText("Shared").find((el) => el.closest('[role="button"]'));
      await user.click(sharedChip!.closest('[role="button"]')!);

      expect(screen.getByText("Active Shared")).toBeInTheDocument();
      expect(screen.queryByText("Active Not Shared")).not.toBeInTheDocument();
      expect(screen.queryByText("Completed Shared")).not.toBeInTheDocument();
    });
  });

  describe("tag filtering", () => {
    it("filters pieces to those matching all selected tags", async () => {
      const user = userEvent.setup();
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Bowl",
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F", is_public: false },
            { id: "sale", name: "For Sale", color: "#4FC3F7", is_public: false },
          ],
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          tags: [{ id: "gift", name: "Gift", color: "#2A9D8F", is_public: false }],
        }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      // Open the tag picker then select a tag (picker auto-closes after selection)
      await user.click(screen.getByRole("button", { name: /\+ tag/i }));
      await user.click(screen.getByLabelText("Filter by tag"));
      await user.click(screen.getByRole("option", { name: "Gift" }));
      // Gift is now an active chip; open the picker again for the second tag
      await user.click(screen.getByRole("button", { name: /\+ tag/i }));
      await user.click(screen.getByLabelText("Filter by tag"));
      await user.click(screen.getByRole("option", { name: "For Sale" }));

      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.queryByText("Mug")).not.toBeInTheDocument();
    });

    it("shows at most 2 tag chips per card with a dashed overflow chip", () => {
      renderPieceList([
        makePiece({
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F", is_public: false },
            { id: "sale", name: "For Sale", color: "#4FC3F7", is_public: false },
            { id: "sold", name: "Sold", color: "#F4A261", is_public: false },
            { id: "blue", name: "Blue", color: "#457B9D", is_public: false },
          ],
        }),
      ]);

      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(screen.getByText("For Sale")).toBeInTheDocument();
      expect(screen.queryByText("Sold")).not.toBeInTheDocument();
      expect(screen.queryByText("Blue")).not.toBeInTheDocument();
      // Overflow chip shows +2
      expect(screen.getByText("+2")).toBeInTheDocument();
    });
  });

  describe("sort selector", () => {
    it("does not render the sort selector when onSortChange is not provided", () => {
      renderPieceList([]);
      expect(screen.queryByLabelText("Sort order")).not.toBeInTheDocument();
    });

    it("renders a sort selector when onSortChange is provided", async () => {
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: (
              <PieceList
                pieces={[]}
                sortOrder="-last_modified"
                onSortChange={vi.fn()}
              />
            ),
          },
        ],
        { initialEntries: ["/"] },
      );
      render(<RouterProvider router={router} />);
      // Sort selector lives inside the expandable panel
      await openFilters(user);
      expect(screen.getByLabelText("Sort order")).toBeInTheDocument();
    });

    it("calls onSortChange when a new sort option is selected", async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: (
              <PieceList
                pieces={[]}
                sortOrder="-last_modified"
                onSortChange={onSortChange}
              />
            ),
          },
        ],
        { initialEntries: ["/"] },
      );
      render(<RouterProvider router={router} />);

      // Open filter panel so the sort selector is interactable
      await openFilters(user);
      await user.click(screen.getByLabelText("Sort order"));
      await user.click(screen.getByRole("option", { name: "Name A → Z" }));

      await waitFor(() => {
        expect(onSortChange).toHaveBeenCalledWith("name");
      });
    });
  });

  describe("loading states", () => {
    it("dims the existing list during replace-style refreshes", () => {
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: <PieceList pieces={[makePiece()]} loading />,
          },
        ],
        { initialEntries: ["/"] },
      );

      render(<RouterProvider router={router} />);

      expect(screen.getByTestId("piece-list-content").getAttribute("style")).toContain(
        "opacity: 0.42",
      );
      expect(screen.getByTestId("piece-list-overlay").getAttribute("style")).not.toContain(
        "background-color: transparent",
      );
    });

    it("keeps append pagination undimmed while showing the overlay spinner", () => {
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: <PieceList pieces={[makePiece()]} loadingMore />,
          },
        ],
        { initialEntries: ["/"] },
      );

      render(<RouterProvider router={router} />);

      expect(screen.getByTestId("piece-list-content").getAttribute("style")).toContain(
        "opacity: 1",
      );
      expect(screen.getByTestId("piece-list-overlay").getAttribute("style")).toContain(
        "background-color: transparent",
      );
    });
  });
});
