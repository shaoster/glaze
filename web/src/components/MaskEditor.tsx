import { useReducer, useRef, useCallback, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import MEIcon from "./MaskEditorIcons";
import { Pill } from "./MaskEditorShared";
import { T } from "./maskEditorTokens";
import MaskEditorToolbar from "./MaskEditorToolbar";
import MaskEditorCanvas from "./MaskEditorCanvas";
import MaskEditorInspector from "./MaskEditorInspector";
import MaskEditorFooter from "./MaskEditorFooter";
import {
  INITIAL_STATE,
  maskEditorReducer,
} from "./maskEditorState";
import { fillPolygon, smoothPolygon, simplifyPolygon } from "./maskEditorCanvasOps";
import { runGrabCut, snapVerticesToEdges } from "./maskEditorCv";

export type ToolName =
  | "prefill"
  | "polygon"
  | "flood"
  | "grabcut"
  | "snap";

export interface MaskEditorProps {
  open?: boolean;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  candidateMask?: string | null;
  onCommit: (mask: Blob) => void;
  onCancel: () => void;
  disabledTools?: ToolName[];
}

const TOP_BTN: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: T.textDim,
  padding: "6px 8px",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

export default function MaskEditor({
  open = false,
  imageUrl,
  imageWidth,
  imageHeight,
  candidateMask,
  onCommit,
  onCancel,
}: MaskEditorProps) {
  const [state, dispatch] = useReducer(maskEditorReducer, INITIAL_STATE);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const hintsCanvasRef = useRef<HTMLCanvasElement>(null);
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ImageData stacks live here so they never enter React state
  const undoCanvasStack = useRef<ImageData[]>([]);
  const redoCanvasStack = useRef<ImageData[]>([]);

  const undoCount = state.undoStack;
  const redoCount = state.redoStack;

  // Called by MaskEditorCanvas after each paint op — snapshot is pre-op state
  const handlePushUndo = useCallback((snapshot: ImageData) => {
    undoCanvasStack.current = [...undoCanvasStack.current, snapshot].slice(-20);
    redoCanvasStack.current = [];
    dispatch({ type: "tool_applied" });
  }, []);

  const handleUndo = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || undoCanvasStack.current.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    // Save current canvas state for redo
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redoCanvasStack.current = [current, ...redoCanvasStack.current].slice(0, 20);
    // Restore previous
    const prev = undoCanvasStack.current[undoCanvasStack.current.length - 1];
    undoCanvasStack.current = undoCanvasStack.current.slice(0, -1);
    ctx.putImageData(prev, 0, 0);
    dispatch({ type: "undo" });
  }, []);

  const handleRedo = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || redoCanvasStack.current.length === 0) return;
    const ctx = canvas.getContext("2d")!;
    // Save current canvas state for undo
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoCanvasStack.current = [...undoCanvasStack.current, current].slice(-20);
    // Restore redo target
    const next = redoCanvasStack.current[0];
    redoCanvasStack.current = redoCanvasStack.current.slice(1);
    ctx.putImageData(next, 0, 0);
    dispatch({ type: "redo" });
  }, []);

  const handleCommit = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    // Output: RGB zeroed, alpha = foreground mask
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 0;
      imageData.data[i + 1] = 0;
      imageData.data[i + 2] = 0;
    }
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext("2d")!.putImageData(imageData, 0, 0);
    tmp.toBlob((blob) => {
      if (blob) onCommit(blob);
    }, "image/png");
  }, [onCommit]);

  const handleRunGrabCut = useCallback(() => {
    const mask = maskCanvasRef.current;
    const src = srcCanvasRef.current;
    if (!mask || !src || !state.grabcutRect) return;
    const t0 = performance.now();
    dispatch({ type: "assist_started" });
    const snap = mask.getContext("2d")!.getImageData(0, 0, mask.width, mask.height);
    handlePushUndo(snap);
    runGrabCut(src, mask, hintsCanvasRef.current, state.grabcutRect, state.grabcutIterations)
      .then(() => {
        dispatch({ type: "assist_succeeded", ms: Math.round(performance.now() - t0) });
      })
      .catch((err: unknown) => {
        dispatch({ type: "assist_failed", error: String(err) });
      });
  }, [state.grabcutRect, state.grabcutIterations, handlePushUndo]);

  const handleSnapVertices = useCallback((vertexIndices: number[]) => {
    const src = srcCanvasRef.current;
    if (!src || state.polygonVertices.length === 0) return;
    const targets = vertexIndices.map((i) => state.polygonVertices[i]);
    dispatch({ type: "assist_started" });
    snapVerticesToEdges(src, targets, state.snapRadius, state.snapEdgeThreshold, state.snapEdgeOperator)
      .then((snapped) => {
        const newVerts = [...state.polygonVertices];
        vertexIndices.forEach((vi, si) => { newVerts[vi] = snapped[si]; });
        dispatch({ type: "polygon_vertices_set", vertices: newVerts });
        dispatch({ type: "assist_succeeded", ms: 0 });
      })
      .catch((err: unknown) => {
        dispatch({ type: "assist_failed", error: String(err) });
      });
  }, [state.polygonVertices, state.snapRadius, state.snapEdgeThreshold, state.snapEdgeOperator]);

  const handleSnapVertex = useCallback(() => {
    if (state.selectedVertex == null) return;
    handleSnapVertices([state.selectedVertex]);
  }, [state.selectedVertex, handleSnapVertices]);

  const handleSnapAll = useCallback(() => {
    handleSnapVertices(state.polygonVertices.map((_, i) => i));
  }, [state.polygonVertices, handleSnapVertices]);

  // ---- Polygon operations ----

  const handleClosePolygon = useCallback(() => {
    if (state.polygonVertices.length < 3) return;
    dispatch({ type: "polygon_closed" });
  }, [state.polygonVertices.length]);

  const handleApplyPolygon = useCallback(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || state.polygonVertices.length < 3) return;
    const ctx = canvas.getContext("2d")!;
    handlePushUndo(ctx.getImageData(0, 0, canvas.width, canvas.height));
    fillPolygon(canvas, state.polygonVertices, state.floodMode);
    dispatch({ type: "tool_applied" });
    dispatch({ type: "polygon_vertices_set", vertices: [] });
  }, [state.polygonVertices, state.floodMode, handlePushUndo]);

  const handleInsertVertex = useCallback(() => {
    const verts = state.polygonVertices;
    const sel = state.selectedVertex;
    if (verts.length < 2 || sel == null) return;
    const next = (sel + 1) % verts.length;
    const mid = {
      x: (verts[sel].x + verts[next].x) / 2,
      y: (verts[sel].y + verts[next].y) / 2,
    };
    const newVerts = [...verts.slice(0, sel + 1), mid, ...verts.slice(sel + 1)];
    dispatch({ type: "polygon_vertices_set", vertices: newVerts });
    dispatch({ type: "polygon_vertex_selected", index: sel + 1 });
  }, [state.polygonVertices, state.selectedVertex]);

  const handleSmoothPolygon = useCallback(() => {
    if (state.polygonVertices.length < 3) return;
    dispatch({ type: "polygon_vertices_set", vertices: smoothPolygon(state.polygonVertices) });
  }, [state.polygonVertices]);

  const handleSimplifyPolygon = useCallback(() => {
    if (state.polygonVertices.length < 3) return;
    dispatch({ type: "polygon_vertices_set", vertices: simplifyPolygon(state.polygonVertices, state.polygonSimplifyEps) });
  }, [state.polygonVertices, state.polygonSimplifyEps]);

  // ---- Flood commit (fills the whole current mask region — no-op, just shows user can re-click) ----
  // "Commit fill" in the inspector confirms the last flood op, which is already live on canvas.
  // We just dispatch tool_applied to mark dirty if not already marked.
  const handleFloodCommit = useCallback(() => {
    dispatch({ type: "tool_applied" });
  }, []);

  // ---- Global keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      const tool = state.activeTool;

      if (mod) {
        if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
        else if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); handleRedo(); }
        else if (e.key === "Enter" && tool === "grabcut") { e.preventDefault(); handleRunGrabCut(); }
        return;
      }

      switch (e.key) {
        case "p": case "P": dispatch({ type: "set_tool", tool: "prefill" }); break;
        case "g": case "G":
          if (tool === "grabcut") dispatch({ type: "set_grabcut_hint_mode", mode: "background" });
          else dispatch({ type: "set_tool", tool: "polygon" });
          break;
        case "f": case "F":
          if (tool === "grabcut") dispatch({ type: "set_grabcut_hint_mode", mode: "foreground" });
          else dispatch({ type: "set_tool", tool: "flood" });
          break;
        case "c": case "C": dispatch({ type: "set_tool", tool: "grabcut" }); break;
        case "s": case "S":
          if (tool === "snap") {
            if (e.shiftKey) handleSnapAll();
            else handleSnapVertex();
          } else {
            dispatch({ type: "set_tool", tool: "snap" });
          }
          break;
        case "r": case "R":
          if (tool === "grabcut") dispatch({ type: "set_grabcut_rect", rect: null });
          break;
        case "Enter":
          if (tool === "polygon") {
            e.preventDefault();
            if (state.polygonClosed) handleApplyPolygon();
            else handleClosePolygon();
          }
          break;
        case "Backspace": case "Delete":
          if (tool === "polygon" && state.selectedVertex != null) {
            e.preventDefault();
            dispatch({ type: "polygon_vertex_deleted", index: state.selectedVertex });
          }
          break;
        case "i": case "I":
          if (tool === "polygon") handleInsertVertex();
          break;
        case "[":
          if (tool === "snap") dispatch({ type: "set_snap_radius", radius: Math.max(2, state.snapRadius - 4) });
          break;
        case "]":
          if (tool === "snap") dispatch({ type: "set_snap_radius", radius: Math.min(64, state.snapRadius + 4) });
          break;
        case "ArrowLeft": case "ArrowUp":
          if (tool === "snap" && state.polygonVertices.length > 0) {
            e.preventDefault();
            const n = state.polygonVertices.length;
            const cur = state.selectedVertex ?? 0;
            dispatch({ type: "polygon_vertex_selected", index: (cur - 1 + n) % n });
          }
          break;
        case "ArrowRight": case "ArrowDown":
          if (tool === "snap" && state.polygonVertices.length > 0) {
            e.preventDefault();
            const n = state.polygonVertices.length;
            const cur = state.selectedVertex ?? -1;
            dispatch({ type: "polygon_vertex_selected", index: (cur + 1) % n });
          }
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    state.activeTool,
    state.selectedVertex,
    state.snapRadius,
    state.polygonVertices,
    state.polygonClosed,
    handleUndo,
    handleRedo,
    handleRunGrabCut,
    handleSnapAll,
    handleSnapVertex,
    handleClosePolygon,
    handleApplyPolygon,
    handleInsertVertex,
  ]);

  return (
    <Dialog
      open={open}
      fullScreen
      PaperProps={{
        style: {
          background: T.bg,
          color: T.text,
          fontFamily: T.fontUi,
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: `1px solid ${T.line}`,
          background: T.bg1,
          gap: 16,
          flexShrink: 0,
        }}
      >
        {/* Left: cancel + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              border: `1px solid ${T.line}`,
              color: T.textDim,
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontFamily: T.fontUi,
            }}
          >
            <MEIcon name="x" size={14} /> Cancel
          </button>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <div
              style={{
                fontFamily: T.fontDisplay,
                fontSize: 20,
                color: T.text,
                letterSpacing: "0.01em",
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              Edit mask
            </div>
            <div
              style={{
                fontFamily: T.fontMono,
                fontSize: 10,
                color: T.textMute,
                letterSpacing: "0.06em",
              }}
            >
              candidate IoU —
            </div>
          </div>
        </div>

        {/* Right: undo/redo + view + commit */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "inline-flex",
              border: `1px solid ${T.line}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <button
              style={TOP_BTN}
              title="Undo · ⌘Z"
              disabled={undoCount === 0}
              onClick={handleUndo}
            >
              <MEIcon name="undo" size={14} />
            </button>
            <button
              style={{ ...TOP_BTN, borderLeft: `1px solid ${T.line}` }}
              title="Redo · ⇧⌘Z"
              disabled={redoCount === 0}
              onClick={handleRedo}
            >
              <MEIcon name="redo" size={14} />
            </button>
          </div>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: 10,
              color: T.textMute,
              padding: "0 4px",
            }}
          >
            {undoCount} / 20
          </div>

          <span style={{ width: 1, height: 18, background: T.line, margin: "0 6px" }} />

          <button style={TOP_BTN} title="Toggle mask visibility">
            <MEIcon name="eye" size={14} />
          </button>
          <button style={TOP_BTN} title="Toggle grid">
            <MEIcon name="grid" size={14} />
          </button>
          <button style={TOP_BTN} title="Zoom">
            <MEIcon name="zoom" size={14} />
          </button>

          <span style={{ width: 1, height: 18, background: T.line, margin: "0 6px" }} />

          {state.assistStatus === "loading" && (
            <Pill kind="warn">running…</Pill>
          )}

          <button
            onClick={handleCommit}
            style={{
              background: T.accent,
              color: "oklch(0.99 0.005 85)",
              border: "none",
              padding: "7px 14px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: T.fontUi,
              boxShadow:
                "0 1px 0 oklch(0.3 0.05 40 / 0.3) inset, 0 2px 6px oklch(0.4 0.08 40 / 0.2)",
            }}
          >
            <MEIcon name="check" size={14} />
            Commit mask
          </button>
        </div>
      </div>

      {/* Body: tool rail + canvas + inspector */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <MaskEditorToolbar active={state.activeTool} dispatch={dispatch} />

        <MaskEditorCanvas
          state={state}
          dispatch={dispatch}
          maskCanvasRef={maskCanvasRef}
          overlayCanvasRef={overlayCanvasRef}
          hintsCanvasRef={hintsCanvasRef}
          srcCanvasRef={srcCanvasRef}
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          candidateMask={candidateMask}
          onPushUndo={handlePushUndo}
          onClosePolygon={handleClosePolygon}
        />

        <MaskEditorInspector
          state={state}
          dispatch={dispatch}
          activeTool={state.activeTool}
          onClosePolygon={handleClosePolygon}
          onApplyPolygon={handleApplyPolygon}
          onReopenPolygon={() => dispatch({ type: "polygon_reopened" })}
          onInsertVertex={handleInsertVertex}
          onSmoothPolygon={handleSmoothPolygon}
          onSimplifyPolygon={handleSimplifyPolygon}
          onFloodCommit={handleFloodCommit}
          onRunGrabCut={handleRunGrabCut}
          onSnapVertex={handleSnapVertex}
          onSnapAll={handleSnapAll}
        />
      </div>

      <MaskEditorFooter state={state} />
    </Dialog>
  );
}
