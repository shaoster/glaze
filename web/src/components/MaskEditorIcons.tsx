import type { CSSProperties } from "react";

interface MEIconProps {
  name: keyof typeof PATHS;
  size?: number;
  style?: CSSProperties;
}

const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS = {
  layers: (
    <>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </>
  ),
  brush: (
    <>
      <path d="M9 15 L4 20" />
      <path d="M14 4 L20 10 L11 19 H7 V15 Z" />
    </>
  ),
  polygon: (
    <>
      <polygon points="12 3 21 9 18 20 6 20 3 9" />
      <circle cx="12" cy="3" r="1.6" fill="currentColor" />
      <circle cx="21" cy="9" r="1.6" fill="currentColor" />
      <circle cx="18" cy="20" r="1.6" fill="currentColor" />
      <circle cx="6" cy="20" r="1.6" fill="currentColor" />
      <circle cx="3" cy="9" r="1.6" fill="currentColor" />
    </>
  ),
  flood: (
    <>
      <path d="M12 3 L4 13 a8 8 0 0 0 16 0 Z" />
      <path d="M20 18 c0 1.5 -1.2 3 -2.5 3 s-2.5 -1.5 -2.5 -3 c0 -1.2 2.5 -4 2.5 -4 s2.5 2.8 2.5 4 Z" />
    </>
  ),
  eraser: (
    <>
      <path d="M20 20 H9 L4 15 l10 -10 7 7 -1 8 Z" />
      <line x1="4" y1="15" x2="14" y2="5" />
    </>
  ),
  grabcut: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="3 3" />
      <path d="M7 12 Q10 9 13 12 T19 12" />
    </>
  ),
  snap: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2 V5" />
      <path d="M12 19 V22" />
      <path d="M2 12 H5" />
      <path d="M19 12 H22" />
      <path d="M5 5 L7 7" />
      <path d="M17 17 L19 19" />
      <path d="M5 19 L7 17" />
      <path d="M17 7 L19 5" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 L4 9 L9 4" />
      <path d="M4 9 H14 a6 6 0 0 1 6 6 v0 a6 6 0 0 1 -6 6 H9" />
    </>
  ),
  redo: (
    <>
      <path d="M15 14 L20 9 L15 4" />
      <path d="M20 9 H10 a6 6 0 0 0 -6 6 v0 a6 6 0 0 0 6 6 H15" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12 S5 5 12 5 s10 7 10 7 -3 7 -10 7 S2 12 2 12 Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  zoom: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <line x1="8" y1="11" x2="14" y2="11" />
      <line x1="11" y1="8" x2="11" y2="14" />
    </>
  ),
  x: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  check: <polyline points="5 12 10 17 20 7" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" />
    </>
  ),
  play: <polygon points="6 4 20 12 6 20" fill="currentColor" />,
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="1.5" />
      <line x1="6" y1="10" x2="6" y2="10" />
      <line x1="10" y1="10" x2="10" y2="10" />
      <line x1="14" y1="10" x2="14" y2="10" />
      <line x1="18" y1="10" x2="18" y2="10" />
      <line x1="6" y1="14" x2="18" y2="14" />
    </>
  ),
};

export default function MEIcon({ name, size = 18, style }: MEIconProps) {
  return (
    <svg
      {...SVG_PROPS}
      width={size}
      height={size}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
