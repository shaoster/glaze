/**
 * Unit tests for the pure OCR detection functions in ocrDetection.ts.
 *
 * Test images (web/public/test-images/*.png) show the three scenarios these
 * tests cover:
 *   - test-tile-label.png:        clay background + pink/salmon label sticker
 *                                 in the bottom third with three lines of dark text
 *   - test-tile-no-label.png:     uniform clay background, no sticker
 *   - test-tile-blank-label.png:  white label sticker in bottom third, no text
 *
 * The functions under test are pure (accept pixel arrays, no DOM), so tests
 * construct equivalent synthetic RGBA arrays instead of loading the PNGs at
 * runtime.
 */

import { describe, expect, it } from "vitest";
import {
  clampOcrRegion,
  defaultOcrRegion,
  detectLabelRectFromData,
  ocrRegionFromLabelData,
  DETECT_OCR_ANALYSIS_SIZE,
  DETECT_OCR_LABEL_WHITE_THRESHOLD,
  DETECT_OCR_TEXT_DARK_THRESHOLD,
  DETECT_OCR_TEXT_ANALYSIS_SIZE,
  DETECT_OCR_LABEL_INSET,
} from "../ocrDetection";

// ---------------------------------------------------------------------------
// Helpers for building synthetic RGBA pixel grids
// ---------------------------------------------------------------------------

/** Fill an N×N RGBA buffer entirely with one colour. */
function solidGrid(N: number, r: number, g: number, b: number): number[] {
  const data: number[] = [];
  for (let i = 0; i < N * N; i++) data.push(r, g, b, 255);
  return data;
}

/** Paint a rectangle [r1..r2] × [c1..c2] in an existing N×N RGBA buffer. */
function paintRect(
  data: number[],
  N: number,
  r1: number,
  r2: number,
  c1: number,
  c2: number,
  r: number,
  g: number,
  b: number,
) {
  for (let row = r1; row <= r2; row++) {
    for (let col = c1; col <= c2; col++) {
      const i = (row * N + col) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
}

// Luminance helper for assertions.
function lum(r: number, g: number, b: number) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// ---------------------------------------------------------------------------
// defaultOcrRegion
// ---------------------------------------------------------------------------

describe("defaultOcrRegion", () => {
  it("places the region in the bottom third", () => {
    const region = defaultOcrRegion(400);
    // y should be at or past the 2/3 mark
    expect(region.y).toBeGreaterThanOrEqual(Math.round(400 * (2 / 3)));
    expect(region.y + region.height).toBeLessThanOrEqual(400);
  });

  it("centres the region horizontally", () => {
    const cropSize = 300;
    const region = defaultOcrRegion(cropSize);
    expect(region.x).toBe(Math.round((cropSize - region.width) / 2));
  });
});

// ---------------------------------------------------------------------------
// clampOcrRegion
// ---------------------------------------------------------------------------

describe("clampOcrRegion", () => {
  it("clamps x/y so the region stays inside the crop", () => {
    const r = clampOcrRegion(200, { x: -10, y: -5, width: 100, height: 50, rotation: 0 });
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("clamps width/height to the crop size", () => {
    const r = clampOcrRegion(100, { x: 0, y: 0, width: 300, height: 400, rotation: 0 });
    expect(r.width).toBe(100);
    expect(r.height).toBe(100);
  });

  it("enforces a minimum size of 16 px", () => {
    const r = clampOcrRegion(200, { x: 0, y: 0, width: 4, height: 2, rotation: 0 });
    expect(r.width).toBe(16);
    expect(r.height).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// detectLabelRectFromData — phase 1 (Kadane 2D)
// ---------------------------------------------------------------------------

describe("detectLabelRectFromData", () => {
  const N = DETECT_OCR_ANALYSIS_SIZE; // 128

  // Matches the scenario in test-tile-label.png:
  // clay background (~0.55 lum), pink/salmon label (~0.82 lum) in bottom third.
  it("detects a bright label rectangle in the bottom third", () => {
    // Clay background: rgb(160,120,80) → lum ≈ 0.56 (below threshold)
    const data = solidGrid(N, 160, 120, 80);

    // White/salmon label sticker: rgb(215,190,180) → lum ≈ 0.82 (above 0.75)
    // Place it at rows 90-115 (bottom third starts at ~85), cols 20-108.
    const labelR1 = 90, labelR2 = 115, labelC1 = 20, labelC2 = 108;
    paintRect(data, N, labelR1, labelR2, labelC1, labelC2, 215, 190, 180);

    const rect = detectLabelRectFromData(data, N);
    expect(rect).not.toBeNull();
    // The result should be eroded inward by DETECT_OCR_LABEL_INSET on each side.
    if (!rect) return; // narrow for TypeScript
    expect(rect.r1).toBe(labelR1 + DETECT_OCR_LABEL_INSET);
    expect(rect.r2).toBe(labelR2 - DETECT_OCR_LABEL_INSET);
    expect(rect.c1).toBe(labelC1 + DETECT_OCR_LABEL_INSET);
    expect(rect.c2).toBe(labelC2 - DETECT_OCR_LABEL_INSET);
  });

  // Matches test-tile-no-label.png: uniform clay, nothing bright enough.
  it("returns null when there is no bright label (uniform clay background)", () => {
    const data = solidGrid(N, 150, 110, 75); // lum ≈ 0.52
    expect(detectLabelRectFromData(data, N)).toBeNull();
  });

  it("returns null when a bright region is only in the top two thirds", () => {
    const data = solidGrid(N, 160, 120, 80); // dark clay
    // White rectangle only in the upper two thirds — should be ignored.
    paintRect(data, N, 10, 60, 10, 100, 240, 240, 238);
    expect(detectLabelRectFromData(data, N)).toBeNull();
  });

  it("ignores a bright region that is too small (below min fraction)", () => {
    const data = solidGrid(N, 160, 120, 80);
    // Tiny white speck — less than 10% of N in each dimension.
    paintRect(data, N, 90, 92, 50, 55, 240, 240, 238);
    expect(detectLabelRectFromData(data, N)).toBeNull();
  });

  it("handles a custom lower threshold (catches dimmer backgrounds)", () => {
    // Background at lum ≈ 0.56, label at lum ≈ 0.72 — below default 0.75 threshold.
    const data = solidGrid(N, 160, 120, 80);
    paintRect(data, N, 88, 115, 15, 110, 185, 185, 165); // lum ≈ 0.72
    // Default threshold misses it:
    expect(detectLabelRectFromData(data, N, 0.75)).toBeNull();
    // Lowered threshold finds it:
    expect(detectLabelRectFromData(data, N, 0.68)).not.toBeNull();
  });

  it("returns correct luminance check boundary", () => {
    // Verify our lum() helper agrees with the threshold constant.
    expect(lum(215, 190, 180)).toBeGreaterThan(DETECT_OCR_LABEL_WHITE_THRESHOLD);
    expect(lum(160, 120, 80)).toBeLessThan(DETECT_OCR_LABEL_WHITE_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// ocrRegionFromLabelData — phase 2 (projection profiles)
// ---------------------------------------------------------------------------

describe("ocrRegionFromLabelData", () => {
  const N1 = DETECT_OCR_ANALYSIS_SIZE;       // 128
  const N2 = DETECT_OCR_TEXT_ANALYSIS_SIZE;  // 512
  const CROP_SIZE = 400;

  // Matches the scenario in test-tile-label.png:
  // white label background, three lines of dark text within it.
  it("clamps the bounding box to ink pixels within the label", () => {
    // Build an N2×N2 grid: white label from rows 360-460, cols 80-430.
    const data = solidGrid(N2, 230, 210, 200); // light label background, lum ≈ 0.87

    // Three rows of dark text at rows 380-385, 395-400, 410-415.
    // Span columns 100-400 (wide enough to clear the 1% projection threshold).
    for (const [tr1, tr2] of [[380, 385], [395, 400], [410, 415]] as const) {
      paintRect(data, N2, tr1, tr2, 100, 400, 30, 20, 15); // near-black text
    }

    // Phase-1 label rect expressed in N1 coordinates.
    // Rows 360-460 in N2 = rows 90-115 in N1 (÷4).
    // Cols 80-430 in N2 = cols 20-107 in N1 (÷4).
    const labelRect = { r1: 90, r2: 115, c1: 20, c2: 107 };

    const region = ocrRegionFromLabelData(
      data,
      N1,
      N2,
      labelRect,
      CROP_SIZE,
      DETECT_OCR_TEXT_DARK_THRESHOLD,
    );

    // The OCR region should be much smaller than the full label rect and
    // contain the text rows (380-415 in N2 ≈ rows 297-324 in crop pixels).
    const labelN2Top = Math.floor(90 * 4);    // 360
    const textN2Top = 380;
    const cropScale = CROP_SIZE / N2;

    // y should be at or above the first text row, not at the top of the label.
    expect(region.y).toBeGreaterThanOrEqual(Math.round((textN2Top - 12 /* pad */) * cropScale));
    expect(region.y).toBeLessThan(Math.round(labelN2Top * cropScale) + 40);

    // Height should be much less than the full label height.
    // Full label: rows 90-115 in N1 → 360-463 in N2 → ~81 crop px.
    // Text rows only span ~47 crop px (well under 70% of the label).
    const fullLabelCropPx = Math.round(((115 - 90 + 2) * 4) * cropScale); // +2 ceil rounding
    expect(region.height).toBeLessThan(fullLabelCropPx * 0.7);
  });

  // Matches test-tile-blank-label.png: white label, no text → should fall back.
  it("falls back to the full label rect when no ink pixels are found", () => {
    // White label background, no dark pixels.
    const data = solidGrid(N2, 240, 240, 238);
    const labelRect = { r1: 90, r2: 115, c1: 20, c2: 107 };

    const region = ocrRegionFromLabelData(
      data,
      N1,
      N2,
      labelRect,
      CROP_SIZE,
      DETECT_OCR_TEXT_DARK_THRESHOLD,
    );

    // Fallback maps label rect to crop coords.
    const upscale = N2 / N1;
    const lc1 = Math.floor(20 * upscale);
    const lr1 = Math.floor(90 * upscale);
    expect(region.x).toBe(Math.round(lc1 * (CROP_SIZE / N2)));
    expect(region.y).toBe(Math.round(lr1 * (CROP_SIZE / N2)));
  });

  it("rejects isolated dust specks that do not clear the projection threshold", () => {
    // White label.
    const data = solidGrid(N2, 230, 210, 200);
    const labelRect = { r1: 90, r2: 115, c1: 20, c2: 107 };

    // Single-pixel specks scattered around the label — each row/col has
    // ≤1 dark pixel so projection profiles reject them.
    for (const [pr, pc] of [[360, 100], [365, 200], [370, 300], [450, 150]] as const) {
      paintRect(data, N2, pr, pr, pc, pc, 10, 10, 10);
    }

    // Should fall back because no row/col clears the 1% threshold.
    const region = ocrRegionFromLabelData(
      data,
      N1,
      N2,
      labelRect,
      CROP_SIZE,
      DETECT_OCR_TEXT_DARK_THRESHOLD,
    );

    // Fallback: region matches the full label rect in crop coords.
    const upscale = N2 / N1;
    const lr1 = Math.floor(90 * upscale);
    expect(region.y).toBe(Math.round(lr1 * (CROP_SIZE / N2)));
  });

  it("tightens the box when the text sensitivity slider increases (threshold decreases)", () => {
    // White label with moderately dark text (lum ≈ 0.40) plus very dark text (lum ≈ 0.06).
    const data = solidGrid(N2, 230, 210, 200);
    const labelRect = { r1: 90, r2: 115, c1: 20, c2: 107 };

    // Very dark text (lum ≈ 0.06) at rows 380-385, cols 100-400.
    paintRect(data, N2, 380, 385, 100, 400, 15, 15, 15);
    // Medium text (lum ≈ 0.40) at rows 430-435, cols 100-400.
    paintRect(data, N2, 430, 435, 100, 400, 102, 102, 102);

    const regionLoose = ocrRegionFromLabelData(
      data, N1, N2, labelRect, CROP_SIZE, 0.50, // catches both bands
    );
    const regionTight = ocrRegionFromLabelData(
      data, N1, N2, labelRect, CROP_SIZE, 0.35, // only catches the dark band
    );

    // Tighter threshold → smaller height (only the dark text band).
    expect(regionTight.height).toBeLessThan(regionLoose.height);
  });
});
