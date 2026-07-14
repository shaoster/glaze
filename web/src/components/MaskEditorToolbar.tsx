import type { Dispatch } from "react";
import MEIcon from "./MaskEditorIcons";
import { T } from "./maskEditorTokens";
import type { MaskEditorAction, ToolName } from "./maskEditorState";

const TOOLS: { id: ToolName; label: string; icon: Parameters<typeof MEIcon>[0]["name"]; kbd: string }[] = [
  { id: "prefill",  label: "Pre-fill",       icon: "layers",  kbd: "P" },
  { id: "polygon",  label: "Polygon edit",    icon: "polygon", kbd: "G" },
  { id: "flood",    label: "Flood fill",      icon: "flood",   kbd: "F" },
  { id: "eraser",   label: "Eraser",          icon: "eraser",  kbd: "E" },
  { id: "grabcut",  label: "GrabCut",         icon: "grabcut", kbd: "C" },
  { id: "snap",     label: "Contour snap",    icon: "snap",    kbd: "S" },
];

interface MaskEditorToolbarProps {
  active: ToolName;
  dispatch: Dispatch<MaskEditorAction>;
}

export default function MaskEditorToolbar({
  active,
  dispatch,
}: MaskEditorToolbarProps) {
  return (
    <div
      style={{
        width: 60,
        background: T.bg1,
        borderRight: `1px solid ${T.line}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 4,
        flexShrink: 0,
      }}
    >
      {TOOLS.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            title={`${t.label} · ${t.kbd}`}
            onClick={() => dispatch({ type: "set_tool", tool: t.id })}
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              background: on ? T.accentSoft : "transparent",
              color: on ? T.accent : T.textDim,
              border: on
                ? `1px solid oklch(0.70 0.12 40 / 0.4)`
                : "1px solid transparent",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <MEIcon name={t.icon} size={20} />
            <span
              style={{
                position: "absolute",
                bottom: 2,
                right: 4,
                fontFamily: T.fontMono,
                fontSize: 8,
                color: on ? T.accent : T.textMute,
                opacity: 0.85,
              }}
            >
              {t.kbd}
            </span>
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <button
        title="Shortcuts"
        style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          background: "transparent",
          color: T.textMute,
          border: "none",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MEIcon name="keyboard" size={18} />
      </button>
    </div>
  );
}
