import type { Point } from "./maskEditorState";

// ---- Brush painting ----

export function paintCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  erase: boolean,
  color = "oklch(0.62 0.14 40)",
) {
  ctx.save();
  if (erase) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Polygon fill ----

export function fillPolygon(
  maskCanvas: HTMLCanvasElement,
  vertices: Point[],
  mode: "add" | "subtract",
) {
  if (vertices.length < 3) return;
  const ctx = maskCanvas.getContext("2d")!;
  ctx.save();
  if (mode === "subtract") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "oklch(0.62 0.14 40)";
  }
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- Polygon smooth (Laplacian, 3 passes) ----

export function smoothPolygon(vertices: Point[], passes = 3): Point[] {
  let verts = [...vertices];
  for (let iter = 0; iter < passes; iter++) {
    verts = verts.map((v, i) => {
      const prev = verts[(i - 1 + verts.length) % verts.length];
      const next = verts[(i + 1) % verts.length];
      return {
        x: 0.25 * prev.x + 0.5 * v.x + 0.25 * next.x,
        y: 0.25 * prev.y + 0.5 * v.y + 0.25 * next.y,
      };
    });
  }
  return verts;
}

// ---- Douglas-Peucker simplification ----

function perpDist(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len;
}

export function douglasPeucker(pts: Point[], eps: number): Point[] {
  if (pts.length <= 2) return pts;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[0], pts[pts.length - 1], pts[i]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > eps) {
    return [
      ...douglasPeucker(pts.slice(0, maxIdx + 1), eps).slice(0, -1),
      ...douglasPeucker(pts.slice(maxIdx), eps),
    ];
  }
  return [pts[0], pts[pts.length - 1]];
}

export function simplifyPolygon(vertices: Point[], eps: number): Point[] {
  if (vertices.length <= 3) return vertices;
  // Close the loop, simplify, reopen
  const closed = [...vertices, vertices[0]];
  const simplified = douglasPeucker(closed, eps);
  return simplified.slice(0, -1); // remove the repeated first point
}

// ---- Flood fill ----

export function floodFill(
  maskCanvas: HTMLCanvasElement,
  srcCanvas: HTMLCanvasElement,
  seedX: number,
  seedY: number,
  tolerance: number,
  connectivity: "4" | "8",
  mode: "add" | "subtract",
) {
  const W = maskCanvas.width;
  const H = maskCanvas.height;
  const maskCtx = maskCanvas.getContext("2d")!;
  const srcCtx = srcCanvas.getContext("2d")!;
  const maskData = maskCtx.getImageData(0, 0, W, H);
  const srcData = srcCtx.getImageData(0, 0, W, H);

  const sx = Math.round(Math.max(0, Math.min(W - 1, seedX)));
  const sy = Math.round(Math.max(0, Math.min(H - 1, seedY)));

  const seedOff = (sy * W + sx) * 4;
  const seedR = srcData.data[seedOff];
  const seedG = srcData.data[seedOff + 1];
  const seedB = srcData.data[seedOff + 2];

  const paintAlpha = mode === "add" ? 255 : 0;
  const tolSq = tolerance * tolerance * 3;

  const visited = new Uint8Array(W * H);
  const queue: number[] = [sy * W + sx];
  visited[sy * W + sx] = 1;

  const DIRS4 = [-1, 1, -W, W];
  const DIRS8 = [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1];
  const dirs = connectivity === "4" ? DIRS4 : DIRS8;

  while (queue.length > 0) {
    const pos = queue.pop()!;
    const off = pos * 4;

    const dr = srcData.data[off] - seedR;
    const dg = srcData.data[off + 1] - seedG;
    const db = srcData.data[off + 2] - seedB;
    if (dr * dr + dg * dg + db * db > tolSq) continue;

    maskData.data[off + 3] = paintAlpha;

    const px = pos % W;
    const py = Math.floor(pos / W);

    for (const d of dirs) {
      const npos = pos + d;
      if (npos < 0 || npos >= W * H) continue;
      const nx = npos % W;
      const ny = Math.floor(npos / W);
      if (Math.abs(nx - px) > 1 || Math.abs(ny - py) > 1) continue;
      if (visited[npos]) continue;
      visited[npos] = 1;
      queue.push(npos);
    }
  }

  maskCtx.putImageData(maskData, 0, 0);
}
