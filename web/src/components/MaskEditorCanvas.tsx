import { useRef, useEffect, useState } from "react";
import type { Dispatch } from "react";
import { Pill } from "./MaskEditorShared";
import { T } from "./maskEditorTokens";
import type { MaskEditorState, MaskEditorAction, ToolName, Point } from "./maskEditorState";

// ---- Coordinate helpers ----

function canvasPoint(
  canvas: HTMLCanvasElement,
  e: PointerEvent | MouseEvent,
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / rect.width,
    y: ((e.clientY - rect.top) * canvas.height) / rect.height,
  };
}

// ---- Brush painting ----

function paintCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  erase: boolean,
) {
  ctx.save();
  if (erase) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = T.accent;
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Flood fill ----

function floodFill(
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
  // Tolerance maps 0–255 to squared Euclidean distance in RGB space (0–255 each)
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
      // Prevent wrap-around at row edges
      if (Math.abs(nx - px) > 1 || Math.abs(ny - py) > 1) continue;
      if (visited[npos]) continue;
      visited[npos] = 1;
      queue.push(npos);
    }
  }

  maskCtx.putImageData(maskData, 0, 0);
}

// ---- Polygon fill ----

function fillPolygon(
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
    ctx.fillStyle = T.accent;
  }
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) {
    ctx.lineTo(vertices[i].x, vertices[i].y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- Overlay canvas drawing ----

function drawBrushCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  erase: boolean,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = erase ? T.slate : T.accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  // Center dot
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = erase ? T.slate : T.accent;
  ctx.setLineDash([]);
  ctx.fill();
  ctx.restore();
}

function drawPolygonOverlay(
  ctx: CanvasRenderingContext2D,
  vertices: Point[],
  selectedVertex: number | null,
  hoverPoint: Point | null,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (vertices.length === 0) return;

  ctx.save();

  // Fill preview
  if (vertices.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.fillStyle = T.accentTint;
    ctx.fill();
  }

  // Edges
  ctx.beginPath();
  ctx.moveTo(vertices[0].x, vertices[0].y);
  for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
  if (vertices.length >= 3) ctx.closePath();
  ctx.strokeStyle = T.accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.stroke();

  // Preview line to cursor
  if (hoverPoint && vertices.length > 0) {
    const last = vertices[vertices.length - 1];
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(hoverPoint.x, hoverPoint.y);
    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Vertex handles
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    const isSel = i === selectedVertex;
    const size = isSel ? 10 : 6;
    ctx.fillStyle = isSel ? T.accent : T.bg;
    ctx.strokeStyle = isSel ? T.text : T.accent;
    ctx.lineWidth = 1.5;
    ctx.fillRect(v.x - size / 2, v.y - size / 2, size, size);
    ctx.strokeRect(v.x - size / 2, v.y - size / 2, size, size);
  }

  ctx.restore();
}

function drawGrabCutOverlay(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number } | null,
  dragging: { x: number; y: number; w: number; h: number } | null,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const r = dragging ?? rect;
  if (!r || r.w === 0 || r.h === 0) return;

  const { x, y, w, h } = r;
  ctx.save();
  ctx.strokeStyle = T.text;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);

  // Corner handles
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]] as [number, number][]) {
    ctx.fillStyle = T.text;
    ctx.fillRect(cx - 3, cy - 3, 6, 6);
  }

  // Size label
  ctx.fillStyle = T.bg2;
  ctx.fillRect(x, y - 18, 80, 16);
  ctx.fillStyle = T.textDim;
  ctx.font = `9px ${T.fontMono}`;
  ctx.fillText(`${Math.round(Math.abs(w))}×${Math.round(Math.abs(h))}`, x + 4, y - 6);
  ctx.restore();
}

// ---- Context strip ----

function ContextStrip({
  tool,
  cursor,
  brushRadius,
  brushMode,
  floodTolerance,
  floodMode,
  floodConnectivity,
  polygonVertices,
  polygonSimplifyEps,
  grabcutRect,
  grabcutIterations,
  snapEdgeOperator,
  snapRadius,
  snapEdgeThreshold,
}: {
  tool: ToolName;
  cursor: Point | null;
  brushRadius: number;
  brushMode: "paint" | "erase";
  floodTolerance: number;
  floodMode: "add" | "subtract";
  floodConnectivity: "4" | "8";
  polygonVertices: Point[];
  polygonSimplifyEps: number;
  grabcutRect: { x: number; y: number; w: number; h: number } | null;
  grabcutIterations: number;
  snapEdgeOperator: string;
  snapRadius: number;
  snapEdgeThreshold: number;
}) {
  const cx = cursor ? Math.round(cursor.x) : 0;
  const cy = cursor ? Math.round(cursor.y) : 0;

  const leftText: Record<ToolName, string> = {
    prefill: "PRE-FILL · applying candidate mask",
    brush: `BRUSH · r ${brushRadius} · ${brushMode}`,
    polygon: `POLY · ${polygonVertices.length} vertices · ε ${polygonSimplifyEps}`,
    flood: `FLOOD · ${floodMode} · tol ${floodTolerance} · ${floodConnectivity}-way`,
    grabcut: grabcutRect
      ? `GRABCUT · rect ${Math.round(grabcutRect.w)}×${Math.round(grabcutRect.h)} · iter ${grabcutIterations}`
      : "GRABCUT · drag to set rect",
    snap: `SNAP · ${snapEdgeOperator} · r ${snapRadius} · τ ${snapEdgeThreshold}`,
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 14px",
        background: T.bg1,
        borderTop: `1px solid ${T.lineSoft}`,
        fontFamily: T.fontMono,
        fontSize: 10,
        color: T.textMute,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      <span style={{ color: T.textDim }}>{leftText[tool]}</span>
      <span>{cursor ? `cursor ${cx}, ${cy}` : ""}</span>
    </div>
  );
}

// ---- Tool label ----
const TOOL_LABELS: Record<ToolName, string> = {
  prefill: "PRE-FILL",
  brush: "BRUSH",
  polygon: "POLYGON",
  flood: "FLOOD FILL",
  grabcut: "GRABCUT",
  snap: "CONTOUR SNAP",
};

// ---- Main component ----

interface MaskEditorCanvasProps {
  state: MaskEditorState;
  dispatch: Dispatch<MaskEditorAction>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  candidateMask?: string | null;
  onPushUndo: (snapshot: ImageData) => void;
}

export default function MaskEditorCanvas({
  state,
  dispatch,
  maskCanvasRef,
  overlayCanvasRef,
  imageUrl,
  imageWidth,
  imageHeight,
  candidateMask,
  onPushUndo,
}: MaskEditorCanvasProps) {
  const tool = state.activeTool;
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPainting = useRef(false);
  const dragRect = useRef<{ startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null);
  const draggingVertexIdx = useRef<number | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);

  // ---- Initialize canvas dimensions ----
  useEffect(() => {
    const mask = maskCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!mask || !overlay) return;
    mask.width = imageWidth;
    mask.height = imageHeight;
    overlay.width = imageWidth;
    overlay.height = imageHeight;
  }, [imageWidth, imageHeight, maskCanvasRef, overlayCanvasRef]);

  // ---- Load source image into offscreen canvas for flood fill pixel access ----
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = imageWidth;
      c.height = imageHeight;
      c.getContext("2d")!.drawImage(img, 0, 0, imageWidth, imageHeight);
      srcCanvasRef.current = c;
    };
    img.src = imageUrl;
  }, [imageUrl, imageWidth, imageHeight]);

  // ---- Load candidateMask onto maskCanvas ----
  useEffect(() => {
    const mask = maskCanvasRef.current;
    if (!mask || !candidateMask) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ctx = mask.getContext("2d")!;
      ctx.clearRect(0, 0, mask.width, mask.height);
      // Draw mask — threshold alpha > 128 → paint foreground color
      const tmp = document.createElement("canvas");
      tmp.width = mask.width;
      tmp.height = mask.height;
      const tmpCtx = tmp.getContext("2d")!;
      tmpCtx.drawImage(img, 0, 0, mask.width, mask.height);
      const imgData = tmpCtx.getImageData(0, 0, mask.width, mask.height);
      const outData = ctx.createImageData(mask.width, mask.height);
      // Parse T.accent into RGBA for painting (approximate from oklch string — use warm orange)
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i + 3] > 128) {
          outData.data[i] = 220;
          outData.data[i + 1] = 90;
          outData.data[i + 2] = 40;
          outData.data[i + 3] = 255;
        }
      }
      ctx.putImageData(outData, 0, 0);
      dispatch({ type: "hydrate", hadMask: true });
    };
    img.src = candidateMask;
  }, [candidateMask, maskCanvasRef, dispatch]);

  // ---- Redraw polygon overlay ----
  useEffect(() => {
    if (tool !== "polygon") return;
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    drawPolygonOverlay(ctx, state.polygonVertices, state.selectedVertex, null);
  }, [tool, state.polygonVertices, state.selectedVertex, overlayCanvasRef]);

  // ---- Redraw grabcut overlay ----
  useEffect(() => {
    if (tool !== "grabcut") return;
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    drawGrabCutOverlay(ctx, state.grabcutRect, null);
  }, [tool, state.grabcutRect, overlayCanvasRef]);

  // ---- Clear overlay when switching tools ----
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    if (tool !== "polygon" && tool !== "grabcut") {
      overlay.getContext("2d")!.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [tool, overlayCanvasRef]);

  // ---- Brush pointer events (on maskCanvas) ----
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;
    if (tool !== "brush") return;

    const ctx = canvas.getContext("2d")!;
    const oCtx = overlay.getContext("2d")!;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isPainting.current = true;
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      onPushUndo(snap);
      const p = canvasPoint(canvas, e);
      paintCircle(ctx, p.x, p.y, state.brushRadius, state.brushMode === "erase");
    };

    const onMove = (e: PointerEvent) => {
      const p = canvasPoint(canvas, e);
      setCursor(p);
      drawBrushCursor(oCtx, p.x, p.y, state.brushRadius, state.brushMode === "erase");
      if (!isPainting.current) return;
      e.preventDefault();
      paintCircle(ctx, p.x, p.y, state.brushRadius, state.brushMode === "erase");
    };

    const onUp = () => {
      isPainting.current = false;
    };

    const onLeave = () => {
      setCursor(null);
      oCtx.clearRect(0, 0, overlay.width, overlay.height);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [tool, state.brushRadius, state.brushMode, maskCanvasRef, overlayCanvasRef, onPushUndo]);

  // ---- Flood fill click (on maskCanvas) ----
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    if (tool !== "flood") return;

    const onClick = (e: MouseEvent) => {
      const src = srcCanvasRef.current;
      if (!src) return;
      const p = canvasPoint(canvas, e);
      const ctx = canvas.getContext("2d")!;
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      onPushUndo(snap);
      floodFill(canvas, src, p.x, p.y, state.floodTolerance, state.floodConnectivity, state.floodMode);
      dispatch({ type: "tool_applied" });
    };

    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  }, [tool, state.floodTolerance, state.floodConnectivity, state.floodMode, maskCanvasRef, onPushUndo, dispatch]);

  // ---- Polygon pointer events (on overlayCanvas) ----
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!overlay || !mask) return;
    if (tool !== "polygon") return;

    const oCtx = overlay.getContext("2d")!;

    const HANDLE_HIT = 8;

    const findVertex = (p: Point): number | null => {
      for (let i = 0; i < state.polygonVertices.length; i++) {
        const v = state.polygonVertices[i];
        if (Math.abs(v.x - p.x) <= HANDLE_HIT && Math.abs(v.y - p.y) <= HANDLE_HIT) return i;
      }
      return null;
    };

    const onDown = (e: PointerEvent) => {
      const p = canvasPoint(overlay, e);
      const hit = findVertex(p);
      if (hit !== null) {
        draggingVertexIdx.current = hit;
        overlay.setPointerCapture(e.pointerId);
        dispatch({ type: "polygon_vertex_selected", index: hit });
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = canvasPoint(overlay, e);
      setCursor(p);
      if (draggingVertexIdx.current !== null) {
        dispatch({ type: "polygon_vertex_moved", index: draggingVertexIdx.current, point: p });
      } else {
        drawPolygonOverlay(oCtx, state.polygonVertices, state.selectedVertex, p);
      }
    };

    const onUp = () => {
      draggingVertexIdx.current = null;
    };

    const onClick = (e: MouseEvent) => {
      const p = canvasPoint(overlay, e);
      if (findVertex(p) !== null) return; // hit existing vertex, don't add
      dispatch({ type: "polygon_vertex_added", point: p });
    };

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      const maskCtx = mask.getContext("2d")!;
      const snap = maskCtx.getImageData(0, 0, mask.width, mask.height);
      onPushUndo(snap);
      fillPolygon(mask, state.polygonVertices, state.floodMode);
      dispatch({ type: "tool_applied" });
      dispatch({ type: "polygon_vertex_selected", index: null });
      // Clear vertices after commit
      for (let i = state.polygonVertices.length - 1; i >= 0; i--) {
        dispatch({ type: "polygon_vertex_deleted", index: i });
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const p = canvasPoint(overlay, e);
      const hit = findVertex(p);
      if (hit !== null) dispatch({ type: "polygon_vertex_deleted", index: hit });
    };

    const onLeave = () => setCursor(null);

    overlay.addEventListener("pointerdown", onDown);
    overlay.addEventListener("pointermove", onMove);
    overlay.addEventListener("pointerup", onUp);
    overlay.addEventListener("click", onClick);
    overlay.addEventListener("dblclick", onDblClick);
    overlay.addEventListener("contextmenu", onContextMenu);
    overlay.addEventListener("pointerleave", onLeave);
    return () => {
      overlay.removeEventListener("pointerdown", onDown);
      overlay.removeEventListener("pointermove", onMove);
      overlay.removeEventListener("pointerup", onUp);
      overlay.removeEventListener("click", onClick);
      overlay.removeEventListener("dblclick", onDblClick);
      overlay.removeEventListener("contextmenu", onContextMenu);
      overlay.removeEventListener("pointerleave", onLeave);
    };
  }, [
    tool,
    state.polygonVertices,
    state.selectedVertex,
    state.floodMode,
    overlayCanvasRef,
    maskCanvasRef,
    onPushUndo,
    dispatch,
  ]);

  // ---- GrabCut rect drag (on overlayCanvas) ----
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    if (tool !== "grabcut") return;

    const oCtx = overlay.getContext("2d")!;

    const onDown = (e: PointerEvent) => {
      const p = canvasPoint(overlay, e);
      overlay.setPointerCapture(e.pointerId);
      dragRect.current = { startX: p.x, startY: p.y, x: p.x, y: p.y, w: 0, h: 0 };
    };

    const onMove = (e: PointerEvent) => {
      const p = canvasPoint(overlay, e);
      setCursor(p);
      if (!dragRect.current) return;
      const r = dragRect.current;
      r.x = Math.min(p.x, r.startX);
      r.y = Math.min(p.y, r.startY);
      r.w = Math.abs(p.x - r.startX);
      r.h = Math.abs(p.y - r.startY);
      drawGrabCutOverlay(oCtx, state.grabcutRect, r);
    };

    const onUp = () => {
      if (!dragRect.current) return;
      const r = dragRect.current;
      if (r.w > 4 && r.h > 4) {
        dispatch({ type: "set_grabcut_rect", rect: { x: r.x, y: r.y, w: r.w, h: r.h } });
      }
      dragRect.current = null;
    };

    const onLeave = () => setCursor(null);

    overlay.addEventListener("pointerdown", onDown);
    overlay.addEventListener("pointermove", onMove);
    overlay.addEventListener("pointerup", onUp);
    overlay.addEventListener("pointerleave", onLeave);
    return () => {
      overlay.removeEventListener("pointerdown", onDown);
      overlay.removeEventListener("pointermove", onMove);
      overlay.removeEventListener("pointerup", onUp);
      overlay.removeEventListener("pointerleave", onLeave);
    };
  }, [tool, state.grabcutRect, overlayCanvasRef, dispatch]);

  // ---- Canvas pointer events for cursor tracking (prefill/snap) ----
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    if (tool !== "prefill" && tool !== "snap") return;
    const onMove = (e: PointerEvent) => setCursor(canvasPoint(overlay, e));
    const onLeave = () => setCursor(null);
    overlay.addEventListener("pointermove", onMove);
    overlay.addEventListener("pointerleave", onLeave);
    return () => {
      overlay.removeEventListener("pointermove", onMove);
      overlay.removeEventListener("pointerleave", onLeave);
    };
  }, [tool, overlayCanvasRef]);

  // Cursor style per tool
  const cursorStyle: Record<ToolName, string> = {
    prefill: "default",
    brush: "none",
    polygon: "crosshair",
    flood: "crosshair",
    grabcut: "crosshair",
    snap: "default",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Canvas viewport */}
      <div
        style={{
          flex: 1,
          position: "relative",
          background: T.bg,
          overflow: "hidden",
          borderTop: `1px solid ${T.line}`,
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        {/* Checker background for transparency */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              `linear-gradient(45deg, ${T.bg1} 25%, transparent 25%),` +
              `linear-gradient(-45deg, ${T.bg1} 25%, transparent 25%),` +
              `linear-gradient(45deg, transparent 75%, ${T.bg1} 75%),` +
              `linear-gradient(-45deg, transparent 75%, ${T.bg1} 75%)`,
            backgroundSize: "14px 14px",
            backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0",
            opacity: 0.25,
          }}
        />

        {/* Source image */}
        <img
          src={imageUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />

        {/* Mask canvas — alpha channel = foreground */}
        <canvas
          ref={maskCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0.55,
            cursor: cursorStyle[tool],
            pointerEvents: tool === "brush" || tool === "flood" ? "auto" : "none",
          }}
        />

        {/* Overlay canvas — cursor, polygon, grabcut rect */}
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            cursor: cursorStyle[tool],
            pointerEvents: ["polygon", "grabcut", "snap", "prefill"].includes(tool) ? "auto" : "none",
          }}
        />

        {/* Corner badges */}
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, pointerEvents: "none" }}>
          <Pill>{TOOL_LABELS[tool]}</Pill>
          <Pill kind="slate">{imageWidth} × {imageHeight}</Pill>
        </div>
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, pointerEvents: "none" }}>
          {state.dirty && <Pill kind="accent">● unsaved</Pill>}
        </div>
      </div>

      <ContextStrip
        tool={tool}
        cursor={cursor}
        brushRadius={state.brushRadius}
        brushMode={state.brushMode}
        floodTolerance={state.floodTolerance}
        floodMode={state.floodMode}
        floodConnectivity={state.floodConnectivity}
        polygonVertices={state.polygonVertices}
        polygonSimplifyEps={state.polygonSimplifyEps}
        grabcutRect={state.grabcutRect}
        grabcutIterations={state.grabcutIterations}
        snapEdgeOperator={state.snapEdgeOperator}
        snapRadius={state.snapRadius}
        snapEdgeThreshold={state.snapEdgeThreshold}
      />
    </div>
  );
}

export type MaskCanvasRef = React.RefObject<HTMLCanvasElement | null>;
