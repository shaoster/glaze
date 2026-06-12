import type React from "react";
import { useEffect, useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import PieceList from "../PieceList";
import {
  CARD_CHROME_HEIGHT,
  DEFAULT_CARD_HEIGHT_ESTIMATE,
  DEFAULT_THUMBNAIL_ASPECT_HEIGHT,
  DEFAULT_THUMBNAIL_ASPECT_WIDTH,
  estimateCardHeight,
} from "../pieceCardHeight";
import type { PieceSummary } from "../../util/types";

vi.mock("../AppImage", () => ({
  default: ({
    crop,
    croppedUrl,
    style,
    url,
    alt,
    onLoad,
  }: {
    crop?: unknown;
    croppedUrl?: string | null;
    style?: React.CSSProperties;
    url: string;
    alt?: string;
    onLoad?: React.ReactEventHandler<HTMLImageElement>;
  }) => (
    <img
      src={croppedUrl?.trim() || url}
      alt={alt ?? ""}
      data-crop={crop ? "yes" : "no"}
      style={style}
      onLoad={onLoad}
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
    positioner,
    render: RenderComponent,
    itemHeightEstimate,
    itemKey,
  }: {
    items: PieceSummary[];
    positioner: typeof mockPositioner;
    render: React.ComponentType<{
      data: PieceSummary;
      index: number;
      width: number;
    }>;
    itemHeightEstimate: number;
    itemKey?: (item: PieceSummary, index: number) => string | number;
  }) => {
    const [, forceRender] = useState(0);
    rerenderMasonryScroller = () => forceRender((value) => value + 1);

    const [measuredHeights, setMeasuredHeights] = useState<Map<number, number>>(new Map());

    useEffect(() => {
      const handleScroll = () => {
        const nextMeasured = new Map<number, number>();
        items.forEach((item, index) => {
          const key = itemKey ? itemKey(item, index) : index;
          const element = document.querySelector(`[data-key="${key}"]`);
          if (element) {
            const thumbnailShell = element.querySelector('[data-testid="piece-thumbnail-shell"]');
            if (thumbnailShell) {
              const style = window.getComputedStyle(thumbnailShell);
              const aspectRatioStr = style.aspectRatio;
              if (aspectRatioStr) {
                const parts = aspectRatioStr.split("/").map(Number);
                if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
                  const ratio = parts[0] / parts[1];
                  const actualHeight = Math.round(positioner.columnWidth / ratio) + CARD_CHROME_HEIGHT;
                  nextMeasured.set(index, actualHeight);
                  positioner.set(index, actualHeight);
                }
              }
            }
          }
        });
        setMeasuredHeights(nextMeasured);
      };
      window.addEventListener("scroll", handleScroll);
      return () => window.removeEventListener("scroll", handleScroll);
    }, [items, positioner, itemKey]);

    return (
      <div data-testid="piece-grid" style={{ position: "relative" }}>
        {(() => {
          const gutter = 8;
          const columnCount = positioner.columnCount;
          const columnWidth = positioner.columnWidth;
          const columnHeights = Array.from({ length: columnCount }, () => 0);
          const seededHeights = new Map<number, number>([
            ...positioner.set.mock.calls.map(([index, height]) => [
              index as number,
              height as number,
            ]),
            ...positioner.update.mock.calls.flatMap(([updates]) =>
              updates.flatMap((value, position) =>
                position % 2 === 0
                  ? [[value as number, updates[position + 1] as number]]
                  : [],
              ),
            ),
          ]);

          return items.map((item, index) => {
            const height = measuredHeights.get(index) ?? seededHeights.get(index) ?? itemHeightEstimate;
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
  useContainerPosition: () => ({
    width: mockContainerPosition.width,
    offset: mockContainerPosition.offset,
  }),
  usePositioner: () => mockPositioner,
  createPositioner: (
    columnCount: number,
    columnWidth: number,
    columnGutter: number,
    rowGutter: number,
  ) => {
    mockPositioner.columnCount = columnCount;
    mockPositioner.columnWidth = columnWidth;
    void columnGutter;
    void rowGutter;
    return mockPositioner;
  },
  useResizeObserver: () => undefined,
}));

function makePiece(overrides: Partial<PieceSummary> = {}): PieceSummary {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    name: "Clay Bowl",
    created: new Date("2024-01-15T10:00:00Z"),
    last_modified: new Date("2024-02-20T12:00:00Z"),
    photo_count: 0,
    thumbnail: {
      url: "https://example.com/bowl.jpg",
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

function renderPieceList(
  pieces: PieceSummary[],
  onNewPiece?: () => void,
) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <PieceList pieces={pieces} onNewPiece={onNewPiece} />,
      },
    ],
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
    mockPositioner.set.mockImplementation(() => {
      rerenderMasonryScroller?.();
      return undefined;
    });
    mockPositioner.get.mockImplementation(() => undefined);
    mockPositioner.update.mockImplementation(() => undefined);
    rerenderMasonryScroller = undefined;
    mockContainerPosition.width = 440;
    mockContainerPosition.offset = 0;
  });

  describe("MasonryScroller container-width guard", () => {
    it("shows the desktop New Piece button before filters are expanded", () => {
      renderPieceList([makePiece()], vi.fn());
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

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
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0, y: 0, width: 200, height: 400 },
        },
      });
      renderPieceList([piece]);
      expect(mockPositioner.set).toHaveBeenCalledWith(
        0,
        estimateCardHeight(piece, mockPositioner.columnWidth),
      );
    });

    it("uses set, not update, when seeding unplaced items (update crashes on undefined items)", () => {
      // positioner.update() reads items[index].height immediately and throws if the
      // item hasn't been placed yet. Only positioner.set() is safe for new items.
      const piece = makePiece({
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0, y: 0, width: 200, height: 400 },
        },
      });
      renderPieceList([piece]);
      expect(mockPositioner.update).not.toHaveBeenCalled();
      expect(mockPositioner.set).toHaveBeenCalled();
    });

    it("pre-seeds the positioner for pieces without a crop using fallback height", () => {
      const piece = makePiece({ thumbnail: null });
      renderPieceList([piece]);
      expect(mockPositioner.update).not.toHaveBeenCalled();
      expect(mockPositioner.set).toHaveBeenCalledWith(
        0,
        estimateCardHeight(piece, mockPositioner.columnWidth),
      );
    });

    it("applies the tall crop height before the first masonry pass", async () => {
      const pieces = [
        makePiece({
          id: "tall",
          thumbnail: {
            url: "https://example.com/tall.jpg",
            cropped_url: "https://example.com/img__crop.jpg",
            crop: { x: 0, y: 0, width: 200, height: 400 },
          },
        }),
        makePiece({ id: "middle" }),
        makePiece({ id: "bottom" }),
      ];

      const { container } = renderPieceList(pieces);
      const expectedHeight = estimateCardHeight(
        pieces[0],
        mockPositioner.columnWidth,
      );

      await waitFor(() => {
        const cards = container.querySelectorAll(
          '[data-testid="piece-grid"] > div',
        );
        expect(Number(cards[0]?.getAttribute("data-height"))).toBe(
          expectedHeight,
        );
        expect(Number(cards[0]?.getAttribute("data-height"))).toBeGreaterThan(
          DEFAULT_CARD_HEIGHT_ESTIMATE,
        );
      });
    });

    it("does not reseed on an unrelated rerender", async () => {
      const user = userEvent.setup();
      const piece = makePiece({
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0, y: 0, width: 200, height: 400 },
        },
      });
      const router = createMemoryRouter(
        [{ path: "/", element: <RerenderHarness pieces={[piece]} /> }],
        { initialEntries: ["/"] },
      );

      render(<RouterProvider router={router} />);
      expect(mockPositioner.set).toHaveBeenCalledTimes(1);

      await user.click(screen.getByRole("button", { name: /rerender/i }));
      expect(mockPositioner.set).toHaveBeenCalledTimes(1);
    });

    it("reserves the thumbnail crop ratio in the card shell", () => {
      renderPieceList([
        makePiece({
          thumbnail: {
            url: "https://example.com/img.jpg",
            cropped_url: "https://example.com/img__crop.jpg",
            crop: { x: 0, y: 0, width: 200, height: 400 },
          },
        }),
      ]);

      expect(screen.getByTestId("piece-thumbnail-shell")).toHaveStyle({
        aspectRatio: "200 / 400",
      });
    });

    it("falls back to 4/3 aspect ratio on the thumbnail shell for pieces without a crop or dimensions", () => {
      // Without this fallback the shell collapses to zero height while
      // AppImage loads (opacity:0, no intrinsic size), causing masonic
      // to measure the card as chrome-only height and place the next card too
      // close, resulting in visible overlap once the image loads.
      renderPieceList([
        makePiece({
          thumbnail: {
            url: "https://cdn.example.com/images/sample.jpg",
            crop: null,
          },
        }),
      ]);
      expect(screen.getByTestId("piece-thumbnail-shell")).toHaveStyle({
        aspectRatio: `${DEFAULT_THUMBNAIL_ASPECT_WIDTH} / ${DEFAULT_THUMBNAIL_ASPECT_HEIGHT}`,
      });
    });

    it("reserves the crop-derived card height for mocked image payloads", () => {
      const pieces = [
        makePiece({
          id: "portrait",
          name: "Tall Pitcher",
          thumbnail: {
            url: "https://example.com/tall.jpg",
            cropped_url: "https://example.com/tall__crop.jpg",
            crop: { x: 0, y: 0, width: 200, height: 400 },
          },
        }),
        makePiece({
          id: "landscape",
          name: "Low Tray",
          thumbnail: {
            url: "https://example.com/wide.jpg",
            cropped_url: "https://example.com/wide__crop.jpg",
            crop: { x: 0, y: 0, width: 400, height: 200 },
          },
        }),
        makePiece({
          id: "square",
          name: "Small Cup",
          thumbnail: {
            url: "https://example.com/square.jpg",
            cropped_url: "https://example.com/square__crop.jpg",
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
      expect(
        Number(cards[0].getAttribute("data-estimated-height")),
      ).toBeGreaterThan(DEFAULT_CARD_HEIGHT_ESTIMATE);
    });
  });

  describe("estimateCardHeight", () => {
    // Helper: the 4:3 fallback height at an arbitrary column width.
    // Uses a width that differs from the reference 220px so the test is not
    // tautological (DEFAULT_CARD_HEIGHT_ESTIMATE is also computed at 220px).
    function fallbackAt(columnWidth: number) {
      return (
        Math.round(
          (columnWidth * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) /
            DEFAULT_THUMBNAIL_ASPECT_WIDTH,
        ) + CARD_CHROME_HEIGHT
      );
    }

    it("falls back to 1:1 aspect ratio height when thumbnail is null", () => {
      expect(estimateCardHeight({ thumbnail: null } as PieceSummary, 160)).toBe(
        160 + CARD_CHROME_HEIGHT,
      );
    });

    it("falls back to 4:3 aspect ratio height when crop is null", () => {
      expect(
        estimateCardHeight({ thumbnail: { url: "https://example.com/img.jpg", crop: null } } as PieceSummary, 160),
      ).toBe(fallbackAt(160));
    });

    it("falls back to 4:3 aspect ratio height when crop is absent", () => {
      expect(estimateCardHeight({ thumbnail: { url: "https://example.com/img.jpg" } } as PieceSummary, 160)).toBe(
        fallbackAt(160),
      );
    });

    it("computes height from landscape crop aspect ratio", () => {
      // 400×200 crop → ratio 0.5 → at width 220 → image height 110 + CARD_CHROME_HEIGHT
      const piece = {
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0, y: 0, width: 400, height: 200 },
        },
      } as PieceSummary;
      expect(estimateCardHeight(piece, 220)).toBe(
        Math.round(220 * 0.5) + CARD_CHROME_HEIGHT,
      );
    });

    it("computes height from portrait crop aspect ratio", () => {
      // 200×400 crop → ratio 2 → at width 220 → image height 440 + CARD_CHROME_HEIGHT
      const piece = {
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0, y: 0, width: 200, height: 400 },
        },
      } as PieceSummary;
      expect(estimateCardHeight(piece, 220)).toBe(
        Math.round(220 * 2) + CARD_CHROME_HEIGHT,
      );
    });

    it("falls back to 4:3 aspect ratio height when crop.width is 0 (guard against division by zero)", () => {
      const piece = {
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0, y: 0, width: 0, height: 200 },
        },
      } as PieceSummary;
      expect(estimateCardHeight(piece, 160)).toBe(fallbackAt(160));
    });

    it("DEFAULT_CARD_HEIGHT_ESTIMATE equals the 4:3 fallback at the desktop column width", () => {
      // Ensures the itemHeightEstimate passed to MasonryScroller is consistent
      // with what estimateCardHeight returns for no-crop pieces on desktop.
      expect(DEFAULT_CARD_HEIGHT_ESTIMATE).toBe(fallbackAt(220));
    });

    it("uses true pixel ratio when original image dimensions are stored", () => {
      // Crop fractions are relative to their respective original dimension:
      // w_0.71875 means 71.875% of origWidth, h_0.8225 means 82.25% of origHeight.
      // For a 1000×800 original the cropped region is 718.75×658px (landscape).
      // Naive crop.h/crop.w = 0.8225/0.71875 ≈ 1.14 (portrait) — wrong.
      // True ratio = (0.71875*1000) / (0.8225*800) = 718.75/658 ≈ 1.09 (landscape).
      const piece = {
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0.125, y: 0, width: 0.71875, height: 0.8225 },
          width: 1000,
          height: 800,
        },
      } as PieceSummary;
      const expected =
        Math.round((220 * 0.8225 * 800) / (0.71875 * 1000)) +
        CARD_CHROME_HEIGHT;
      expect(estimateCardHeight(piece, 220)).toBe(expected);
    });

    it("naive crop ratio diverges from true pixel ratio for non-square originals", () => {
      // Without origW/origH (unknown original size) we fall back to crop.h/crop.w.
      // This is wrong for non-square originals but unavoidable until dimensions are stored.
      const pieceNoDims = {
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0.125, y: 0, width: 0.71875, height: 0.8225 },
          width: null,
          height: null,
        },
      } as PieceSummary;
      const pieceWithDims = {
        thumbnail: {
          url: "https://example.com/img.jpg",
          cropped_url: "https://example.com/img__crop.jpg",
          crop: { x: 0.125, y: 0, width: 0.71875, height: 0.8225 },
          width: 1000,
          height: 800,
        },
      } as PieceSummary;
      // The two estimates must differ — if they're ever equal the fix has been lost.
      expect(estimateCardHeight(pieceNoDims, 220)).not.toBe(
        estimateCardHeight(pieceWithDims, 220),
      );
    });
  });

  describe("prod-mirroring layout: crops with known dimensions and pieces without crops", () => {
    it("seeded heights match estimated heights for all card types", async () => {
      // Mirrors the shape of prod data that caused first-load overlap:
      //   • pieces[0]: crop with known orig dims (1000×800) — should seed correctly
      //   • pieces[1]: crop with unknown orig dims (null) — naive fallback
      //   • pieces[2]: no crop — 4:3 fallback, not seeded
      const pieces = [
        makePiece({
          id: "with-dims",
          thumbnail: {
            url: "https://cdn.example.com/images/sample.jpg",
            cropped_url: "https://cdn.example.com/images/sample__crop.jpg",
            crop: { x: 0.125, y: 0, width: 0.71875, height: 0.8225 },
            width: 1000,
            height: 800,
          },
        }),
        makePiece({
          id: "no-dims",
          thumbnail: {
            url: "https://cdn.example.com/images/other.jpg",
            cropped_url: "https://cdn.example.com/images/other__crop.jpg",
            crop: { x: 0, y: 0, width: 0.8, height: 0.9 },
            width: null,
            height: null,
          },
        }),
        makePiece({ id: "no-crop", thumbnail: null }),
      ];

      renderPieceList(pieces);

      await waitFor(() => {
        // pieces[0]: set called with true pixel ratio height
        const trueHeight =
          Math.round(
            (mockPositioner.columnWidth * 0.8225 * 800) / (0.71875 * 1000),
          ) + CARD_CHROME_HEIGHT;
        expect(mockPositioner.set).toHaveBeenCalledWith(0, trueHeight);

        // pieces[1]: set called with naive fallback (no orig dims)
        const naiveHeight =
          Math.round((mockPositioner.columnWidth * 0.9) / 0.8) +
          CARD_CHROME_HEIGHT;
        expect(mockPositioner.set).toHaveBeenCalledWith(1, naiveHeight);

        // pieces[2]: no crop -> seeded with 1:1 fallback for local thumbnail; exactly 3 set() calls total
        const fallbackHeight = mockPositioner.columnWidth + CARD_CHROME_HEIGHT;
        expect(mockPositioner.set).toHaveBeenCalledWith(2, fallbackHeight);
        expect(mockPositioner.set).toHaveBeenCalledTimes(3);
      });

      // The true-pixel height for pieces[0] must differ from the naive height
      // (proves orig dims are being used, not ignored).
      const naiveForPieces0 =
        Math.round((mockPositioner.columnWidth * 0.8225) / 0.71875) +
        CARD_CHROME_HEIGHT;
      const trueForPieces0 =
        Math.round(
          (mockPositioner.columnWidth * 0.8225 * 800) / (0.71875 * 1000),
        ) + CARD_CHROME_HEIGHT;
      expect(trueForPieces0).not.toBe(naiveForPieces0);
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

    it("renders the materialized cropped URL when the thumbnail has one", () => {
      const { container } = renderPieceList([
        makePiece({
          thumbnail: {
            url: "https://example.com/tall.jpg",
            cropped_url: "https://example.com/tall__crop.jpg",
            crop: { x: 0, y: 0, width: 0.5, height: 1 },
          },
        }),
      ]);

      const image = container.querySelector("img")!;
      expect(image.getAttribute("data-crop")).toBe("yes");
      expect(image.getAttribute("src")).toBe(
        "https://example.com/tall__crop.jpg",
      );
    });

    it("fills the thumbnail shell so cropped images do not leave a visible gap", () => {
      const { container } = renderPieceList([
        makePiece({
          thumbnail: {
            url: "https://example.com/tall.jpg",
            cropped_url: "https://example.com/tall__crop.jpg",
            crop: { x: 0, y: 0, width: 200, height: 400 },
          },
        }),
      ]);

      const image = container.querySelector("img")!;
      expect(image).toHaveStyle({
        width: "100%",
        height: "100%",
        objectFit: "cover",
      });
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
            {
              id: "tag-2",
              name: "Functional",
              color: "#E76F51",
              is_public: false,
            },
          ],
        }),
      ]);
      expect(screen.getByText("Gift")).toBeInTheDocument();
      expect(screen.getByText("Functional")).toBeInTheDocument();
    });

    it("renders a photo count badge on the thumbnail", () => {
      renderPieceList([makePiece({ photo_count: 3 })]);

      expect(
        within(screen.getByTestId("piece-thumbnail-shell")).getByText(
          "3 photos",
        ),
      ).toBeInTheDocument();
    });

    it("renders a piece card without tag chips when the piece has no tags", () => {
      renderPieceList([makePiece({ tags: [] })]);
      expect(
        screen.queryByRole("button", { name: /\+\d+/i }),
      ).not.toBeInTheDocument();
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
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "glazed" } as any,
        }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Designing")).toBeInTheDocument();
      expect(screen.getByText("Glazing")).toBeInTheDocument();
    });

    it("passes stable piece ids to the masonry renderer as item keys", () => {
      const pieces = [
        makePiece({
          id: "id-1",
          name: "Tagged Bowl",
          tags: [
            { id: "tag-1", name: "Gift", color: "#2A9D8F", is_public: false },
          ],
        }),
        makePiece({ id: "id-2", name: "Plain Mug", tags: [] }),
      ];

      const { container } = renderPieceList(pieces);
      const wrappers = container.querySelectorAll(
        '[data-testid="piece-grid"] > div',
      );

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
        makePiece({
          id: "id-1",
          name: "Bowl",
          current_state: { state: "designed" } as any,
        }),
        makePiece({
          id: "id-2",
          name: "Mug",
          current_state: { state: "completed" } as any,
        }),
        makePiece({
          id: "id-3",
          name: "Vase",
          current_state: { state: "recycled" } as any,
        }),
      ];
      renderPieceList(pieces);
      expect(screen.getByText("Bowl")).toBeInTheDocument();
      expect(screen.getByText("Mug")).toBeInTheDocument();
      expect(screen.getByText("Vase")).toBeInTheDocument();
    });

    // Filtering is now server-side: clicking a filter chip updates the URL so the
    // parent re-fetches with the appropriate params. PieceList itself no longer
    // removes pieces from the DOM — it displays whatever the server returns.
    // These tests verify that the active filter label (inside the "Toggle filters"
    // button) updates correctly when chips are clicked.

    function getFilterLabel() {
      // The active filter label lives inside the "Toggle filters" button as a span.
      return screen.getByRole("button", { name: /toggle filters/i }).textContent;
    }

    it("activates the Active filter chip and updates the filter label", async () => {
      const user = userEvent.setup();
      renderPieceList([makePiece({ id: "id-1", name: "Bowl" })]);

      await openFilters(user);
      const activeChip = screen
        .getAllByText("Active")
        .find((el) => el.closest('[role="button"]'));
      await user.click(activeChip!.closest('[role="button"]')!);

      await waitFor(() => expect(getFilterLabel()).toContain("Active"));
    });

    it("activates the Completed filter chip and updates the filter label", async () => {
      const user = userEvent.setup();
      renderPieceList([makePiece({ id: "id-1", name: "Bowl" })]);

      await openFilters(user);
      const completedChip = screen
        .getAllByText("Completed")
        .find((el) => el.closest('[role="button"]'));
      await user.click(completedChip!.closest('[role="button"]')!);

      await waitFor(() => expect(getFilterLabel()).toContain("Completed"));
    });

    it("activates the Recycled filter chip and updates the filter label", async () => {
      const user = userEvent.setup();
      renderPieceList([makePiece({ id: "id-1", name: "Bowl" })]);

      await openFilters(user);
      const recycledChip = screen
        .getAllByText("Recycled")
        .find((el) => el.closest('[role="button"]'));
      await user.click(recycledChip!.closest('[role="button"]')!);

      await waitFor(() => expect(getFilterLabel()).toContain("Recycled"));
    });

    it("combines multiple filter chips and shows a combined label", async () => {
      const user = userEvent.setup();
      renderPieceList([makePiece({ id: "id-1", name: "Bowl" })]);

      await openFilters(user);
      const completedChip = screen
        .getAllByText("Completed")
        .find((el) => el.closest('[role="button"]'));
      const recycledChip = screen
        .getAllByText("Recycled")
        .find((el) => el.closest('[role="button"]'));
      await user.click(completedChip!.closest('[role="button"]')!);
      await user.click(recycledChip!.closest('[role="button"]')!);

      await waitFor(() => {
        const label = getFilterLabel();
        expect(label).toContain("Completed");
        expect(label).toContain("Recycled");
      });
    });

    it("shows 'All' label again when a filter chip is toggled off", async () => {
      const user = userEvent.setup();
      renderPieceList([makePiece({ id: "id-1", name: "Bowl" })]);

      await openFilters(user);
      const completedChip = screen
        .getAllByText("Completed")
        .find((el) => el.closest('[role="button"]'));
      await user.click(completedChip!.closest('[role="button"]')!);
      await waitFor(() => expect(getFilterLabel()).toContain("Completed"));

      // Deactivate filter
      await user.click(completedChip!.closest('[role="button"]')!);
      await waitFor(() => expect(getFilterLabel()).toContain("All"));
    });

    it("shows combined label when state and shared filters are both active", async () => {
      const user = userEvent.setup();
      renderPieceList([makePiece({ id: "id-1", name: "Bowl" })]);

      await openFilters(user);
      const activeChip = screen
        .getAllByText("Active")
        .find((el) => el.closest('[role="button"]'));
      await user.click(activeChip!.closest('[role="button"]')!);

      const sharedChip = screen
        .getAllByText("Shared")
        .find((el) => el.closest('[role="button"]'));
      await user.click(sharedChip!.closest('[role="button"]')!);

      await waitFor(() => {
        const label = getFilterLabel();
        expect(label).toContain("Active");
        expect(label).toContain("Shared");
      });
    });
  });

  describe("tag filtering", () => {
    it("updates the active filter label when tags are selected", async () => {
      // Tag filtering is now server-side — selecting a tag chip updates the URL
      // so the parent re-fetches with ?tags=... PieceList itself no longer
      // removes non-matching pieces from the DOM.
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
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F", is_public: false },
          ],
        }),
      ];
      renderPieceList(pieces);

      await openFilters(user);
      await user.click(screen.getByRole("button", { name: /\+ tag/i }));
      await user.click(screen.getByLabelText("Filter by tag"));
      await user.click(screen.getByRole("option", { name: "Gift" }));

      // Label in the toggle button should now include the tag name
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /toggle filters/i }).textContent,
        ).toContain("Gift"),
      );
    });

    it("keeps the active tag filter removable when results are empty", async () => {
      // Regression: with server-side filtering a narrow filter can return zero
      // pieces. The active tag chip must still render (and be removable) so the
      // user is not stranded with a filter clearable only via the URL.
      const user = userEvent.setup();
      const router = createMemoryRouter(
        [{ path: "/", element: <PieceList pieces={[]} /> }],
        { initialEntries: ["/?tags=gift"] },
      );
      render(<RouterProvider router={router} />);

      await openFilters(user);

      const removeButton = await screen.findByRole("button", {
        name: /remove/i,
      });
      expect(removeButton).toBeInTheDocument();

      // Clicking it clears the tag filter from the URL.
      await user.click(removeButton);
      await waitFor(() =>
        expect(router.state.location.search).not.toContain("tags=gift"),
      );
    });

    it("shows at most 2 tag chips per card with a dashed overflow chip", () => {
      renderPieceList([
        makePiece({
          tags: [
            { id: "gift", name: "Gift", color: "#2A9D8F", is_public: false },
            {
              id: "sale",
              name: "For Sale",
              color: "#4FC3F7",
              is_public: false,
            },
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

      expect(
        screen.getByTestId("piece-list-content").getAttribute("style"),
      ).toContain("opacity: 0.42");
      expect(
        screen.getByTestId("piece-list-overlay").getAttribute("style"),
      ).not.toContain("background-color: transparent");
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

      expect(
        screen.getByTestId("piece-list-content").getAttribute("style"),
      ).toContain("opacity: 1");
      expect(
        screen.getByTestId("piece-list-overlay").getAttribute("style"),
      ).toContain("background-color: transparent");
    });
  });

  describe("scroll sentinel", () => {
    it("does not call onLoadMore while the masonry container width is unmeasured", async () => {
      // Regression for #734: with the pre-fix code, the sentinel effect fires
      // check() immediately on mount regardless of masonryWidth. At that moment
      // masonryWidth=0 (ResizeObserver hasn't fired), the sentinel element sits
      // at top≈0 in the unmeasured document, and check() calls onLoadMore before
      // any cards are visible — fetching page 2 prematurely and causing the flash.
      //
      // The fix adds masonryWidth to the effect's deps and guards with
      // `if (masonryWidth === 0) return`, so the effect is a no-op until the
      // container has been measured.
      //
      // We let the event loop run (setTimeout) so React's MessageChannel-based
      // scheduler has time to fire the mount effect before we assert.
      mockContainerPosition.width = 0;
      const onLoadMore = vi.fn();
      const firstPage = Array.from({ length: 16 }, (_, i) =>
        makePiece({ id: `piece-${i}` }),
      );
      const router = createMemoryRouter(
        [
          {
            path: "/",
            element: (
              <PieceList pieces={firstPage} onLoadMore={onLoadMore} hasMore />
            ),
          },
        ],
        { initialEntries: ["/"] },
      );
      render(<RouterProvider router={router} />);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      expect(onLoadMore).not.toHaveBeenCalled();
    });
  });

  describe("layout stability with default thumbnails", () => {
    it("keeps layout stable for default SVG thumbnails upon loading and scrolling", () => {
      const pieces = Array.from({ length: 9 }, (_, i) =>
        makePiece({
          id: `aaaaaaaa-0000-0000-0000-00000000000${i + 1}`,
          thumbnail: null,
        }),
      );

      const { container } = renderPieceList(pieces);

      const grid = screen.getByTestId("piece-grid");
      const cardsBefore = Array.from(grid.children) as HTMLDivElement[];
      const topsBefore = cardsBefore.map((c) => c.getAttribute("data-top"));

      const images = container.querySelectorAll("img");
      images.forEach((img) => {
        Object.defineProperty(img, "naturalWidth", { value: 100, configurable: true });
        Object.defineProperty(img, "naturalHeight", { value: 100, configurable: true });
        fireEvent.load(img);
      });

      fireEvent.scroll(window);

      const cardsAfter = Array.from(grid.children) as HTMLDivElement[];
      const topsAfter = cardsAfter.map((c) => c.getAttribute("data-top"));

      expect(topsAfter).toEqual(topsBefore);
    });
  });
});
