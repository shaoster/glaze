import type { Dispatch } from "react";
import MEIcon from "./MaskEditorIcons";
import {
  ActionButton,
  InspectorShell,
  MESlider,
  Pill,
  Section,
  Segmented,
  ShortcutRow,
  Stat,
  Stepper,
  Toggle,
} from "./MaskEditorShared";
import { T } from "./maskEditorTokens";
import type {
  EdgeOperator,
  FloodConnectivity,
  FloodMode,
  GrabCutHintMode,
  MaskEditorAction,
  MaskEditorState,
  SnapTarget,
  ToolName,
} from "./maskEditorState";

// ---- Polygon inspector ----
interface PolygonInspectorProps {
  state: MaskEditorState;
  dispatch: Dispatch<MaskEditorAction>;
  onClosePolygon?: () => void;
  onApplyPolygon?: () => void;
  onReopenPolygon?: () => void;
  onInsertVertex?: () => void;
  onSmoothPolygon?: () => void;
  onSimplifyPolygon?: () => void;
}

function PolygonInspector({ state, dispatch, onClosePolygon, onApplyPolygon, onReopenPolygon, onInsertVertex, onSmoothPolygon, onSimplifyPolygon }: PolygonInspectorProps) {
  const nVerts = state.polygonVertices.length;
  const sel = state.selectedVertex;
  const closed = state.polygonClosed;
  return (
    <InspectorShell
      title="Polygon"
      sub="Vertices on the mask contour. Drag to move, click an edge to insert, ⌫ to delete."
    >
      <Section
        title="Selection"
        action={sel != null ? <Pill kind="accent">v{sel}</Pill> : undefined}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            fontFamily: T.fontMono,
            fontSize: 10.5,
          }}
        >
          <Stat label="vertices" value={nVerts} />
        </div>
      </Section>

      <Section title="Actions">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <ActionButton
            full
            icon={<MEIcon name="x" size={11} />}
            onClick={() =>
              sel != null &&
              dispatch({ type: "polygon_vertex_deleted", index: sel })
            }
            disabled={sel == null}
          >
            Delete v{sel ?? "—"}
          </ActionButton>
          <ActionButton full onClick={onInsertVertex} disabled={sel == null || nVerts < 2}>
            Insert here · I
          </ActionButton>
          <ActionButton full onClick={onSmoothPolygon} disabled={nVerts < 3}>
            Smooth ×3
          </ActionButton>
          {!closed ? (
            <ActionButton primary full onClick={onClosePolygon} disabled={nVerts < 3}>
              Close path · ⏎
            </ActionButton>
          ) : (
            <ActionButton full onClick={onReopenPolygon}>
              Reopen path
            </ActionButton>
          )}
        </div>
        {closed && (
          <ActionButton primary full icon={<MEIcon name="check" size={11} />} onClick={onApplyPolygon} disabled={nVerts < 3}>
            Apply to mask · ⏎
          </ActionButton>
        )}
      </Section>

      <Section
        title="Simplify"
        hint="Douglas–Peucker. Lower ε keeps more vertices."
      >
        <MESlider
          label="Epsilon (ε)"
          value={state.polygonSimplifyEps}
          min={0}
          max={6}
          step={0.1}
          unit=" px"
          tickAt={1}
          onChange={(v) =>
            dispatch({ type: "set_polygon_simplify_eps", eps: v })
          }
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 10.5,
            fontFamily: T.fontMono,
            color: T.textMute,
            marginTop: 4,
            padding: "8px 0",
            borderTop: `1px dashed ${T.lineSoft}`,
          }}
        >
          <span>
            {nVerts} → {Math.max(3, nVerts - 5)} vertices
          </span>
          <span style={{ color: T.ok }}>Δ IoU −0.4%</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <ActionButton primary full onClick={onSimplifyPolygon} disabled={nVerts < 3}>
            Apply simplify
          </ActionButton>
        </div>
      </Section>

      <Section
        title="Snap on drag"
        hint="Pulls vertices toward image edges as you move them — same engine as Contour snap."
      >
        <Toggle
          on={state.polygonLiveSnap}
          label="Live snap while dragging"
          onChange={(on) => dispatch({ type: "set_polygon_live_snap", on })}
        />
        <MESlider
          label="Snap radius"
          value={state.polygonSnapRadius}
          min={2}
          max={32}
          unit=" px"
          tickAt={8}
          onChange={(v) =>
            dispatch({ type: "set_polygon_snap_radius", radius: v })
          }
        />
      </Section>

      <Section title="Keyboard">
        <ShortcutRow keys={["⏎"]} label={closed ? "apply to mask" : "close path"} />
        <ShortcutRow keys={["I"]} label="insert at midpoint" />
        <ShortcutRow keys={["⌫"]} label="delete selected" />
        <ShortcutRow keys={["⇧", "drag"]} label="move along edge" />
        <ShortcutRow keys={["⌥", "click"]} label="break to bezier" />
      </Section>
    </InspectorShell>
  );
}

// ---- Tone histogram ----
function ToneHistogram() {
  const bars = Array.from({ length: 32 }, (_, i) => {
    const t = i / 31;
    const a = Math.exp(-Math.pow((t - 0.22) / 0.08, 2));
    const b = Math.exp(-Math.pow((t - 0.62) / 0.14, 2)) * 0.7;
    return a + b;
  });
  const max = Math.max(...bars);
  return (
    <div
      style={{
        position: "relative",
        height: 44,
        background: T.bg,
        borderRadius: 4,
        border: `1px solid ${T.lineSoft}`,
        padding: 4,
        marginTop: 6,
        display: "flex",
        alignItems: "flex-end",
        gap: 1,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: `${4 + 0.14 * 100}%`,
          width: `${0.16 * 100}%`,
          background: T.accentSoft,
          borderRadius: 2,
        }}
      />
      {bars.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${(v / max) * 100}%`,
            background: T.textDim,
            opacity: 0.7,
            borderRadius: 1,
            position: "relative",
            zIndex: 1,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: `${4 + 0.22 * 100}%`,
          width: 1,
          background: T.accent,
          zIndex: 2,
        }}
      />
    </div>
  );
}

// ---- Flood inspector ----
interface FloodInspectorProps {
  state: MaskEditorState;
  dispatch: Dispatch<MaskEditorAction>;
  onFloodCommit?: () => void;
}

function FloodInspector({ state, dispatch, onFloodCommit }: FloodInspectorProps) {
  return (
    <InspectorShell
      title="Flood fill"
      sub="Click a region; pixels similar to that sample are added to or removed from the mask."
    >
      <Section title="Mode">
        <Segmented
          value={state.floodMode}
          options={[
            { value: "add" as FloodMode, label: "＋ Add", dot: T.accent },
            { value: "subtract" as FloodMode, label: "－ Subtract", dot: T.slate },
          ]}
          onChange={(v) =>
            dispatch({ type: "set_flood_mode", mode: v as FloodMode })
          }
        />
      </Section>

      <Section
        title="Tolerance"
        hint="How much pixel values may differ from the sampled point."
      >
        <MESlider
          label="Δ ‖Lab‖"
          value={state.floodTolerance}
          min={0}
          max={120}
          tickAt={32}
          onChange={(v) => dispatch({ type: "set_flood_tolerance", tolerance: v })}
        />
        <ToneHistogram />
        <div
          style={{
            fontSize: 10,
            fontFamily: T.fontMono,
            color: T.textMute,
            marginTop: 4,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>← darker</span>
          <span>lighter →</span>
        </div>
      </Section>

      <Section title="Sample">
        <Stepper
          label="Sample size"
          value={`${state.floodSampleSize} × ${state.floodSampleSize}`}
          sub="median of N×N around the click"
          onDecrement={() =>
            dispatch({
              type: "set_flood_sample_size",
              size: Math.max(1, state.floodSampleSize - 2),
            })
          }
          onIncrement={() =>
            dispatch({
              type: "set_flood_sample_size",
              size: Math.min(9, state.floodSampleSize + 2),
            })
          }
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 6,
            border: `1px solid ${T.line}`,
            background: T.bg,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              background: "oklch(0.42 0.07 32)",
              border: `1px solid ${T.line}`,
            }}
          />
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: 10,
              color: T.textDim,
              lineHeight: 1.5,
            }}
          >
            <div>rgb(98, 52, 38)</div>
            <div style={{ color: T.textMute }}>Lab(28, 18, 14)</div>
          </div>
        </div>
      </Section>

      <Section title="Region">
        <Segmented
          value={state.floodConnectivity}
          options={[
            { value: "4" as FloodConnectivity, label: "4-way" },
            { value: "8" as FloodConnectivity, label: "8-way" },
          ]}
          onChange={(v) =>
            dispatch({
              type: "set_flood_connectivity",
              connectivity: v as FloodConnectivity,
            })
          }
        />
        <div style={{ height: 8 }} />
        <Toggle
          on={state.floodContiguous}
          label="Contiguous only"
          onChange={(on) => dispatch({ type: "set_flood_contiguous", contiguous: on })}
        />
        <Toggle
          on={state.floodAntiAlias}
          label="Anti-alias edge"
          onChange={(on) => dispatch({ type: "set_flood_anti_alias", antiAlias: on })}
        />
      </Section>

      <Section title="Preview">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: T.fontMono,
            fontSize: 10.5,
            color: T.textDim,
          }}
        >
          <span>+ 4,218 px</span>
          <span style={{ color: T.ok }}>+1.4% FG</span>
        </div>
        <div style={{ height: 10 }} />
        <ActionButton primary full icon={<MEIcon name="check" size={11} />} onClick={onFloodCommit}>
          Commit fill
        </ActionButton>
      </Section>
    </InspectorShell>
  );
}

// ---- GrabCut inspector ----
function HintModeRow({
  active,
  label,
  sub,
  swatch,
  stroke,
  onClick,
}: {
  active: boolean;
  label: string;
  sub: string;
  swatch: string;
  stroke?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        background: active ? T.bg3 : T.bg,
        border: `1px solid ${active ? T.line : T.lineSoft}`,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          background: stroke ? "transparent" : swatch,
          border: stroke ? `2px dashed ${swatch}` : `1px solid ${T.line}`,
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            color: T.text,
            fontWeight: active ? 600 : 500,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 10.5, color: T.textMute, marginTop: 1 }}>
          {sub}
        </div>
      </div>
      {active ? <Pill kind="accent">active</Pill> : null}
    </div>
  );
}

function TopologyChip({ on, label, sub }: { on: boolean; label: string; sub: string }) {
  return (
    <div
      style={{
        flex: 1,
        padding: "8px 10px",
        borderRadius: 6,
        background: on ? T.bg3 : T.bg,
        border: `1px solid ${on ? T.accent : T.line}`,
        opacity: on ? 1 : 0.6,
      }}
    >
      <div
        style={{
          fontFamily: T.fontMono,
          fontSize: 10,
          color: on ? T.text : T.textDim,
          lineHeight: 1.3,
        }}
      >
        {label}
      </div>
      <div
        style={{ fontFamily: T.fontMono, fontSize: 9, color: T.textMute, marginTop: 3 }}
      >
        {sub}
      </div>
    </div>
  );
}

interface GrabCutInspectorProps {
  state: MaskEditorState;
  dispatch: Dispatch<MaskEditorAction>;
  onRunGrabCut?: () => void;
}

function GrabCutInspector({ state, dispatch, onRunGrabCut }: GrabCutInspectorProps) {
  const isLoading = state.assistStatus === "loading";
  return (
    <InspectorShell
      title="GrabCut"
      sub="Draw a rect around the piece; optionally scribble FG/BG hints to fix mistakes, then refine."
    >
      <Section title="Hint mode">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(
            [
              { id: "rect" as GrabCutHintMode, label: "Bounding rect", sub: "defines the search region", swatch: T.text, stroke: true },
              { id: "foreground" as GrabCutHintMode, label: "Foreground", sub: "scribble what is part of the piece", swatch: T.accent, stroke: false },
              { id: "background" as GrabCutHintMode, label: "Background", sub: "scribble what should be excluded", swatch: T.slate, stroke: false },
            ]
          ).map((row) => (
            <HintModeRow
              key={row.id}
              active={state.grabcutHintMode === row.id}
              label={row.label}
              sub={row.sub}
              swatch={row.swatch}
              stroke={row.stroke}
              onClick={() =>
                dispatch({ type: "set_grabcut_hint_mode", mode: row.id })
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Parameters">
        <MESlider
          label="Brush radius"
          value={state.grabcutBrushRadius}
          min={1}
          max={40}
          unit=" px"
          onChange={(v) =>
            dispatch({ type: "set_grabcut_brush_radius", radius: v })
          }
        />
        <Stepper
          label="Iterations"
          value={state.grabcutIterations}
          sub="more = tighter, slower"
          onDecrement={() =>
            dispatch({
              type: "set_grabcut_iterations",
              iterations: Math.max(1, state.grabcutIterations - 1),
            })
          }
          onIncrement={() =>
            dispatch({
              type: "set_grabcut_iterations",
              iterations: Math.min(20, state.grabcutIterations + 1),
            })
          }
        />
      </Section>

      <Section title="Run" action={<Pill kind="ok">ready</Pill>}>
        <ActionButton
          primary
          full
          icon={<MEIcon name="play" size={11} />}
          onClick={onRunGrabCut}
          disabled={isLoading || !state.grabcutRect}
        >
          {isLoading ? "Running…" : "Refine mask  ·  ⌘↵"}
        </ActionButton>
        {state.lastAssistMs != null && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 6,
              border: `1px dashed ${T.lineSoft}`,
              background: T.bg,
            }}
          >
            <div
              style={{
                fontFamily: T.fontMono,
                fontSize: 10,
                color: T.textMute,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Last run
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              <Stat label="latency" value={`${state.lastAssistMs} ms`} />
              <Stat label="iters" value={state.grabcutIterations} />
              <Stat label="Δ IoU" value="+0.18" pos />
              <Stat label="px Δ" value="+1,840" />
            </div>
          </div>
        )}
        {state.assistError && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: T.warn,
              fontFamily: T.fontMono,
            }}
          >
            {state.assistError}
          </div>
        )}
      </Section>

      <Section
        title="Topology"
        hint="Decision lives in docs/agents/glaze-domain.md."
      >
        <div style={{ display: "flex", gap: 6 }}>
          <TopologyChip on label="opencv.js  ·  wasm" sub="local · 8 MB" />
          <TopologyChip on={false} label="POST /assists/grabcut" sub="server" />
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: T.fontMono,
            fontSize: 10,
            color: T.textMute,
            lineHeight: 1.55,
          }}
        >
          Last 10 runs: median 462 ms · p95 712 ms
        </div>
      </Section>

      <Section title="Keyboard">
        <ShortcutRow keys={["R"]} label="reset rect" />
        <ShortcutRow keys={["F"]} label="foreground hint" />
        <ShortcutRow keys={["G"]} label="background hint" />
        <ShortcutRow keys={["⌘", "↵"]} label="refine" />
      </Section>
    </InspectorShell>
  );
}

// ---- Gradient preview (contour snap) ----
function GradientPreview() {
  return (
    <div
      style={{
        height: 56,
        borderRadius: 6,
        overflow: "hidden",
        border: `1px solid ${T.lineSoft}`,
        position: "relative",
        background: T.bg,
      }}
    >
      <svg
        viewBox="0 0 240 56"
        preserveAspectRatio="none"
        style={{ width: "100%", height: "100%" }}
      >
        <defs>
          <linearGradient id="me-grad-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.18 0.008 55)" />
            <stop offset="100%" stopColor="oklch(0.22 0.010 55)" />
          </linearGradient>
        </defs>
        <rect width="240" height="56" fill="url(#me-grad-bg)" />
        {Array.from({ length: 60 }).map((_, i) => {
          const x = i * 4;
          const e1 = Math.exp(-Math.pow((x - 80) / 6, 2));
          const e2 = Math.exp(-Math.pow((x - 160) / 7, 2)) * 0.85;
          const intensity = e1 + e2 + ((i * 17) % 5) / 40;
          return (
            <line
              key={i}
              x1={x} y1="4" x2={x} y2="52"
              stroke={T.kiln}
              strokeWidth="3"
              opacity={Math.min(0.85, intensity * 0.95)}
            />
          );
        })}
        <line x1="0" y1="28" x2="240" y2="28" stroke={T.accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />
        <text x="6" y="14" fontSize="9" fontFamily={T.fontMono} fill={T.textDim}>edge</text>
        <text x="218" y="48" fontSize="9" fontFamily={T.fontMono} fill={T.textMute}>0</text>
      </svg>
    </div>
  );
}

// ---- Contour snap inspector ----
interface SnapInspectorProps {
  state: MaskEditorState;
  dispatch: Dispatch<MaskEditorAction>;
  onSnapVertex?: () => void;
  onSnapAll?: () => void;
}

function SnapInspector({ state, dispatch, onSnapVertex, onSnapAll }: SnapInspectorProps) {
  const nVerts = state.polygonVertices.length;
  const sel = state.selectedVertex;
  const hasVerts = nVerts > 0;
  return (
    <InspectorShell
      title="Contour snap"
      sub="Pulls polygon vertices toward the nearest strong image edge. Use on whole contours or per-vertex."
    >
      {!hasVerts && (
        <div
          style={{
            margin: "12px 0 4px",
            padding: "10px 12px",
            borderRadius: 6,
            border: `1px dashed ${T.lineSoft}`,
            background: T.bg,
            fontFamily: T.fontMono,
            fontSize: 10.5,
            color: T.textMute,
            lineHeight: 1.5,
          }}
        >
          Draw a polygon path first, then switch to Contour snap to pull vertices to image edges.
        </div>
      )}
      <Section title="Target">
        <Segmented
          value={state.snapTarget}
          options={[
            { value: "vertex" as SnapTarget, label: "Selected vertex" },
            { value: "all" as SnapTarget, label: "All vertices" },
          ]}
          onChange={(v) =>
            dispatch({ type: "set_snap_target", target: v as SnapTarget })
          }
        />
      </Section>

      <Section title="Search">
        <MESlider
          label="Search radius"
          value={state.snapRadius}
          min={2}
          max={64}
          unit=" px"
          tickAt={16}
          onChange={(v) => dispatch({ type: "set_snap_radius", radius: v })}
        />
        <MESlider
          label="Edge strength threshold"
          value={state.snapEdgeThreshold}
          min={0}
          max={1}
          step={0.01}
          tickAt={0.35}
          onChange={(v) =>
            dispatch({ type: "set_snap_edge_threshold", threshold: v })
          }
        />
      </Section>

      <Section title="Edge operator">
        <Segmented
          value={state.snapEdgeOperator}
          options={[
            { value: "sobel" as EdgeOperator, label: "Sobel" },
            { value: "scharr" as EdgeOperator, label: "Scharr" },
            { value: "canny" as EdgeOperator, label: "Canny" },
          ]}
          onChange={(v) =>
            dispatch({
              type: "set_snap_edge_operator",
              operator: v as EdgeOperator,
            })
          }
        />
        <div style={{ height: 10 }} />
        <GradientPreview />
        <div
          style={{
            fontFamily: T.fontMono,
            fontSize: 10,
            color: T.textMute,
            marginTop: 6,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>‖∇I‖ preview</span>
          <span>blur σ = 1.2</span>
        </div>
      </Section>

      <Section
        title="Run"
        action={hasVerts ? <Pill kind={sel != null ? "accent" : "default"}>v{sel ?? "—"} / {nVerts}</Pill> : undefined}
      >
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}
        >
          <ActionButton full onClick={onSnapVertex} disabled={sel == null || !hasVerts}>
            Snap v{sel ?? "—"} · S
          </ActionButton>
          <ActionButton primary full onClick={onSnapAll} disabled={!hasVerts}>
            Snap all ({nVerts}) · ⇧S
          </ActionButton>
        </div>
        {hasVerts && (
          <div
            style={{
              marginTop: 8,
              fontFamily: T.fontMono,
              fontSize: 10,
              color: T.textMute,
              lineHeight: 1.6,
            }}
          >
            Click a vertex to select · ←/→ cycle through vertices
          </div>
        )}
      </Section>

      <Section title="Safety">
        <Toggle
          on={state.snapRejectBelow}
          label="Reject snap if edge < threshold"
          onChange={(on) => dispatch({ type: "set_snap_reject_below", on })}
        />
        <Toggle
          on={state.snapAcrossDiscontinuities}
          label="Allow snap across discontinuities"
          onChange={(on) =>
            dispatch({ type: "set_snap_across_discontinuities", on })
          }
        />
      </Section>

      <Section title="Keyboard">
        <ShortcutRow keys={["S"]} label="snap selected vertex" />
        <ShortcutRow keys={["⇧", "S"]} label="snap all" />
        <ShortcutRow keys={["←", "→"]} label="cycle through vertices" />
        <ShortcutRow keys={["click"]} label="select vertex" />
        <ShortcutRow keys={["[", "]"]} label="adjust radius" />
      </Section>
    </InspectorShell>
  );
}

// ---- Placeholder inspectors for pre-fill and brush ----
function PlaceholderInspector({ title }: { title: string }) {
  return (
    <InspectorShell title={title}>
      <div
        style={{
          padding: "24px 16px",
          fontSize: 11,
          color: T.textMute,
          fontFamily: T.fontMono,
        }}
      >
        Controls are baked into the underlying component.
      </div>
    </InspectorShell>
  );
}

// ---- Dispatcher ----
interface MaskEditorInspectorProps {
  state: MaskEditorState;
  dispatch: Dispatch<MaskEditorAction>;
  activeTool: ToolName;
  onClosePolygon?: () => void;
  onApplyPolygon?: () => void;
  onReopenPolygon?: () => void;
  onInsertVertex?: () => void;
  onSmoothPolygon?: () => void;
  onSimplifyPolygon?: () => void;
  onFloodCommit?: () => void;
  onRunGrabCut?: () => void;
  onSnapVertex?: () => void;
  onSnapAll?: () => void;
}

export default function MaskEditorInspector({
  state,
  dispatch,
  activeTool,
  onClosePolygon,
  onApplyPolygon,
  onReopenPolygon,
  onInsertVertex,
  onSmoothPolygon,
  onSimplifyPolygon,
  onFloodCommit,
  onRunGrabCut,
  onSnapVertex,
  onSnapAll,
}: MaskEditorInspectorProps) {
  switch (activeTool) {
    case "prefill":
      return <PlaceholderInspector title="Pre-fill" />;
    case "polygon":
      return (
        <PolygonInspector
          state={state}
          dispatch={dispatch}
          onClosePolygon={onClosePolygon}
          onApplyPolygon={onApplyPolygon}
          onReopenPolygon={onReopenPolygon}
          onInsertVertex={onInsertVertex}
          onSmoothPolygon={onSmoothPolygon}
          onSimplifyPolygon={onSimplifyPolygon}
        />
      );
    case "flood":
      return <FloodInspector state={state} dispatch={dispatch} onFloodCommit={onFloodCommit} />;
    case "grabcut":
      return (
        <GrabCutInspector
          state={state}
          dispatch={dispatch}
          onRunGrabCut={onRunGrabCut}
        />
      );
    case "snap":
      return (
        <SnapInspector
          state={state}
          dispatch={dispatch}
          onSnapVertex={onSnapVertex}
          onSnapAll={onSnapAll}
        />
      );
  }
}
