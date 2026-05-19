import type { Meta, StoryObj } from "@storybook/react";
import PieceList from "../components/PieceList";
import { http, HttpResponse } from "msw";
import type { PieceSummary } from "../util/types";

/**
 * PieceList is the primary dashboard for browsing and managing pieces.
 *
 * Rationale:
 * - Migrated to a performant virtualized grid (Masonic) in Issue #202 to handle 1000+ pieces.
 * - Implements server-side sorting and pagination (Issue #256).
 * - Features inline tag filtering and search (Issue #290).
 *
 * ## Masonry height pipeline
 *
 * Masonic absolutely positions every card using a pre-computed height. If that
 * estimate is wrong at the moment of first paint, cards overlap until the
 * ResizeObserver fires and corrects positions on the next scroll.
 *
 * The pipeline has three interlocking parts that **must stay in sync**:
 *
 * 1. **`thumbnail_crop` on the API response** (`Piece.thumbnail_crop`, serialized
 *    as `thumbnail.crop` in `PieceSummary`). Relative coordinates `{x, y, width,
 *    height}` in the original image's coordinate space. Set when the user crops
 *    the thumbnail; `null` for pieces that have never been cropped.
 *
 * 2. **`getThumbnailAspectRatio(piece)`** (`pieceCardHeight.ts`) — returns a CSS
 *    `aspect-ratio` string. When crop is present: `"<crop.width> / <crop.height>"`.
 *    When absent: the `DEFAULT_THUMBNAIL_ASPECT_WIDTH / DEFAULT_THUMBNAIL_ASPECT_HEIGHT`
 *    fallback (currently 4:3). This value is applied directly to the thumbnail
 *    shell `<Box>` so the container always has a defined height, even while
 *    `CloudinaryImage` is loading at `opacity:0`.
 *
 *    **Critical invariant**: the shell must never have an undefined `aspect-ratio`.
 *    Without it, the container collapses to zero height during the Cloudinary load
 *    phase, causing masonic to measure the card as chrome-only height (~112 px)
 *    and place the next card too close — producing the visible overlap bug that
 *    was fixed in the `issue-masonry-debug` branch.
 *
 * 3. **`estimateCardHeight(piece, columnWidth)`** (`pieceCardHeight.ts`) — mirrors
 *    the shell aspect ratio in pixels so masonic's pre-seed matches real rendered
 *    height. Crop present: `round(columnWidth × crop.height / crop.width) + CARD_CHROME_HEIGHT`.
 *    Crop absent: `round(columnWidth × DEFAULT_THUMBNAIL_ASPECT_HEIGHT / DEFAULT_THUMBNAIL_ASPECT_WIDTH) + CARD_CHROME_HEIGHT`.
 *
 * 4. **`requestedHeight` on `CloudinaryImage`** — for no-crop pieces in the gallery
 *    context, `PieceCard` passes `round(width × 3/4)` so the Cloudinary `fill`
 *    transform delivers an image whose intrinsic size matches the shell dimensions.
 *    Crop pieces omit `requestedHeight`; Cloudinary infers height from the crop ratio.
 *
 * When adding a new thumbnail display context (e.g. a different grid density),
 * update all four parts together.
 *
 * Edge cases:
 * - Empty library: filter count shows 0.
 * - Loading more: spinner overlay while next page fetches.
 * - Mixed crop/no-crop: first page often has both; the 4:3 fallback keeps
 *   uncropped cards stable so cropped cards of varying heights don't cause overlap.
 */
const meta = {
  title: "Components/PieceList",
  component: PieceList,
  parameters: {
    layout: "fullscreen",
    docs: {
      inlineStories: false,
      iframeHeight: 800,
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PieceList>;

export default meta;
type Story = StoryObj<typeof meta>;

function makePiece(overrides: Partial<PieceSummary>): PieceSummary {
  return {
    id: "p0",
    name: "Unnamed Piece",
    created: new Date("2026-05-10"),
    last_modified: new Date("2026-05-12"),
    thumbnail: null,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "designed", created: new Date("2026-05-10") } as any,
    current_location: null,
    tags: [],
    shared: false,
    is_editable: false,
    can_edit: true,
    showcase_fields: [],
    ...overrides,
  };
}

const mockPieces: PieceSummary[] = [
  makePiece({
    id: "p1",
    name: "Midnight Bowl",
    thumbnail: null,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "glaze_fired", created: new Date("2026-05-12") } as any,
    current_location: "Finished Goods Shelf",
    tags: [{ id: "t1", name: "midnight", color: "#121232", is_public: true }],
  }),
  makePiece({
    id: "p2",
    name: "Spring Plate",
    thumbnail: null,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "bisque_fired", created: new Date("2026-05-09") } as any,
    current_location: "Bisque Shelf",
    tags: [{ id: "t2", name: "spring", color: "#8eb89a", is_public: true }],
    shared: true,
  }),
];

// Pieces that mix portrait/landscape crops with uncropped entries, matching the
// real-world condition that originally caused the masonry overlap bug.
// Crop coordinates are in relative units (0–1 of the source image dimensions).
const mixedCropPieces: PieceSummary[] = [
  makePiece({
    id: "m1",
    name: "Tall Pitcher",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "designed", created: new Date("2026-05-01") } as any,
    thumbnail: {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
      crop: { x: 0.1, y: 0.0, width: 0.5, height: 0.9 }, // portrait
    },
  }),
  makePiece({
    id: "m2",
    name: "Wide Tray",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "bisque_fired", created: new Date("2026-05-02") } as any,
    thumbnail: null, // no crop — falls back to 4:3 shell
  }),
  makePiece({
    id: "m3",
    name: "Round Mug",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "glazed", created: new Date("2026-05-03") } as any,
    thumbnail: {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
      crop: { x: 0.0, y: 0.1, width: 0.8, height: 0.8 }, // near-square
    },
  }),
  makePiece({
    id: "m4",
    name: "Shallow Bowl",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "designed", created: new Date("2026-05-04") } as any,
    thumbnail: null, // no crop — falls back to 4:3 shell
    tags: [{ id: "tg1", name: "functional", color: "#E76F51", is_public: false }],
  }),
  makePiece({
    id: "m5",
    name: "Landscape Platter",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "completed", created: new Date("2026-05-05") } as any,
    thumbnail: {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
      crop: { x: 0.0, y: 0.2, width: 0.9, height: 0.4 }, // landscape
    },
  }),
  makePiece({
    id: "m6",
    name: "Untagged Vase",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "bisque_fired", created: new Date("2026-05-06") } as any,
    thumbnail: null,
  }),
];

// Matches the prod scale shown in the screenshot that reproduced the overlap:
// 24+ pieces with mixed crops, no-crops, and tag counts. The root cause was
// that MasonryScroller rendered on the first React commit when
// useContainerPosition still returned width=0, so masonic measured Phase-1
// items at columnWidth=0 and the thumbnail shell collapsed to 0 px.
// This dataset exercises that path at realistic scale.
const largePieceDataset: PieceSummary[] = Array.from({ length: 24 }, (_, i) => {
  const states = ["designed", "bisque_fired", "glazed", "glaze_fired", "completed", "touching_up"] as const;
  const crops: (PieceSummary["thumbnail"] & object)["crop"][] = [
    { x: 0.05, y: 0.0, width: 0.45, height: 0.92 }, // portrait
    null,
    { x: 0.0, y: 0.1, width: 0.8, height: 0.8 }, // near-square
    null,
    { x: 0.0, y: 0.2, width: 0.9, height: 0.4 }, // landscape
    null,
  ];
  const tagSets = [
    [],
    [{ id: "t1", name: "functional", color: "#E76F51", is_public: false }],
    [
      { id: "t2", name: "decorative", color: "#2A9D8F", is_public: true },
      { id: "t3", name: "handle", color: "#264653", is_public: true },
    ],
    [
      { id: "t4", name: "cup", color: "#E9C46A", is_public: true },
      { id: "t5", name: "fluted", color: "#F4A261", is_public: false },
      { id: "t6", name: "slip", color: "#E76F51", is_public: false },
    ],
  ];
  const crop = crops[i % crops.length];
  return makePiece({
    id: `lp${i}`,
    name: `Piece ${i + 1}`,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: states[i % states.length], created: new Date("2026-05-01") } as any,
    thumbnail: {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
      crop: crop ?? null,
    },
    tags: tagSets[i % tagSets.length],
  });
});

// Same data shape as the regression test that failed on first render:
// one tall cropped card followed by two uncropped cards.
const firstLoadOverlapPieces: PieceSummary[] = [
  makePiece({
    id: "r1",
    name: "Tall Pitcher",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "designed", created: new Date("2026-05-01") } as any,
    thumbnail: {
      url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      cloudinary_public_id: "sample",
      cloud_name: "demo",
      crop: { x: 0.08, y: 0.0, width: 0.45, height: 0.92 },
    },
  }),
  makePiece({
    id: "r2",
    name: "Uncropped Vase",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "bisque_fired", created: new Date("2026-05-02") } as any,
    thumbnail: null,
  }),
  makePiece({
    id: "r3",
    name: "Uncropped Bowl",
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    current_state: { state: "glaze_fired", created: new Date("2026-05-03") } as any,
    thumbnail: null,
  }),
];

export const Default: Story = {
  args: {
    pieces: mockPieces,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () =>
          HttpResponse.json({ count: 2, results: mockPieces }),
        ),
      ],
    },
  },
};

/**
 * Mixed portrait/landscape crops alongside uncropped pieces.
 *
 * This is the layout condition that triggered the masonry overlap bug: masonic
 * pre-seeds card heights from `estimateCardHeight`, which for cropped pieces uses
 * the exact crop aspect ratio and for uncropped pieces uses the 4:3 fallback.
 * The thumbnail shell always has `aspect-ratio` set (never undefined), so the
 * card occupies the correct height even before the Cloudinary image loads.
 *
 * If you see cards overlapping on first load in this story, `getThumbnailAspectRatio`
 * or `estimateCardHeight` in `pieceCardHeight.ts` is returning inconsistent values.
 */
export const MixedCropAndNoCrop: Story = {
  name: "Mixed crop / no-crop",
  args: {
    pieces: mixedCropPieces,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () =>
          HttpResponse.json({ count: mixedCropPieces.length, results: mixedCropPieces }),
        ),
      ],
    },
  },
};

/**
 * Initial masonry layout.
 *
 * This uses the exact failure setup from the regression test: one tall cropped
 * card followed by uncropped cards. It is the narrowest data shape that makes
 * the initial masonry placement bug easy to inspect in the browser.
 *
 * If the bug is still present in your local browser, the second and third cards
 * will start too high on first paint and then settle after a later layout tick.
 *
 * Source: [PR #549](https://github.com/shaoster/glaze/pull/549)
 */
export const InitialMasonryLayout: Story = {
  name: "Initial masonry layout",
  args: {
    pieces: firstLoadOverlapPieces,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () =>
          HttpResponse.json({
            count: firstLoadOverlapPieces.length,
            results: firstLoadOverlapPieces,
          }),
        ),
      ],
    },
  },
};

/**
 * Prod-scale dataset: 24 pieces with mixed crops, no-crops, and tag counts.
 *
 * This matches the real-world scale visible in the prod screenshot that showed
 * overlapping cards. The root cause was MasonryScroller rendering on the first
 * React commit before `useContainerPosition` had measured the container — at
 * that point masonic laid out Phase-1 items at `columnWidth=0`, the thumbnail
 * shell collapsed to 0 px, and the resulting chrome-only heights were copied
 * into the next positioner, causing all cards to be placed too close together.
 *
 * After the fix (`{masonryWidth > 0 && <MasonryScroller />}`), the grid is
 * suppressed until the container width is known, so the first masonic render
 * always uses the correct column width and measures card heights accurately.
 *
 * If you see cards overlapping on first paint in this story, the
 * `masonryWidth > 0` guard in `PieceList.tsx` has been removed or bypassed.
 */
export const LargeDataset: Story = {
  name: "Large dataset (24 pieces, prod scale)",
  args: {
    pieces: largePieceDataset,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () =>
          HttpResponse.json({
            count: largePieceDataset.length,
            results: largePieceDataset,
          }),
        ),
      ],
    },
  },
};

export const Empty: Story = {
  args: {
    pieces: [],
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () =>
          HttpResponse.json({ count: 0, results: [] }),
        ),
      ],
    },
  },
};

export const Loading: Story = {
  args: {
    pieces: [],
    loading: true,
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () => new Promise(() => {})),
      ],
    },
  },
};

export const Error: Story = {
  args: {
    pieces: [],
  },
  parameters: {
    msw: {
      handlers: [
        http.get("/api/pieces/", () => new HttpResponse(null, { status: 500 })),
      ],
    },
  },
};
