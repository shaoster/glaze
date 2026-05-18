import type { PieceSummary } from "../util/types";

export const CARD_CHROME_HEIGHT = 60; // border (2) + body padding (18) + title (~20) + caption (~20)
export const DEFAULT_CARD_HEIGHT_ESTIMATE = 260;

export function getThumbnailAspectRatio(piece: PieceSummary): string | undefined {
  const crop = piece.thumbnail?.crop;
  if (crop && crop.width > 0 && crop.height > 0) {
    return `${crop.width} / ${crop.height}`;
  }
  return undefined;
}

/**
 * Estimates the rendered card height from the thumbnail crop aspect ratio.
 * Falls back to DEFAULT_CARD_HEIGHT_ESTIMATE when no crop is available.
 */
export function estimateCardHeight(piece: PieceSummary, columnWidth: number): number {
  const crop = piece.thumbnail?.crop;
  if (crop && crop.width > 0) {
    return Math.round((columnWidth * crop.height) / crop.width) + CARD_CHROME_HEIGHT;
  }
  return DEFAULT_CARD_HEIGHT_ESTIMATE;
}
