import { loadOpenCV, type OpenCV } from "@opencvjs/web";

// Singleton promise — WASM only loads once, subsequent calls return the same instance.
let cvPromise: Promise<typeof OpenCV> | null = null;

export function getCv(): Promise<typeof OpenCV> {
  if (!cvPromise) cvPromise = loadOpenCV();
  return cvPromise;
}

// ---- GrabCut ----

export async function runGrabCut(
  srcCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
  rect: { x: number; y: number; w: number; h: number },
  iterations: number,
): Promise<void> {
  const cv = await getCv();

  const W = srcCanvas.width;
  const H = srcCanvas.height;

  // Read source image pixels into a cv.Mat (RGBA → RGB)
  const srcCtx = srcCanvas.getContext("2d")!;
  const srcData = srcCtx.getImageData(0, 0, W, H);

  // Build RGB Mat from RGBA data
  const rgba = cv.matFromImageData(srcData);
  const rgb = new cv.Mat();
  cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB);
  rgba.delete();

  // Build grabcut mask from current mask canvas (alpha>128 → GC_FGD, else GC_PR_BGD)
  const maskCtx = maskCanvas.getContext("2d")!;
  const maskData = maskCtx.getImageData(0, 0, W, H);
  const gcMask = new cv.Mat(H, W, cv.CV_8UC1);
  for (let i = 0; i < W * H; i++) {
    // alpha channel is at index i*4+3
    gcMask.data[i] = maskData.data[i * 4 + 3] > 128 ? cv.GC_FGD : cv.GC_PR_BGD;
  }

  const bgdModel = new cv.Mat();
  const fgdModel = new cv.Mat();

  const cvRect = new cv.Rect(
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.w),
    Math.round(rect.h),
  );

  // First run uses GC_INIT_WITH_RECT; if mask already has FGD pixels use GC_INIT_WITH_MASK
  const hasMask = maskData.data.some((_, i) => i % 4 === 3 && maskData.data[i] > 128);
  const mode = hasMask ? cv.GC_EVAL : cv.GC_INIT_WITH_RECT;

  cv.grabCut(rgb, gcMask, cvRect, bgdModel, fgdModel, iterations, mode);

  // Write result back to mask canvas: GC_FGD(1) and GC_PR_FGD(3) → foreground
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

  const srcCtx = srcCanvas.getContext("2d")!;
  const srcData = srcCtx.getImageData(0, 0, W, H);

  const rgba = cv.matFromImageData(srcData);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();

  const edges = new cv.Mat();

  if (operator === "canny") {
    const lo = edgeThreshold * 128;
    const hi = lo * 2;
    cv.Canny(gray, edges, lo, hi);
  } else {
    // Sobel / Scharr — compute gradient magnitude
    const gx = new cv.Mat();
    const gy = new cv.Mat();
    const absGx = new cv.Mat();
    const absGy = new cv.Mat();
    if (operator === "scharr") {
      cv.Sobel(gray, gx, cv.CV_16S, 1, 0, -1); // ksize=-1 uses Scharr
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

  // For each vertex, find the strongest edge pixel within snapRadius
  const snapped = vertices.map((v) => {
    const cx = Math.round(v.x);
    const cy = Math.round(v.y);
    const r = Math.round(snapRadius);

    let bestX = v.x;
    let bestY = v.y;
    let bestStrength = minStrength;

    const x0 = Math.max(0, cx - r);
    const x1 = Math.min(W - 1, cx + r);
    const y0 = Math.max(0, cy - r);
    const y1 = Math.min(H - 1, cy + r);

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        // Stay within circle
        if ((px - cx) * (px - cx) + (py - cy) * (py - cy) > r * r) continue;
        const strength = edges.data[py * W + px];
        if (strength > bestStrength) {
          bestStrength = strength;
          bestX = px;
          bestY = py;
        }
      }
    }

    return { x: bestX, y: bestY };
  });

  edges.delete();
  return snapped;
}
