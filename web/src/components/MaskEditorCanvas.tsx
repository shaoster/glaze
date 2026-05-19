import { Pill } from "./MaskEditorShared";
import { T } from "./maskEditorTokens";
import type { MaskEditorState, ToolName } from "./maskEditorState";

// ---- Vase silhouette constants (from design) ----
const VASE_PATH =
  "M 292 140 Q 282 160 288 180 Q 264 220 268 270 Q 266 330 278 370 Q 286 392 320 392 Q 354 392 362 370 Q 374 330 372 270 Q 376 220 352 180 Q 358 160 348 140 Z";

const VERTICES = [
  { x: 292, y: 140 }, { x: 288, y: 180 }, { x: 268, y: 220 }, { x: 268, y: 270 },
  { x: 270, y: 320 }, { x: 278, y: 370 }, { x: 300, y: 392 }, { x: 320, y: 392 },
  { x: 340, y: 392 }, { x: 362, y: 370 }, { x: 370, y: 320 }, { x: 372, y: 270 },
  { x: 376, y: 220 }, { x: 352, y: 180 }, { x: 348, y: 140 }, { x: 320, y: 132 },
];

// ---- Pottery illustration (from design) ----
function PotteryImage() {
  return (
    <svg
      viewBox="0 0 640 480"
      preserveAspectRatio="xMidYMid slice"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <defs>
        <linearGradient id="me-bg-tabletop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.42 0.025 60)" />
          <stop offset="65%" stopColor="oklch(0.32 0.018 50)" />
          <stop offset="100%" stopColor="oklch(0.22 0.012 45)" />
        </linearGradient>
        <radialGradient id="me-bg-glow" cx="0.55" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="oklch(0.62 0.04 80 / 0.4)" />
          <stop offset="100%" stopColor="oklch(0.3 0.02 60 / 0)" />
        </radialGradient>
        <radialGradient id="me-vase-clay" cx="0.4" cy="0.3">
          <stop offset="0%" stopColor="oklch(0.68 0.10 35)" />
          <stop offset="60%" stopColor="oklch(0.52 0.09 30)" />
          <stop offset="100%" stopColor="oklch(0.38 0.07 28)" />
        </radialGradient>
        <filter id="me-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="1.2"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0" />
        </filter>
      </defs>
      <rect width="640" height="480" fill="url(#me-bg-tabletop)" />
      <rect width="640" height="480" fill="url(#me-bg-glow)" />
      <line x1="0" y1="360" x2="640" y2="360" stroke="oklch(0.5 0.02 60)" strokeWidth="1" opacity="0.6" />
      <ellipse cx="120" cy="340" rx="42" ry="78" fill="oklch(0.36 0.02 80)" opacity="0.55" />
      <ellipse cx="540" cy="350" rx="56" ry="62" fill="oklch(0.39 0.025 60)" opacity="0.6" />
      <rect x="450" y="280" width="80" height="60" fill="oklch(0.34 0.018 60)" opacity="0.5" />
      <g transform="translate(320 290)">
        <ellipse cx="0" cy="100" rx="62" ry="6" fill="oklch(0.15 0.01 45)" opacity="0.7" />
        <path
          d="M -28 -150 Q -38 -130 -32 -110 Q -56 -70 -52 -20 Q -54 40 -42 80 Q -34 102 0 102 Q 34 102 42 80 Q 54 40 52 -20 Q 56 -70 32 -110 Q 38 -130 28 -150 Z"
          fill="url(#me-vase-clay)"
        />
        <path
          d="M -30 -130 Q -50 -60 -38 30 Q -40 70 -30 95"
          fill="none"
          stroke="oklch(0.85 0.04 70 / 0.25)"
          strokeWidth="3"
        />
        <path d="M 22 -140 Q 50 -60 45 50 Q 40 90 22 100" fill="oklch(0.2 0.02 30 / 0.35)" />
      </g>
      <rect width="640" height="480" filter="url(#me-grain)" opacity="0.6" />
    </svg>
  );
}

// ---- Per-tool SVG overlays ----
function OverlayMaskFill({ opacity = 0.42 }: { opacity?: number }) {
  return (
    <path
      d={VASE_PATH}
      fill={T.accent}
      fillOpacity={opacity}
      stroke={T.accent}
      strokeWidth="1.5"
      strokeOpacity="0.9"
    />
  );
}

function PolygonOverlay({ selectedVertex }: { selectedVertex: number | null }) {
  const sel = selectedVertex ?? 9;
  const d =
    VERTICES.map((v, i) => (i === 0 ? `M ${v.x} ${v.y}` : `L ${v.x} ${v.y}`)).join(" ") + " Z";
  return (
    <g>
      <path d={d} fill={T.accent} fillOpacity="0.18" stroke={T.accent} strokeWidth="1.5" />
      {VERTICES.map((v, i) => {
        const isSel = i === sel;
        return (
          <g key={i}>
            {isSel && (
              <circle cx={v.x} cy={v.y} r="10" fill="none" stroke={T.accent} strokeWidth="1" strokeDasharray="2 2" opacity="0.8" />
            )}
            <rect
              x={v.x - (isSel ? 5 : 3)} y={v.y - (isSel ? 5 : 3)}
              width={isSel ? 10 : 6} height={isSel ? 10 : 6}
              fill={isSel ? T.accent : T.bg}
              stroke={isSel ? T.text : T.accent}
              strokeWidth="1.5"
            />
          </g>
        );
      })}
      <circle cx="270" cy="240" r="3" fill="none" stroke={T.text} strokeWidth="1" strokeDasharray="1 1" opacity="0.7" />
      <text x="278" y="245" fill={T.textDim} fontSize="9" fontFamily={T.fontMono}>+ insert</text>
      <g transform="translate(370 360)">
        <rect x="0" y="0" width="58" height="18" rx="3" fill={T.bg2} stroke={T.line} />
        <text x="6" y="12" fill={T.text} fontSize="10" fontFamily={T.fontMono}>v{sel} · 362,370</text>
      </g>
    </g>
  );
}

function FloodOverlay() {
  return (
    <g>
      <OverlayMaskFill opacity={0.36} />
      <path
        d="M 282 200 Q 278 240 286 280 Q 296 282 300 240 Q 296 210 282 200 Z"
        fill={T.ok} fillOpacity="0.5" stroke={T.ok} strokeWidth="1.2" strokeDasharray="3 2"
      />
      <g transform="translate(290 240)">
        <circle r="14" fill="none" stroke={T.text} strokeWidth="1" opacity="0.7" />
        <circle r="3" fill={T.text} />
        <line x1="-22" y1="0" x2="-16" y2="0" stroke={T.text} strokeWidth="1" />
        <line x1="16" y1="0" x2="22" y2="0" stroke={T.text} strokeWidth="1" />
        <line x1="0" y1="-22" x2="0" y2="-16" stroke={T.text} strokeWidth="1" />
        <line x1="0" y1="16" x2="0" y2="22" stroke={T.text} strokeWidth="1" />
      </g>
      <g transform="translate(310 226)">
        <rect width="118" height="34" rx="4" fill={T.bg2} stroke={T.line} />
        <text x="8" y="14" fill={T.textDim} fontSize="9" fontFamily={T.fontMono}>sample  rgb(98,52,38)</text>
        <text x="8" y="27" fill={T.accent} fontSize="9" fontFamily={T.fontMono}>+ add  ·  ~4.2k px</text>
      </g>
    </g>
  );
}

function GrabCutOverlay() {
  return (
    <g>
      <path d={VASE_PATH} fill={T.accent} fillOpacity="0.28" stroke={T.accent} strokeWidth="1.2" />
      <rect x="252" y="118" width="140" height="290" fill="none" stroke={T.text} strokeWidth="1.5" strokeDasharray="5 4" />
      {([[252, 118], [392, 118], [252, 408], [392, 408]] as [number, number][]).map(([x, y], i) => (
        <rect key={i} x={x - 3} y={y - 3} width="6" height="6" fill={T.text} />
      ))}
      <path d="M 312 200 Q 318 220 314 240 Q 322 260 318 280" fill="none" stroke={T.accent} strokeWidth="3" strokeLinecap="round" opacity="0.95" />
      <path d="M 328 220 Q 332 250 326 290" fill="none" stroke={T.accent} strokeWidth="3" strokeLinecap="round" opacity="0.95" />
      <path d="M 220 280 Q 200 290 180 280 Q 175 296 200 308" fill="none" stroke={T.slate} strokeWidth="3" strokeLinecap="round" opacity="0.95" />
      <path d="M 420 260 Q 440 250 460 270" fill="none" stroke={T.slate} strokeWidth="3" strokeLinecap="round" opacity="0.95" />
      <g transform="translate(252 100)">
        <rect width="58" height="16" rx="2" fill={T.bg2} stroke={T.line} />
        <text x="6" y="11" fontSize="9" fill={T.textDim} fontFamily={T.fontMono}>rect · 140×290</text>
      </g>
      <g transform="translate(440 380)">
        <rect width="172" height="58" rx="4" fill={T.bg2} stroke={T.line} fillOpacity="0.92" />
        <line x1="10" y1="18" x2="26" y2="18" stroke={T.accent} strokeWidth="3" strokeLinecap="round" />
        <text x="34" y="22" fontSize="10" fill={T.text} fontFamily={T.fontMono}>foreground hint</text>
        <line x1="10" y1="36" x2="26" y2="36" stroke={T.slate} strokeWidth="3" strokeLinecap="round" />
        <text x="34" y="40" fontSize="10" fill={T.text} fontFamily={T.fontMono}>background hint</text>
        <line x1="10" y1="50" x2="26" y2="50" stroke={T.text} strokeWidth="1.5" strokeDasharray="3 2" />
        <text x="34" y="54" fontSize="10" fill={T.textDim} fontFamily={T.fontMono}>bounding rect</text>
      </g>
    </g>
  );
}

function ContourSnapOverlay() {
  const drag = { x: 240, y: 305 };
  const snapTarget = { x: 262, y: 312 };
  return (
    <g>
      <path d={VASE_PATH} fill="none" stroke={T.accent} strokeWidth="1.5" />
      <g opacity="0.55">
        {Array.from({ length: 30 }).map((_, i) => {
          const t = i / 29;
          const y = 160 + t * 220;
          const x = 268 + Math.sin(t * 3.2) * 8;
          const len = 4 + ((i * 37) % 9);
          return (
            <line key={i} x1={x - len} y1={y} x2={x + len} y2={y} stroke={T.kiln} strokeWidth="1" strokeLinecap="round" opacity={0.3 + ((i * 13) % 7) / 14} />
          );
        })}
      </g>
      {VERTICES.map((v, i) => (
        <rect key={i} x={v.x - 2.5} y={v.y - 2.5} width="5" height="5" fill={T.bg} stroke={T.accent} strokeWidth="1.2" />
      ))}
      <circle cx={drag.x} cy={drag.y} r="22" fill="none" stroke={T.text} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      <circle cx={drag.x} cy={drag.y} r="22" fill={T.accent} fillOpacity="0.06" />
      <line x1={drag.x} y1={drag.y} x2={snapTarget.x} y2={snapTarget.y} stroke={T.kiln} strokeWidth="1.5" strokeDasharray="2 2" />
      <rect x={drag.x - 4} y={drag.y - 4} width="8" height="8" fill={T.text} stroke={T.accent} strokeWidth="1.5" />
      <circle cx={snapTarget.x} cy={snapTarget.y} r="6" fill="none" stroke={T.kiln} strokeWidth="1.5" />
      <circle cx={snapTarget.x} cy={snapTarget.y} r="2.5" fill={T.kiln} />
      <text x={drag.x - 21} y={drag.y - 26} fontSize="9" fill={T.textDim} fontFamily={T.fontMono}>r = 22 px</text>
      <g transform={`translate(${snapTarget.x + 12} ${snapTarget.y - 6})`}>
        <rect width="78" height="16" rx="2" fill={T.bg2} stroke="oklch(0.78 0.13 75 / 0.5)" />
        <text x="6" y="11" fontSize="9" fill={T.kiln} fontFamily={T.fontMono}>edge · 0.83 ▲</text>
      </g>
    </g>
  );
}

// ---- Context strip ----
const CONTEXT_META: Record<ToolName, { left: string; right: string }> = {
  prefill:  { left: "PRE-FILL · applying candidate mask", right: "" },
  brush:    { left: "BRUSH · r 16 · paint", right: "cursor 0, 0" },
  polygon:  { left: "POLY · 16 vertices · ε 1.4", right: "cursor 270, 240  ·  hover edge v8↔v9" },
  flood:    { left: "FLOOD · add · tol 28 · 4-way", right: "cursor 290, 240  ·  sample rgb(98,52,38)" },
  grabcut:  { left: "GRABCUT · rect 140×290 · iter 5", right: "cursor 312, 240  ·  hint FG" },
  snap:     { left: "SNAP · sobel · r 22 · τ 0.42", right: "cursor 240, 305  ·  target 262, 312" },
};

function ContextStrip({ tool }: { tool: ToolName }) {
  const meta = CONTEXT_META[tool];
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
      <span style={{ color: T.textDim }}>{meta.left}</span>
      <span>{meta.right}</span>
    </div>
  );
}

// ---- Tool label for corner badge ----
const TOOL_LABELS: Record<ToolName, string> = {
  prefill:  "PRE-FILL",
  brush:    "BRUSH · paint",
  polygon:  "POLYGON · v9 selected",
  flood:    "FLOOD · add",
  grabcut:  "GRABCUT · 5 iter",
  snap:     "CONTOUR SNAP",
};

// ---- Main canvas area ----
interface MaskEditorCanvasProps {
  state: MaskEditorState;
  maskCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function MaskEditorCanvas({
  state,
  maskCanvasRef,
  overlayCanvasRef,
}: MaskEditorCanvasProps) {
  const tool = state.activeTool;

  const overlay = {
    prefill:  null,
    brush:    <OverlayMaskFill />,
    polygon:  <PolygonOverlay selectedVertex={state.selectedVertex} />,
    flood:    <FloodOverlay />,
    grabcut:  <GrabCutOverlay />,
    snap:     <ContourSnapOverlay />,
  }[tool];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* canvas viewport */}
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
        {/* checker for off-canvas margin */}
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

        {/* SVG canvas (image + overlays) */}
        <svg
          viewBox="0 0 640 480"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <foreignObject x="0" y="0" width="640" height="480">
            <div style={{ width: 640, height: 480 }}>
              <PotteryImage />
            </div>
          </foreignObject>
          <rect x="0" y="0" width="640" height="480" fill="none" stroke={T.textMute} strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
          {overlay}
        </svg>

        {/* mask canvas (alpha = foreground) */}
        <canvas
          ref={maskCanvasRef}
          width={640}
          height={480}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: tool === "brush" ? "auto" : "none",
            opacity: 0,
          }}
        />

        {/* overlay canvas (polygon vertices, grabcut rect) */}
        <canvas
          ref={overlayCanvasRef}
          width={640}
          height={480}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: ["polygon", "grabcut", "snap"].includes(tool) ? "auto" : "none",
          }}
        />

        {/* corner badges */}
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6 }}>
          <Pill>{TOOL_LABELS[tool]}</Pill>
          <Pill kind="slate">640 × 480</Pill>
        </div>
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
          <Pill>67%</Pill>
          {state.dirty && <Pill kind="accent">● mask dirty</Pill>}
        </div>
      </div>

      <ContextStrip tool={tool} />
    </div>
  );
}

// Export canvas ref type helper
export type MaskCanvasRef = React.RefObject<HTMLCanvasElement | null>;
