import { loadOpenCV, type OpenCV } from "@opencvjs/web";

// Singleton promise — WASM only loads once, subsequent calls return the same instance.
let cvPromise: Promise<typeof OpenCV> | null = null;
let cvReady = false;

export function getCv(): Promise<typeof OpenCV> {
  if (!cvPromise) {
    cvPromise = loadOpenCV().then((cv) => { cvReady = true; return cv; });
  }
  return cvPromise;
}

export function isCvReady(): boolean { return cvReady; }

// Kick off WASM download immediately so it's ready when the user needs it.
getCv();

// ---- Hint pixel encoding ----
// Orange (R>160, B<80) = GC_FGD; slate-blue (R<80, B>120) = GC_BGD.
// These are visually distinct and detectable from an RGBA canvas read-back.
export const HINT_FG_COLOR = "oklch(0.62 0.14 40)";
export const HINT_BG_COLOR = "oklch(0.55 0.06 240)";

function isHintFg(r: number, b: number): boolean { return r > 160 && b < 80; }
function isHintBg(r: number, b: number): boolean { return r < 80 && b > 120; }

// ---- GrabCut ----

export async function runGrabCut(
  srcCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  hintsCanvas: HTMLCanvasElement | null,
  rect: { x: number; y: number; w: number; h: number },
  iterations: number,
): Promise<void> {
  const cv = await getCv();

  const W = srcCanvas.width;
  const H = srcCanvas.height;

  const rgba = cv.matFromImageData(srcCanvas.getContext("2d")!.getImageData(0, 0, W, H));
  const rgb = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  rgba.delete();

  // Build GrabCut mask from existing mask canvas: treat current foreground as PR_FGD.
  const maskData = maskCanvas.getContext("2d")!.getImageData(0, 0, W, H);
  const gcMask = new cv.Mat(H, W, cv.CV_8UC1);
  for (let i = 0; i < W * H; i++) {
    gcMask.data[i] = maskData.data[i * 4 + 3] > 128 ? cv.GC_PR_FGD : cv.GC_PR_BGD;
  }

  // Overlay hard hint strokes: orange = GC_FGD, slate-blue = GC_BGD.
  let hasHints = false;
  if (hintsCanvas) {
    const hData = hintsCanvas.getContext("2d")!.getImageData(0, 0, W, H);
    for (let i = 0; i < W * H; i++) {
      if (hData.data[i * 4 + 3] < 128) continue;
      const r = hData.data[i * 4];
      const b = hData.data[i * 4 + 2];
      if (isHintFg(r, b)) { gcMask.data[i] = cv.GC_FGD; hasHints = true; }
      else if (isHintBg(r, b)) { gcMask.data[i] = cv.GC_BGD; hasHints = true; }
    }
  }

  const bgdModel = new cv.Mat();
  const fgdModel = new cv.Mat();
  const cvRect = new cv.Rect(
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.w),
    Math.round(rect.h),
  );

  // First run (no hints yet) uses GC_INIT_WITH_RECT for a clean initialisation.
  // Once hints are painted, switch to GC_EVAL so the hard pins are respected.
  const mode = hasHints ? cv.GC_EVAL : cv.GC_INIT_WITH_RECT;

  cv.grabCut(rgb, gcMask, cvRect, bgdModel, fgdModel, iterations, mode);

  // Write result back: GC_FGD(1) and GC_PR_FGD(3) → foreground.
  const maskCtx = maskCanvas.getContext("2d")!;
  const outData = maskCtx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const label = gcMask.data[i];
    const isFg = label === cv.GC_FGD || label === cv.GC_PR_FGD;
    outData.data[i * 4] = 220;
    outData.data[i * 4 + 1] = 90;
    outData.data[i * 4 + 2] = 40;
    outData.data[i * 4 + 3] = isFg ? 255 : 0;
  }
  maskCtx.putImageData(outData, 0, 0);

  rgb.delete();
  gcMask.delete();
  bgdModel.delete();
  fgdModel.delete();
}

// ---- Contour snap ----

export type SnapPoint = { x: number; y: number };

export async function snapVerticesToEdges(
  srcCanvas: HTMLCanvasElement,
  vertices: SnapPoint[],
  snapRadius: number,
  edgeThreshold: number,
  operator: "sobel" | "scharr" | "canny",
): Promise<SnapPoint[]> {
  const cv = await getCv();

  const W = srcCanvas.width;
  const H = srcCanvas.height;

  const rgba = cv.matFromImageData(srcCanvas.getContext("2d")!.getImageData(0, 0, W, H));
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();

  const edges = new cv.Mat();

  if (operator === "canny") {
    const lo = edgeThreshold * 128;
    cv.Canny(gray, edges, lo, lo * 2);
  } else {
    const gx = new cv.Mat();
    const gy = new cv.Mat();
    const absGx = new cv.Mat();
    const absGy = new cv.Mat();
    if (operator === "scharr") {
      cv.Sobel(gray, gx, cv.CV_16S, 1, 0, -1);
      cv.Sobel(gray, gy, cv.CV_16S, 0, 1, -1);
    } else {
      cv.Sobel(gray, gx, cv.CV_16S, 1, 0, 3);
      cv.Sobel(gray, gy, cv.CV_16S, 0, 1, 3);
    }
    cv.convertScaleAbs(gx, absGx);
    cv.convertScaleAbs(gy, absGy);
    cv.addWeighted(absGx, 0.5, absGy, 0.5, 0, edges);
    gx.delete(); gy.delete(); absGx.delete(); absGy.delete();
  }

  gray.delete();

  const minStrength = edgeThreshold * 255;

  const snapped = vertices.map((v) => {
    const cx = Math.round(v.x);
    const cy = Math.round(v.y);
    const r = Math.round(snapRadius);
    let bestX = v.x, bestY = v.y, bestStrength = minStrength;

    for (let py = Math.max(0, cy - r); py <= Math.min(H - 1, cy + r); py++) {
      for (let px = Math.max(0, cx - r); px <= Math.min(W - 1, cx + r); px++) {
        if ((px - cx) * (px - cx) + (py - cy) * (py - cy) > r * r) continue;
        const s = edges.data[py * W + px];
        if (s > bestStrength) { bestStrength = s; bestX = px; bestY = py; }
      }
    }
    return { x: bestX, y: bestY };
  });

  edges.delete();
  return snapped;
}
