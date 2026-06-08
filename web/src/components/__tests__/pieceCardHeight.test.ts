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

describe("getPieceCardLayout", () => {
  it("returns crop-backed shell, card, and Cloudinary sizing", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cloudinary_public_id: "id",
        cloud_name: "demo",
        crop: { x: 0, y: 0, width: 200, height: 400 },
      },
    });

    const layout = getPieceCardLayout(piece, 220);

    expect(layout).toEqual({
      thumbnailAspectRatio: "200 / 400",
      estimatedHeight: Math.round(220 * 2) + CARD_CHROME_HEIGHT,
      requestedHeight: undefined,
    });
  });

  it("uses original image dimensions when available", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cloudinary_public_id: "id",
        cloud_name: "demo",
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
    expect(layout.requestedHeight).toBeUndefined();
  });

  it("falls back to the raw crop ratio when original image dimensions are missing", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cloudinary_public_id: "id",
        cloud_name: "demo",
        crop: { x: 0, y: 0, width: 200, height: 400 },
      },
    });

    const layout = getPieceCardLayout(piece, 220);

    expect(layout).toEqual({
      thumbnailAspectRatio: "200 / 400",
      estimatedHeight: Math.round(220 * 2) + CARD_CHROME_HEIGHT,
      requestedHeight: undefined,
    });
  });

  it("falls back to the 1:1 shell for local thumbnails (including null/default)", () => {
    const piece = makePiece({ thumbnail: null });

    const layout = getPieceCardLayout(piece, 240);

    expect(layout).toEqual({
      thumbnailAspectRatio: "1 / 1",
      estimatedHeight: 240 + CARD_CHROME_HEIGHT,
      requestedHeight: undefined,
    });
  });

  it("falls back to 4:3 for non-cloudinary image without dimensions and without crop", () => {
    const piece = makePiece(); // non-cloudinary, url only, no dimensions

    const layout = getPieceCardLayout(piece, 240);

    expect(layout).toEqual({
      thumbnailAspectRatio: `${DEFAULT_THUMBNAIL_ASPECT_WIDTH} / ${DEFAULT_THUMBNAIL_ASPECT_HEIGHT}`,
      estimatedHeight:
        Math.round(
          (240 * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) /
            DEFAULT_THUMBNAIL_ASPECT_WIDTH,
        ) + CARD_CHROME_HEIGHT,
      requestedHeight: Math.round(
        (240 * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) /
          DEFAULT_THUMBNAIL_ASPECT_WIDTH,
      ),
    });
  });

  it("uses original dimensions for non-cloudinary thumbnail without crop", () => {
    const piece = makePiece({
      thumbnail: {
        url: "https://example.com/img.jpg",
        cloudinary_public_id: null,
        cloud_name: null,
        width: 600,
        height: 800,
      },
    });

    const layout = getPieceCardLayout(piece, 220);

    expect(layout).toEqual({
      thumbnailAspectRatio: "600 / 800",
      estimatedHeight: Math.round((220 * 800) / 600) + CARD_CHROME_HEIGHT,
      requestedHeight: undefined,
    });
  });
});
