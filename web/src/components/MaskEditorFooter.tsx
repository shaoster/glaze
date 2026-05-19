import { Pill } from "./MaskEditorShared";
import { T } from "./maskEditorTokens";
import type { MaskEditorState, ToolName } from "./maskEditorState";

const TOOL_PERF: Record<ToolName, string> = {
  prefill:  "— · candidate load",
  polygon:  "— · canvas-only",
  flood:    "~38 ms · canvas",
  grabcut:  "482 ms · last",
  snap:     "24 ms · last",
};

interface MaskEditorFooterProps {
  state: MaskEditorState;
}

export default function MaskEditorFooter({ state }: MaskEditorFooterProps) {
  const usesWasm = state.activeTool === "grabcut" || state.activeTool === "snap";
  const perf = TOOL_PERF[state.activeTool];
  const undoCount = state.undoStack;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 14px",
        background: T.bg1,
        borderTop: `1px solid ${T.line}`,
        fontFamily: T.fontMono,
        fontSize: 10,
        color: T.textMute,
        letterSpacing: "0.04em",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <span>Mask · 640 × 480 · RGBA</span>
        <span>FG: 18,420 px (5.99%)</span>
        <span style={{ color: T.textDim }}>Edits: {undoCount}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Pill kind={usesWasm ? "ok" : "default"}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: usesWasm ? T.ok : T.textMute,
            }}
          />
          {usesWasm ? "opencv.js · wasm" : "canvas · local"}
        </Pill>
        <span>{perf}</span>
      </div>
    </div>
  );
}
