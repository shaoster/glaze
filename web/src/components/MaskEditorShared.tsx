import type { CSSProperties, ReactNode } from "react";
import { T } from "./maskEditorTokens";

// ---- Kbd ----
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 3,
        border: `1px solid ${T.line}`,
        background: T.bg2,
        color: T.textDim,
        fontFamily: T.fontMono,
        fontSize: 10,
        lineHeight: 1.3,
        minWidth: 14,
        textAlign: "center",
      }}
    >
      {children}
    </span>
  );
}

// ---- Pill ----
type PillKind = "default" | "accent" | "ok" | "slate" | "warn";

const PILL_KINDS: Record<PillKind, { bg: string; color: string; border: string }> = {
  default: { bg: T.bg2, color: T.textDim, border: T.line },
  accent: {
    bg: T.accentSoft,
    color: T.accent,
    border: "oklch(0.70 0.12 40 / 0.4)",
  },
  ok: {
    bg: T.okSoft,
    color: T.ok,
    border: "oklch(0.72 0.13 145 / 0.4)",
  },
  slate: {
    bg: T.slateSoft,
    color: T.slate,
    border: "oklch(0.72 0.04 230 / 0.4)",
  },
  warn: {
    bg: "oklch(0.75 0.13 50 / 0.16)",
    color: T.warn,
    border: "oklch(0.75 0.13 50 / 0.4)",
  },
};

interface PillProps {
  children: ReactNode;
  kind?: PillKind;
  mono?: boolean;
}

export function Pill({ children, kind = "default", mono = true }: PillProps) {
  const c = PILL_KINDS[kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 9px",
        borderRadius: 999,
        fontFamily: mono ? T.fontMono : T.fontUi,
        fontSize: 10.5,
        letterSpacing: "0.02em",
        background: c.bg,
        color: c.color,
        border: `1px solid ${c.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// ---- Section ----
interface SectionProps {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}

export function Section({ title, hint, children, action }: SectionProps) {
  return (
    <div
      style={{ borderBottom: `1px solid ${T.lineSoft}`, padding: "14px 16px" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: T.fontMono,
              fontSize: 10,
              color: T.textMute,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            {title}
          </div>
          {hint ? (
            <div
              style={{
                fontSize: 11,
                color: T.textMute,
                marginTop: 4,
                lineHeight: 1.45,
              }}
            >
              {hint}
            </div>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---- Slider ----
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  tickAt?: number;
  onChange?: (value: number) => void;
}

export function MESlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  tickAt,
  onChange,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const tickPct = tickAt != null ? ((tickAt - min) / (max - min)) * 100 : null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, color: T.textDim }}>{label}</span>
        <span
          style={{
            fontSize: 11,
            color: T.text,
            fontFamily: T.fontMono,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
          {unit}
        </span>
      </div>
      <div style={{ position: "relative", height: 18 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 8,
            height: 2,
            background: T.bg3,
            borderRadius: 99,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            height: 2,
            width: `${pct}%`,
            background: T.accent,
            borderRadius: 99,
          }}
        />
        {tickPct != null && (
          <div
            title="default"
            style={{
              position: "absolute",
              left: `${tickPct}%`,
              top: 5,
              width: 1,
              height: 8,
              background: T.textMute,
              opacity: 0.6,
              transform: "translateX(-0.5px)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            left: `${pct}%`,
            top: 3,
            width: 12,
            height: 12,
            background: T.text,
            border: `2px solid ${T.accent}`,
            borderRadius: "50%",
            transform: "translateX(-6px)",
            boxShadow: "0 1px 3px oklch(0 0 0 / 0.4)",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange?.(parseFloat(e.target.value))}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            opacity: 0,
            cursor: "pointer",
            margin: 0,
          }}
        />
      </div>
    </div>
  );
}

// ---- Stepper ----
interface StepperProps {
  label: string;
  value: string | number;
  sub?: string;
  onDecrement?: () => void;
  onIncrement?: () => void;
}

const STEP_BTN: CSSProperties = {
  background: "transparent",
  border: "none",
  color: T.textDim,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
};

export function Stepper({
  label,
  value,
  sub,
  onDecrement,
  onIncrement,
}: StepperProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: T.textDim }}>{label}</div>
        {sub ? (
          <div
            style={{
              fontSize: 10,
              color: T.textMute,
              marginTop: 2,
              fontFamily: T.fontMono,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: "inline-flex",
          border: `1px solid ${T.line}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <button style={STEP_BTN} onClick={onDecrement}>
          −
        </button>
        <div
          style={{
            minWidth: 32,
            textAlign: "center",
            padding: "4px 8px",
            fontFamily: T.fontMono,
            fontSize: 12,
            color: T.text,
            borderLeft: `1px solid ${T.line}`,
            borderRight: `1px solid ${T.line}`,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
        <button style={STEP_BTN} onClick={onIncrement}>
          +
        </button>
      </div>
    </div>
  );
}

// ---- Segmented ----
interface SegmentedOption {
  value: string;
  label: ReactNode;
  dot?: string;
}

interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
}

export function Segmented({ options, value, onChange }: SegmentedProps) {
  return (
    <div
      style={{
        display: "flex",
        border: `1px solid ${T.line}`,
        borderRadius: 6,
        padding: 2,
        background: T.bg,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange?.(o.value)}
          style={{
            flex: 1,
            background: o.value === value ? T.bg3 : "transparent",
            border: "none",
            color: o.value === value ? T.text : T.textMute,
            padding: "6px 8px",
            fontSize: 11,
            borderRadius: 4,
            fontFamily: T.fontUi,
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            boxShadow:
              o.value === value ? "0 1px 2px oklch(0 0 0 / 0.25)" : "none",
          }}
        >
          {o.dot ? (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: o.dot,
              }}
            />
          ) : null}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Toggle ----
interface ToggleProps {
  on: boolean;
  label: string;
  onChange?: (on: boolean) => void;
}

export function Toggle({ on, label, onChange }: ToggleProps) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 11, color: T.textDim }}>{label}</span>
      <span
        onClick={() => onChange?.(!on)}
        style={{
          width: 28,
          height: 16,
          borderRadius: 999,
          background: on ? T.accent : T.bg3,
          position: "relative",
          transition: "background 0.15s",
          border: `1px solid ${on ? "transparent" : T.line}`,
          flexShrink: 0,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: on ? 13 : 1,
            width: 12,
            height: 12,
            background: T.text,
            borderRadius: "50%",
            transition: "left 0.15s",
          }}
        />
      </span>
    </label>
  );
}

// ---- Stat ----
interface StatProps {
  label: string;
  value: ReactNode;
  mono?: boolean;
  pos?: boolean;
}

export function Stat({ label, value, mono = true, pos }: StatProps) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          color: T.textMute,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontFamily: T.fontUi,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? T.fontMono : T.fontUi,
          fontSize: 12,
          color: pos ? T.ok : T.text,
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ---- ShortcutRow ----
interface ShortcutRowProps {
  keys: string[];
  label: string;
}

export function ShortcutRow({ keys, label }: ShortcutRowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "5px 0",
        fontSize: 11,
        color: T.textDim,
      }}
    >
      <span>{label}</span>
      <span style={{ display: "inline-flex", gap: 3 }}>
        {keys.map((k, i) => (
          <Kbd key={i}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}

// ---- Spinner ----
export function Spinner({ size = 12 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.max(1.5, size / 8)}px solid currentColor`,
        borderTopColor: "transparent",
        animation: "me-spin 0.6s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// Inject keyframe once — safe to call multiple times
if (typeof document !== "undefined" && !document.getElementById("me-keyframes")) {
  const style = document.createElement("style");
  style.id = "me-keyframes";
  style.textContent = `@keyframes me-spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

// ---- ActionButton ----
interface ActionButtonProps {
  children: ReactNode;
  primary?: boolean;
  dim?: boolean;
  full?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}

export function ActionButton({
  children,
  primary,
  dim,
  full,
  icon,
  loading,
  onClick,
  disabled,
}: ActionButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        width: full ? "100%" : "auto",
        padding: "7px 12px",
        borderRadius: 6,
        border: primary ? "none" : `1px solid ${T.line}`,
        background: primary ? T.accent : "transparent",
        color: primary
          ? "oklch(0.99 0.005 85)"
          : dim
            ? T.textMute
            : T.text,
        fontSize: 11.5,
        fontFamily: T.fontUi,
        fontWeight: primary ? 600 : 500,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        boxShadow: primary
          ? "0 1px 0 oklch(0.3 0.05 40 / 0.3) inset, 0 2px 6px oklch(0.4 0.08 40 / 0.2)"
          : "none",
      }}
    >
      {loading ? <Spinner size={12} /> : icon}
      {children}
    </button>
  );
}

// ---- InspectorShell ----
interface InspectorShellProps {
  title: string;
  sub?: string;
  children: ReactNode;
}

export function InspectorShell({ title, sub, children }: InspectorShellProps) {
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: T.bg1,
        borderLeft: `1px solid ${T.line}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div
          style={{
            fontFamily: T.fontDisplay,
            fontSize: 22,
            color: T.text,
            lineHeight: 1,
            letterSpacing: "0.01em",
          }}
        >
          {title}
        </div>
        {sub ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: T.textMute,
              lineHeight: 1.5,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>{children}</div>
    </div>
  );
}
