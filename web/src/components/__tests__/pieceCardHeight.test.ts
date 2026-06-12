import { describe, it, expect } from "vitest";
import type { PieceSummary } from "../../util/types";
import {
  CARD_CHROME_HEIGHT,
  DEFAULT_THUMBNAIL_ASPECT_HEIGHT,
  DEFAULT_THUMBNAIL_ASPECT_WIDTH,
  getPieceCardLayout,
} from "../pieceCardHeight";

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

describe("getPieceCardLayout", () => {
  it("uses the crop aspect when the cropped derivative is materialized", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cropped_url: "https://example.com/img__crop.jpg",
        crop: { x: 0, y: 0, width: 200, height: 400 },
      },
    });

    const layout = getPieceCardLayout(piece, 220);

    expect(layout).toEqual({
      thumbnailAspectRatio: "200 / 400",
      estimatedHeight: Math.round(220 * 2) + CARD_CHROME_HEIGHT,
    });
  });

  it("scales the crop fractions by the original dimensions when available", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cropped_url: "https://example.com/img__crop.jpg",
        crop: { x: 0.125, y: 0, width: 0.71875, height: 0.8225 },
        width: 1000,
        height: 800,
      },
    });

    const layout = getPieceCardLayout(piece, 220);

    expect(layout.thumbnailAspectRatio).toBe("718.75 / 658");
    expect(layout.estimatedHeight).toBe(
      Math.round((220 * 0.8225 * 800) / (0.71875 * 1000)) + CARD_CHROME_HEIGHT,
    );
  });

  it("ignores a pending crop (no cropped_url) and uses the original dimensions", () => {
    // Until generate_cropped_image materializes the derivative the original
    // image renders, so its aspect ratio (not the crop's) drives the layout.
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cropped_url: null,
        crop: { x: 0, y: 0, width: 0.2, height: 0.8 },
        width: 600,
        height: 300,
      },
    });

    const layout = getPieceCardLayout(piece, 220);

    expect(layout).toEqual({
      thumbnailAspectRatio: "600 / 300",
      estimatedHeight: Math.round((220 * 300) / 600) + CARD_CHROME_HEIGHT,
    });
  });

  it("ignores a crop whose derivative URL is blank", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cropped_url: "   ",
        crop: { x: 0, y: 0, width: 0.2, height: 0.8 },
      },
    });

    const layout = getPieceCardLayout(piece, 240);

    expect(layout).toEqual({
      thumbnailAspectRatio: `${DEFAULT_THUMBNAIL_ASPECT_WIDTH} / ${DEFAULT_THUMBNAIL_ASPECT_HEIGHT}`,
      estimatedHeight:
        Math.round(
          (240 * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) /
            DEFAULT_THUMBNAIL_ASPECT_WIDTH,
        ) + CARD_CHROME_HEIGHT,
    });
  });

  it("falls back to the 1:1 shell for local thumbnails (including null/default)", () => {
    const piece = makePiece({ thumbnail: null });

    const layout = getPieceCardLayout(piece, 240);

    expect(layout).toEqual({
      thumbnailAspectRatio: "1 / 1",
      estimatedHeight: 240 + CARD_CHROME_HEIGHT,
    });
  });

  it("falls back to 4:3 for an image without dimensions and without a materialized crop", () => {
    const piece = makePiece(); // url only, no dimensions

    const layout = getPieceCardLayout(piece, 240);

    expect(layout).toEqual({
      thumbnailAspectRatio: `${DEFAULT_THUMBNAIL_ASPECT_WIDTH} / ${DEFAULT_THUMBNAIL_ASPECT_HEIGHT}`,
      estimatedHeight:
        Math.round(
          (240 * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) /
            DEFAULT_THUMBNAIL_ASPECT_WIDTH,
        ) + CARD_CHROME_HEIGHT,
    });
  });

  it("uses original dimensions for a thumbnail without a crop", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        width: 600,
        height: 800,
      },
    });

    const layout = getPieceCardLayout(piece, 220);

    expect(layout).toEqual({
      thumbnailAspectRatio: "600 / 800",
      estimatedHeight: Math.round((220 * 800) / 600) + CARD_CHROME_HEIGHT,
    });
  });
});
