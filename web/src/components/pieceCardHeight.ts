import { DEFAULT_THUMBNAIL } from "./thumbnailConstants";
import type { PieceSummary } from "../util/types";

// Border, body padding, title, activity caption, and the tag row all live
// below the thumbnail, so this needs to be closer to the full card chrome.
export const CARD_CHROME_HEIGHT = 112;

// Fallback aspect ratio used when a piece has no usable thumbnail dimensions.
export const DEFAULT_THUMBNAIL_ASPECT_WIDTH = 4;
export const DEFAULT_THUMBNAIL_ASPECT_HEIGHT = 3;

export const DEFAULT_CARD_HEIGHT_ESTIMATE =
  Math.round(
    (220 * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) / DEFAULT_THUMBNAIL_ASPECT_WIDTH,
  ) + CARD_CHROME_HEIGHT; // 165 + 112 = 277 for a 220px column

export interface PieceCardLayout {
  thumbnailAspectRatio: string;
  estimatedHeight: number;
}

// A thumbnail renders at the crop aspect only once the cropped derivative has
// been materialized (cropped_url set by the backend task); until then the
// original renders, so the original dimensions drive the aspect. Crop
// coordinates are fractions of the original, so the true pixel aspect ratio
// of the cropped region is (crop.width * origW) / (crop.height * origH).
function getThumbnailAspect(piece: PieceSummary): {
  aspectWidth: number;
  aspectHeight: number;
} {
  const thumbnail = piece.thumbnail;
  const url = thumbnail?.url ?? DEFAULT_THUMBNAIL;
  const crop = thumbnail?.crop;
  const origW = thumbnail?.width;
  const origH = thumbnail?.height;

  if (
    crop &&
    crop.width > 0 &&
    crop.height > 0 &&
    thumbnail?.cropped_url?.trim()
  ) {
    return origW && origH
      ? { aspectWidth: crop.width * origW, aspectHeight: crop.height * origH }
      : { aspectWidth: crop.width, aspectHeight: crop.height };
  }

  if (url.startsWith("/thumbnails/")) {
    // Bundled placeholder thumbnails are square.
    return { aspectWidth: 1, aspectHeight: 1 };
  }

  if (origW && origH) {
    return { aspectWidth: origW, aspectHeight: origH };
  }

  return {
    aspectWidth: DEFAULT_THUMBNAIL_ASPECT_WIDTH,
    aspectHeight: DEFAULT_THUMBNAIL_ASPECT_HEIGHT,
  };
}

/**
 * Returns the thumbnail aspect ratio and card height estimate for a given
 * piece. PieceList uses this to keep the thumbnail shell and masonry
 * positioner in sync.
 */
export function getPieceCardLayout(
  piece: PieceSummary,
  columnWidth: number,
): PieceCardLayout {
  const { aspectWidth, aspectHeight } = getThumbnailAspect(piece);
  return {
    thumbnailAspectRatio: `${aspectWidth} / ${aspectHeight}`,
    estimatedHeight:
      Math.round((columnWidth * aspectHeight) / aspectWidth) +
      CARD_CHROME_HEIGHT,
  };
}

// Always returns an aspect-ratio CSS string. Materialized crop wins, then the
// stored original dimensions, then the 4:3 default.
export function getThumbnailAspectRatio(piece: PieceSummary): string {
  return getPieceCardLayout(piece, 220).thumbnailAspectRatio;
}

/**
 * Estimates the rendered card height from the thumbnail aspect ratio.
 */
export function estimateCardHeight(
  piece: PieceSummary,
  columnWidth: number,
): number {
  return getPieceCardLayout(piece, columnWidth).estimatedHeight;
}
