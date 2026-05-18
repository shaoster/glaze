import type { PieceSummary } from "../util/types";

// Border, body padding, title, activity caption, and the tag row all live
// below the thumbnail, so this needs to be closer to the full card chrome.
export const CARD_CHROME_HEIGHT = 112;
export const DEFAULT_CARD_HEIGHT_ESTIMATE = 260;

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
