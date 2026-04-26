// Pure OCR region detection logic, extracted for testability.
// The async wrappers that call canvas/image APIs remain in GlazeImportToolPage.tsx;
// these functions accept pre-rendered pixel data so they can be tested without a DOM.

export type CropSquare = {
  x: number;
  y: number;
  size: number;
  rotation: number;
};

export type OcrRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

// Grid-space coordinates of the white label rectangle found by Kadane 2D.
export type LabelRect = { r1: number; r2: number; c1: number; c2: number };

// Resolution used for phase 1 (Kadane 2D label detection).
export const DETECT_OCR_ANALYSIS_SIZE = 128;

// Resolution used for phase 2 (text bbox clamping).
export const DETECT_OCR_TEXT_ANALYSIS_SIZE = 512;

export const DETECT_OCR_LABEL_WHITE_THRESHOLD = 0.75;
export const DETECT_OCR_TEXT_DARK_THRESHOLD = 0.5;

// Pixels to erode inward from each edge of the Kadane 2D result before
// passing to phase 2 — excludes the sticker border contour.
export const DETECT_OCR_LABEL_INSET = 2;

const DETECT_OCR_WHITE_SCORE = 1;
const DETECT_OCR_NONWHITE_PENALTY = -0.4;
const DETECT_OCR_TEXT_PAD = 3;
const DETECT_OCR_MIN_LABEL_FRACTION = 0.1;

export const MIN_OCR_REGION_SIZE = 16;

/**
 * Clamp an OcrRegion so all values are within [0, cropSize].
 */
export function clampOcrRegion(cropSize: number, region: OcrRegion): OcrRegion {
  const width = Math.max(
    MIN_OCR_REGION_SIZE,
    Math.min(Math.round(region.width), cropSize),
  );
  const height = Math.max(
    MIN_OCR_REGION_SIZE,
    Math.min(Math.round(region.height), cropSize),
  );
  return {
    ...region,
    x: Math.max(0, Math.min(Math.round(region.x), cropSize - width)),
    y: Math.max(0, Math.min(Math.round(region.y), cropSize - height)),
    width,
    height,
  };
}

/**
 * Default OCR region: bottom third of the crop, centred horizontally.
 */
export function defaultOcrRegion(cropSize: number): OcrRegion {
  const width = Math.round(cropSize * 0.7);
  const height = Math.round(cropSize * 0.25);
  const y = Math.round(cropSize * (2 / 3));
  return {
    x: Math.round((cropSize - width) / 2),
    y,
    width,
    height,
    rotation: 0,
  };
}

/**
 * Phase 1 (pure): given RGBA pixel data for an N×N grid, find the maximum-sum
 * white-label rectangle in the bottom third using Kadane 2D.
 *
 * Returns null when no sufficiently large bright rectangle is found.
 */
export function detectLabelRectFromData(
  data: Uint8ClampedArray | number[],
  N: number,
  labelWhiteThreshold = DETECT_OCR_LABEL_WHITE_THRESHOLD,
): LabelRect | null {
  const score = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    score[i] =
      lum >= labelWhiteThreshold
        ? DETECT_OCR_WHITE_SCORE
        : DETECT_OCR_NONWHITE_PENALTY;
  }

  // Restrict search to the bottom third.
  const rowSearchStart = Math.floor((N * 2) / 3);

  let bestTotal = 0;
  let r1Best = rowSearchStart,
    r2Best = N - 1,
    c1Best = 0,
    c2Best = N - 1;
  let foundLabel = false;

  const colSum = new Float32Array(N);
  for (let r1 = rowSearchStart; r1 < N; r1++) {
    colSum.fill(0);
    for (let r2 = r1; r2 < N; r2++) {
      const rowOffset = r2 * N;
      for (let c = 0; c < N; c++) colSum[c] += score[rowOffset + c];
      let curTotal = 0;
      let curC1 = 0;
      for (let c = 0; c < N; c++) {
        if (curTotal <= 0) {
          curTotal = 0;
          curC1 = c;
        }
        curTotal += colSum[c];
        if (curTotal > bestTotal) {
          bestTotal = curTotal;
          r1Best = r1;
          r2Best = r2;
          c1Best = curC1;
          c2Best = c;
          foundLabel = true;
        }
      }
    }
  }

  if (
    !foundLabel ||
    r2Best - r1Best < N * DETECT_OCR_MIN_LABEL_FRACTION ||
    c2Best - c1Best < N * DETECT_OCR_MIN_LABEL_FRACTION
  ) {
    return null;
  }

  // Erode inward so the sticker border is excluded from phase 2.
  const inset = DETECT_OCR_LABEL_INSET;
  return {
    r1: r1Best + inset,
    r2: r2Best - inset,
    c1: c1Best + inset,
    c2: c2Best - inset,
  };
}

/**
 * Phase 2 (pure): given RGBA pixel data for an N2×N2 grid and a labelRect
 * expressed in N1 (phase-1) grid coordinates, find the tight bounding box of
 * ink pixels within the label using projection profiles.
 *
 * Returns a clamped OcrRegion in crop-pixel coordinates.
 * Falls back to the full label rect when no ink is found.
 */
export function ocrRegionFromLabelData(
  data: Uint8ClampedArray | number[],
  N1: number,
  N2: number,
  labelRect: LabelRect,
  cropSize: number,
  textDarkThreshold = DETECT_OCR_TEXT_DARK_THRESHOLD,
): OcrRegion {
  const upscale = N2 / N1;
  const { r1, r2, c1, c2 } = labelRect;

  // Map label rect from phase-1 to phase-2 grid coords.
  const lr1 = Math.floor(r1 * upscale);
  const lr2 = Math.ceil((r2 + 1) * upscale) - 1;
  const lc1 = Math.floor(c1 * upscale);
  const lc2 = Math.ceil((c2 + 1) * upscale) - 1;

  const cropToOcr = cropSize / N2;

  const fallback = (): OcrRegion =>
    clampOcrRegion(cropSize, {
      x: Math.round(lc1 * cropToOcr),
      y: Math.round(lr1 * cropToOcr),
      width: Math.round((lc2 - lc1 + 1) * cropToOcr),
      height: Math.round((lr2 - lr1 + 1) * cropToOcr),
      rotation: 0,
    });

  const labelW = lc2 - lc1 + 1;
  const labelH = lr2 - lr1 + 1;

  // Projection profiles: count dark pixels per row and per column.
  const rowCounts = new Int32Array(labelH);
  const colCounts = new Int32Array(labelW);
  for (let y = lr1; y <= lr2; y++) {
    for (let x = lc1; x <= lc2; x++) {
      const i = (y * N2 + x) * 4;
      const lum =
        (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
      if (lum < textDarkThreshold) {
        rowCounts[y - lr1]++;
        colCounts[x - lc1]++;
      }
    }
  }

  // Require ≥1% of perpendicular span to reject isolated dust specks.
  const minRowHits = Math.max(2, Math.round(labelW * 0.01));
  const minColHits = Math.max(2, Math.round(labelH * 0.01));

  let tMinY = -1,
    tMaxY = -1;
  for (let y = 0; y < labelH; y++) {
    if (rowCounts[y] >= minRowHits) {
      if (tMinY < 0) tMinY = y;
      tMaxY = y;
    }
  }
  let tMinX = -1,
    tMaxX = -1;
  for (let x = 0; x < labelW; x++) {
    if (colCounts[x] >= minColHits) {
      if (tMinX < 0) tMinX = x;
      tMaxX = x;
    }
  }

  if (tMinY < 0 || tMinX < 0) return fallback();

  const pad = DETECT_OCR_TEXT_PAD * upscale;
  const rxMin = Math.max(lc1, lc1 + tMinX - pad);
  const rxMax = Math.min(lc2, lc1 + tMaxX + pad);
  const ryMin = Math.max(lr1, lr1 + tMinY - pad);
  const ryMax = Math.min(lr2, lr1 + tMaxY + pad);

  return clampOcrRegion(cropSize, {
    x: Math.round(rxMin * cropToOcr),
    y: Math.round(ryMin * cropToOcr),
    width: Math.round((rxMax - rxMin + 1) * cropToOcr),
    height: Math.round((ryMax - ryMin + 1) * cropToOcr),
    rotation: 0,
  });
}
