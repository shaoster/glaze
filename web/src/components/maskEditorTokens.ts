// Design tokens for MaskEditor — warm graphite dark theme with terracotta accent.
// Kept in a separate .ts file so react-refresh only exports non-component constants.
export const T = {
  bg: "oklch(0.18 0.008 55)",
  bg1: "oklch(0.22 0.010 55)",
  bg2: "oklch(0.26 0.011 55)",
  bg3: "oklch(0.30 0.012 55)",
  line: "oklch(0.36 0.011 55)",
  lineSoft: "oklch(0.30 0.010 55)",
  text: "oklch(0.95 0.008 80)",
  textDim: "oklch(0.74 0.009 70)",
  textMute: "oklch(0.56 0.009 70)",
  accent: "oklch(0.70 0.12 40)",
  accentSoft: "oklch(0.70 0.12 40 / 0.18)",
  accentTint: "oklch(0.70 0.12 40 / 0.32)",
  slate: "oklch(0.72 0.04 230)",
  slateSoft: "oklch(0.72 0.04 230 / 0.18)",
  kiln: "oklch(0.78 0.13 75)",
  warn: "oklch(0.75 0.13 50)",
  ok: "oklch(0.72 0.13 145)",
  okSoft: "oklch(0.72 0.13 145 / 0.18)",
  fontUi:
    "'Manrope', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  fontMono: "'JetBrains Mono', ui-monospace, Menlo, monospace",
  fontDisplay: "'Instrument Serif', 'Times New Roman', serif",
} as const;
