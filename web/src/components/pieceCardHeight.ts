import type { PieceSummary } from "../util/types";

export const CARD_CHROME_HEIGHT = 60; // border (2) + body padding (18) + title (~20) + caption (~20)

/**
 * Estimates the rendered card height from the thumbnail crop aspect ratio.
 * Falls back to 260 when no crop is available.
 */
export function estimateCardHeight(piece: PieceSummary, columnWidth: number): number {
  const crop = piece.thumbnail?.crop;
  if (crop && crop.width > 0) {
    return Math.round((columnWidth * crop.height) / crop.width) + CARD_CHROME_HEIGHT;
  }
  return 260;
}
