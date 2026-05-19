import { useReducer, useRef, useCallback } from "react";
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

export type ToolName =
  | "prefill"
  | "brush"
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
    dispatch({ type: "assist_started" });
    setTimeout(() => {
      dispatch({
        type: "assist_failed",
        error: "opencv.js not yet initialized — wire cv.grabCut() here.",
      });
    }, 0);
  }, []);

  const handleSnapVertex = useCallback(() => {
    dispatch({ type: "assist_started" });
    setTimeout(() => {
      dispatch({
        type: "assist_failed",
        error: "Contour snap not yet wired — call cv.Canny() here.",
      });
    }, 0);
  }, []);

  const handleSnapAll = useCallback(() => {
    dispatch({ type: "assist_started" });
    setTimeout(() => {
      dispatch({
        type: "assist_failed",
        error: "Contour snap (all) not yet wired.",
      });
    }, 0);
  }, []);

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
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          candidateMask={candidateMask}
          onPushUndo={handlePushUndo}
        />

        <MaskEditorInspector
          state={state}
          dispatch={dispatch}
          activeTool={state.activeTool}
          onRunGrabCut={handleRunGrabCut}
          onSnapVertex={handleSnapVertex}
          onSnapAll={handleSnapAll}
        />
      </div>

      <MaskEditorFooter state={state} />
    </Dialog>
  );
}
