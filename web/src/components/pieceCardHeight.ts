import type { PieceSummary } from "../util/types";

// Border, body padding, title, activity caption, and the tag row all live
// below the thumbnail, so this needs to be closer to the full card chrome.
export const CARD_CHROME_HEIGHT = 112;

// Fallback aspect ratio used when a piece has no thumbnail crop.
// Must stay in sync with the requestedHeight passed to CloudinaryImage so the
// Cloudinary fill request and the masonic height estimate agree.
export const DEFAULT_THUMBNAIL_ASPECT_WIDTH = 4;
export const DEFAULT_THUMBNAIL_ASPECT_HEIGHT = 3;

export const DEFAULT_CARD_HEIGHT_ESTIMATE =
  Math.round(
    (220 * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) / DEFAULT_THUMBNAIL_ASPECT_WIDTH,
  ) + CARD_CHROME_HEIGHT; // 165 + 112 = 277 for a 220px column

// Always returns an aspect-ratio CSS string. When original image dimensions are
// stored, uses (crop.width * origW) / (crop.height * origH) — the true pixel
// aspect ratio of the cropped region. Falls back to the naive crop fraction when
// dimensions are absent, and to 4:3 when there is no crop.
export function getThumbnailAspectRatio(piece: PieceSummary): string {
  const crop = piece.thumbnail?.crop;
  const origW = piece.thumbnail?.width;
  const origH = piece.thumbnail?.height;
  if (crop && crop.width > 0 && crop.height > 0) {
    if (origW && origH) {
      return `${crop.width * origW} / ${crop.height * origH}`;
    }
    return `${crop.width} / ${crop.height}`;
  }
  return `${DEFAULT_THUMBNAIL_ASPECT_WIDTH} / ${DEFAULT_THUMBNAIL_ASPECT_HEIGHT}`;
}

/**
 * Estimates the rendered card height from the thumbnail crop aspect ratio.
 * When original image dimensions are available uses the true pixel ratio.
 */
export function estimateCardHeight(piece: PieceSummary, columnWidth: number): number {
  const crop = piece.thumbnail?.crop;
  const origW = piece.thumbnail?.width;
  const origH = piece.thumbnail?.height;
  if (crop && crop.width > 0) {
    if (origW && origH) {
      return Math.round((columnWidth * crop.height * origH) / (crop.width * origW)) + CARD_CHROME_HEIGHT;
    }
    return Math.round((columnWidth * crop.height) / crop.width) + CARD_CHROME_HEIGHT;
  }
  return Math.round((columnWidth * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) / DEFAULT_THUMBNAIL_ASPECT_WIDTH) + CARD_CHROME_HEIGHT;
}

/**
 * Returns the pixel height to request from Cloudinary for pieces without a valid crop,
 * or undefined for cropped pieces (Cloudinary infers height from the crop ratio).
 */
export function getThumbnailRequestedHeight(piece: PieceSummary, columnWidth: number): number | undefined {
  const crop = piece.thumbnail?.crop;
  if (crop && crop.width > 0) return undefined;
  return Math.round((columnWidth * DEFAULT_THUMBNAIL_ASPECT_HEIGHT) / DEFAULT_THUMBNAIL_ASPECT_WIDTH);
}
