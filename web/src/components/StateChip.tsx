import { Box, ButtonBase, type SxProps, type Theme } from "@mui/material";

const DEFAULT_STATE_COLOR = "oklch(0.66 0.17 35)";
const COMPLETED_STATE_COLOR = "oklch(0.72 0.17 145)";
const RECYCLED_STATE_COLOR = "oklch(0.63 0.23 25)";
const PAST_STATE_COLOR = "oklch(0.62 0 0)";

export type StateChipVariant = "current" | "past" | "future";

export interface StateChipProps {
  state: string;
  label: string;
  description?: string;
  variant: StateChipVariant;
  isTerminal: boolean;
  /** Past chip highlighted as the rewind target; current chip displaced by a rewind. */
  muted?: boolean;
  /** This chip is the actively selected rewind target (only meaningful on past chips). */
  rewindSelected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}

function getStateColor(state: string, isTerminal: boolean): string {
  if (isTerminal && state === "completed") {
    return COMPLETED_STATE_COLOR;
  }
  if (isTerminal && state === "recycled") {
    return RECYCLED_STATE_COLOR;
  }
  return DEFAULT_STATE_COLOR;
}

export default function StateChip({
  state,
  label,
  description,
  variant,
  isTerminal,
  muted = false,
  rewindSelected = false,
  disabled = false,
  onClick,
  onHoverStart,
  onHoverEnd,
}: StateChipProps) {
  const interactive = !!onClick;

  // rewindSelected past chips use the actual state color, not grey.
  const baseColor =
    variant === "past" && !rewindSelected
      ? PAST_STATE_COLOR
      : getStateColor(state, isTerminal);

  const outlineColor = muted
    ? `color-mix(in oklab, ${PAST_STATE_COLOR} 55%, transparent)`
    : baseColor;

  const backgroundColor = (() => {
    if (variant === "current") {
      return muted
        ? `color-mix(in oklab, ${PAST_STATE_COLOR} 14%, transparent)`
        : `color-mix(in oklab, ${baseColor} 18%, transparent)`;
    }
    if (variant === "past") {
      return rewindSelected
        ? `color-mix(in oklab, ${baseColor} 16%, transparent)`
        : `color-mix(in oklab, ${PAST_STATE_COLOR} 10%, transparent)`;
    }
    return "transparent";
  })();

  const dotFillColor = (() => {
    if (variant === "current") {
      return muted
        ? `color-mix(in oklab, ${PAST_STATE_COLOR} 45%, white)`
        : baseColor;
    }
    if (variant === "past") {
      return rewindSelected
        ? baseColor
        : `color-mix(in oklab, ${PAST_STATE_COLOR} 18%, white)`;
    }
    return "transparent";
  })();

  const actualStateColor = getStateColor(state, isTerminal);

  const chipSx: SxProps<Theme> = {
    borderRadius: 999,
    border: "1px solid",
    borderColor: outlineColor,
    display: "inline-flex",
    alignItems: "center",
    gap: 0.75,
    fontWeight: 500,
    lineHeight: 1,
    minHeight: variant === "current" ? 28 : 24,
    px: variant === "current" ? 1.25 : 1,
    py: variant === "current" ? 0.5 : 0.25,
    textTransform: "none",
    whiteSpace: "nowrap",
    width: "fit-content",
    position: "relative",
    color: muted
      ? `color-mix(in oklab, ${PAST_STATE_COLOR} 80%, black)`
      : baseColor,
    backgroundColor,
    borderStyle: variant === "future" ? "dashed" : "solid",
    fontSize: variant === "current" ? "0.85rem" : "0.8125rem",
    opacity: disabled ? 0.6 : 1,
    transition:
      "background-color 120ms ease, border-color 120ms ease, color 120ms ease, transform 180ms ease, box-shadow 180ms ease",

    // Rewind-selected past chip: pulsing glow to show "you are here (in the past)".
    ...(rewindSelected
      ? {
          "@keyframes rewindGlow": {
            "0%, 100%": {
              boxShadow: `0 0 0 1.5px ${baseColor}, 0 0 8px color-mix(in oklab, ${baseColor} 30%, transparent)`,
            },
            "50%": {
              boxShadow: `0 0 0 2px ${baseColor}, 0 0 20px color-mix(in oklab, ${baseColor} 60%, transparent)`,
            },
          },
          animation: "rewindGlow 2s ease-in-out infinite",
        }
      : { boxShadow: "none" }),

    // Muted current chip: small live-dot badge at top-right to mark the real current state.
    ...(variant === "current" && muted
      ? {
          "&::after": {
            content: '""',
            position: "absolute",
            top: -3,
            right: -3,
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: actualStateColor,
            boxShadow: `0 0 5px ${actualStateColor}`,
            "@keyframes liveDot": {
              "0%, 100%": { opacity: 0.45, transform: "scale(0.8)" },
              "50%": { opacity: 1, transform: "scale(1.15)" },
            },
            animation: "liveDot 2.2s ease-in-out infinite",
          },
        }
      : {}),

    ...(interactive
      ? {
          "&:hover": {
            backgroundColor: `color-mix(in oklab, ${baseColor} 16%, transparent)`,
            borderStyle: "solid",
            boxShadow: `0 8px 22px color-mix(in oklab, ${baseColor} 20%, transparent)`,
            ".state-chip-dot": {
              "&::after": {
                animationDuration: "1.2s",
                opacity: 1,
              },
            },
          },
        }
      : {}),
  };

  const content = (
    <>
      <Box
        component="span"
        className="state-chip-dot"
        sx={{
          position: "relative",
          width: 8,
          height: 8,
          borderRadius: "50%",
          border: `1.5px solid ${outlineColor}`,
          backgroundColor: dotFillColor,
          overflow: "hidden",
          flexShrink: 0,
          transition: "background-color 120ms ease, border-color 120ms ease",
          ...(interactive && variant === "future"
            ? {
                backgroundColor: "transparent",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: 1,
                  borderRadius: "50%",
                  backgroundColor: baseColor,
                  transformOrigin: "center",
                  animation: disabled
                    ? "none"
                    : "stateChipDotPulse 2.1s ease-in-out infinite",
                },
                "@keyframes stateChipDotPulse": {
                  "0%, 100%": {
                    transform: "scale(0.28)",
                    opacity: 0.18,
                  },
                  "50%": {
                    transform: "scale(1)",
                    opacity: 0.95,
                  },
                },
              }
            : {}),
        }}
      />
      <Box component="span">{label}</Box>
    </>
  );

  if (interactive) {
    return (
      <ButtonBase
        onClick={onClick}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        onFocus={onHoverStart}
        onBlur={onHoverEnd}
        disabled={disabled}
        title={description}
        data-state={state}
        data-variant={variant}
        data-terminal={isTerminal}
        sx={chipSx}
      >
        {content}
      </ButtonBase>
    );
  }

  return (
    <Box
      component="span"
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      title={description}
      data-state={state}
      data-variant={variant}
      data-terminal={isTerminal}
      sx={chipSx}
    >
      {content}
    </Box>
  );
}
