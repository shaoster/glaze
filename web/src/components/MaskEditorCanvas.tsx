import { useRef, useEffect, useState } from "react";
import type { Dispatch } from "react";
import { Pill, Spinner } from "./MaskEditorShared";
import { T } from "./maskEditorTokens";
import type { MaskEditorState, MaskEditorAction, ToolName, Point } from "./maskEditorState";
import { floodFill } from "./maskEditorCanvasOps";
import { HINT_FG_COLOR, HINT_BG_COLOR, isCvReady, getCv } from "./maskEditorCv";

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

// ---- Overlay canvas drawing ----

function drawPolygonOverlay(
  ctx: CanvasRenderingContext2D,
  vertices: Point[],
  selectedVertex: number | null,
  hoverPoint: Point | null,
  closed = false,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (vertices.length === 0) return;

  ctx.save();

  // Fill preview (subtle tint)
  if (vertices.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    ctx.closePath();
    ctx.fillStyle = T.accentTint;
    ctx.fill();
  }

  // Helper: draw edge path
  const drawEdgePath = () => {
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (let i = 1; i < vertices.length; i++) ctx.lineTo(vertices[i].x, vertices[i].y);
    if (closed && vertices.length >= 3) ctx.closePath();
  };

  // Two-pass edges: dark shadow stroke then colored stroke for contrast on any background
  ctx.setLineDash([]);
  drawEdgePath();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3.5;
  ctx.stroke();
  drawEdgePath();
  ctx.strokeStyle = T.accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Preview line to cursor (open mode only)
  if (hoverPoint && vertices.length > 0) {
    const last = vertices[vertices.length - 1];
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(hoverPoint.x, hoverPoint.y);
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Vertex handles — white fill with colored outline for max contrast
  for (let i = 0; i < vertices.length; i++) {
    const v = vertices[i];
    const isSel = i === selectedVertex;
    const r = isSel ? 6 : 4;
    // Shadow
    ctx.beginPath();
    ctx.arc(v.x, v.y, r + 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();
    // Fill
    ctx.beginPath();
    ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isSel ? T.accent : "white";
    ctx.fill();
    // Ring
    ctx.strokeStyle = isSel ? "white" : T.accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

function drawGrabCutRect(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number } | null,
  dragging: { x: number; y: number; w: number; h: number } | null,
) {
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
  eraserRadius,
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
  eraserRadius: number;
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
    polygon: `POLY · ${polygonVertices.length} vertices · ε ${polygonSimplifyEps}`,
    flood: `FLOOD · ${floodMode} · tol ${floodTolerance} · ${floodConnectivity}-way`,
    eraser: `ERASER · r ${eraserRadius} px`,
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
  polygon: "POLYGON",
  flood: "FLOOD FILL",
  eraser: "ERASER",
  grabcut: "GRABCUT",
  snap: "CONTOUR SNAP",
};

// ---- Main component ----

interface MaskEditorCanvasProps {
  state: MaskEditorState;
  dispatch: Dispatch<MaskEditorAction>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  hintsCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  srcCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  candidateMask?: string | null;
  onPushUndo: () => void;
  onClosePolygon: () => void;
}

export default function MaskEditorCanvas({
  state,
  dispatch,
  maskCanvasRef,
  overlayCanvasRef,
  hintsCanvasRef,
  srcCanvasRef,
  imageUrl,
  imageWidth,
  imageHeight,
  candidateMask,
  onPushUndo,
  onClosePolygon,
}: MaskEditorCanvasProps) {
  const tool = state.activeTool;
  const dragRect = useRef<{ startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null);
  const draggingVertexIdx = useRef<number | null>(null);
  const hintPainting = useRef(false);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [cvLoaded, setCvLoaded] = useState(isCvReady);

  // Track WASM ready state so the UI can show a loading indicator
  useEffect(() => {
    if (cvLoaded) return;
    getCv().then(() => setCvLoaded(true));
  }, [cvLoaded]);

  // ---- Initialize canvas dimensions ----
  useEffect(() => {
    const mask = maskCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    const hints = hintsCanvasRef.current;
    if (!mask || !overlay) return;
    mask.width = imageWidth;
    mask.height = imageHeight;
    overlay.width = imageWidth;
    overlay.height = imageHeight;
    if (hints) { hints.width = imageWidth; hints.height = imageHeight; }
  }, [imageWidth, imageHeight, maskCanvasRef, overlayCanvasRef, hintsCanvasRef]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, imageWidth, imageHeight]); // srcCanvasRef is a stable mutable ref

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

  // ---- Composite overlay redraw ----
  // Polygon vertices persist across tool switches; grabcut rect composites on top when active.
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (state.polygonVertices.length > 0) {
      drawPolygonOverlay(ctx, state.polygonVertices, state.selectedVertex, null, state.polygonClosed);
    }
    if (tool === "grabcut") {
      drawGrabCutRect(ctx, state.grabcutRect, null);
    }
  }, [tool, state.polygonVertices, state.polygonClosed, state.selectedVertex, state.grabcutRect, overlayCanvasRef]);

  // ---- Eraser (paint alpha=0 circles on maskCanvas) ----
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || tool !== "eraser") return;

    const eraserPainting = { active: false };

    const paint = (e: PointerEvent) => {
      const p = canvasPoint(canvas, e);
      const ctx = canvas.getContext("2d")!;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(p.x, p.y, state.eraserRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.fill();
      ctx.restore();
    };

    const onDown = (e: PointerEvent) => {
      onPushUndo();
      eraserPainting.active = true;
      canvas.setPointerCapture(e.pointerId);
      paint(e);
    };
    const onMove = (e: PointerEvent) => {
      const p = canvasPoint(canvas, e);
      setCursor(p);
      if (eraserPainting.active) paint(e);
    };
    const onUp = () => { eraserPainting.active = false; };
    const onLeave = () => setCursor(null);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [tool, state.eraserRadius, maskCanvasRef, onPushUndo]);

  // ---- Flood fill click (on maskCanvas) ----
  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    if (tool !== "flood") return;

    const onClick = (e: MouseEvent) => {
      const src = srcCanvasRef.current;
      if (!src) return;
      const p = canvasPoint(canvas, e);
      onPushUndo();
      floodFill(canvas, src, p.x, p.y, state.floodTolerance, state.floodConnectivity, state.floodMode);
      dispatch({ type: "tool_applied" });
    };

    canvas.addEventListener("click", onClick);
    return () => canvas.removeEventListener("click", onClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, state.floodTolerance, state.floodConnectivity, state.floodMode, maskCanvasRef, onPushUndo, dispatch]); // srcCanvasRef is a stable mutable ref

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
        onPushUndo(); // snapshot before drag starts
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
      } else if (!state.polygonClosed) {
        // Preview edge to cursor only when open (adding vertices)
        drawPolygonOverlay(oCtx, state.polygonVertices, state.selectedVertex, p, false);
      }
    };

    const onUp = () => {
      draggingVertexIdx.current = null;
    };

    const onClick = (e: MouseEvent) => {
      const p = canvasPoint(overlay, e);
      const hit = findVertex(p);
      if (hit !== null) {
        dispatch({ type: "polygon_vertex_selected", index: hit });
        return;
      }
      if (state.polygonClosed) return; // closed: no new vertices on click
      onPushUndo(); // snapshot before adding vertex
      dispatch({ type: "polygon_vertex_added", point: p });
    };

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      onClosePolygon();
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const p = canvasPoint(overlay, e);
      const hit = findVertex(p);
      if (hit !== null) {
        onPushUndo(); // snapshot before deleting vertex
        dispatch({ type: "polygon_vertex_deleted", index: hit });
      }
    };

    const onLeave = () => {
      setCursor(null);
      // Redraw without hover preview line
      oCtx.clearRect(0, 0, overlay.width, overlay.height);
      drawPolygonOverlay(oCtx, state.polygonVertices, state.selectedVertex, null, state.polygonClosed);
    };

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
    state.polygonClosed,
    state.selectedVertex,
    overlayCanvasRef,
    maskCanvasRef,
    onClosePolygon,
    onPushUndo,
    dispatch,
  ]);

  // ---- GrabCut hint painting (FG/BG scribbles on hintsCanvas) ----
  useEffect(() => {
    const hints = hintsCanvasRef.current;
    if (!hints || tool !== "grabcut") return;
    const hintMode = state.grabcutHintMode;
    if (hintMode === "rect") return; // rect drag is handled by overlay, not hints

    const ctx = hints.getContext("2d")!;
    const color = hintMode === "foreground" ? HINT_FG_COLOR : HINT_BG_COLOR;
    const radius = state.grabcutBrushRadius;

    const onDown = (e: PointerEvent) => {
      onPushUndo(); // snapshot before first stroke pixel
      hintPainting.current = true;
      hints.setPointerCapture(e.pointerId);
      const p = canvasPoint(hints, e);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    const onMove = (e: PointerEvent) => {
      const p = canvasPoint(hints, e);
      setCursor(p);
      if (!hintPainting.current) return;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    const onUp = () => { hintPainting.current = false; };
    const onLeave = () => setCursor(null);

    hints.addEventListener("pointerdown", onDown);
    hints.addEventListener("pointermove", onMove);
    hints.addEventListener("pointerup", onUp);
    hints.addEventListener("pointerleave", onLeave);
    return () => {
      hints.removeEventListener("pointerdown", onDown);
      hints.removeEventListener("pointermove", onMove);
      hints.removeEventListener("pointerup", onUp);
      hints.removeEventListener("pointerleave", onLeave);
    };
  }, [tool, state.grabcutHintMode, state.grabcutBrushRadius, hintsCanvasRef, onPushUndo]);

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
      // Composite: clear, polygon, then live drag rect
      oCtx.clearRect(0, 0, overlay.width, overlay.height);
      if (state.polygonVertices.length > 0) {
        drawPolygonOverlay(oCtx, state.polygonVertices, state.selectedVertex, null, state.polygonClosed);
      }
      drawGrabCutRect(oCtx, state.grabcutRect, r);
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
  }, [tool, state.grabcutRect, state.polygonVertices, state.polygonClosed, state.selectedVertex, overlayCanvasRef, dispatch]);

  // ---- Snap mode: click to select vertex ----
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay || tool !== "snap") return;

    const HANDLE_HIT = 10;
    const vertices = state.polygonVertices;

    const findVertex = (p: Point): number | null => {
      let best: number | null = null;
      let bestDist = HANDLE_HIT;
      for (let i = 0; i < vertices.length; i++) {
        const dx = vertices[i].x - p.x;
        const dy = vertices[i].y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    };

    const onMove = (e: PointerEvent) => setCursor(canvasPoint(overlay, e));
    const onClick = (e: MouseEvent) => {
      const p = canvasPoint(overlay, e);
      const hit = findVertex(p);
      if (hit !== null) dispatch({ type: "polygon_vertex_selected", index: hit });
    };
    const onLeave = () => setCursor(null);

    overlay.addEventListener("pointermove", onMove);
    overlay.addEventListener("click", onClick);
    overlay.addEventListener("pointerleave", onLeave);
    return () => {
      overlay.removeEventListener("pointermove", onMove);
      overlay.removeEventListener("click", onClick);
      overlay.removeEventListener("pointerleave", onLeave);
    };
  }, [tool, state.polygonVertices, overlayCanvasRef, dispatch]);

  // ---- Canvas pointer events for cursor tracking (prefill) ----
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    if (tool !== "prefill") return;
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
    polygon: "crosshair",
    flood: "crosshair",
    eraser: "cell",
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
            pointerEvents: (tool === "flood" || tool === "eraser") ? "auto" : "none",
          }}
        />

        {/* Overlay canvas — cursor, polygon, grabcut rect (only rect mode) */}
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            cursor: cursorStyle[tool],
            pointerEvents: (
              tool === "polygon" ||
              tool === "snap" ||
              tool === "prefill" ||
              (tool === "grabcut" && state.grabcutHintMode === "rect")
            ) ? "auto" : "none",
          }}
        />

        {/* Hints canvas — FG/BG scribbles for GrabCut */}
        <canvas
          ref={hintsCanvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            cursor: tool === "grabcut" && state.grabcutHintMode !== "rect" ? "crosshair" : "default",
            pointerEvents: (
              tool === "grabcut" && state.grabcutHintMode !== "rect"
            ) ? "auto" : "none",
            opacity: 0.7,
          }}
        />

        {/* Corner badges */}
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, pointerEvents: "none" }}>
          <Pill>{TOOL_LABELS[tool]}</Pill>
          <Pill kind="slate">{imageWidth} × {imageHeight}</Pill>
          {(tool === "grabcut" || tool === "snap") && !cvLoaded && (
            <Pill kind="warn">
              <Spinner size={9} />
              opencv.js loading…
            </Pill>
          )}
        </div>
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, pointerEvents: "none" }}>
          {state.dirty && <Pill kind="accent">● unsaved</Pill>}
        </div>
      </div>

      <ContextStrip
        tool={tool}
        cursor={cursor}
        eraserRadius={state.eraserRadius}
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
