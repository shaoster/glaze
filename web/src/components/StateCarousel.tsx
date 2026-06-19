import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import { useRef, useState, useEffect, useLayoutEffect } from "react";
import type { PieceDetail as PieceDetailType, PieceState } from "../util/types";
import {
  formatState,
  getStateDescription,
  isTerminalState,
  SUCCESSORS,
} from "../util/workflow";
import StateChip from "./StateChip";
import PieceHistory from "./PieceHistory";

// Nav pill token values (design spec).
const TEXT_MUTE = "oklch(0.56 0.010 70)";
const LINE_SOFT = "oklch(0.28 0.010 55)";

// Row geometry — kept in sync with StateChip's sizing.
const ROW_H = 36;
const ROW_GAP = 8;

function sortSuccessorsForDisplay(successors: string[]): string[] {
  const standard = successors.filter((s) => s !== "completed" && s !== "recycled");
  const trailing = successors
    .filter((s) => s === "completed" || s === "recycled")
    .sort((a, b) => (a === b ? 0 : a === "completed" ? -1 : 1));
  return [...standard, ...trailing];
}

// Bezier-fan branch connector from the design spec.
function BranchConnector({ count }: { count: number }) {
  const n   = Math.max(count, 1);
  const h   = n === 1 ? ROW_H : n * ROW_H + (n - 1) * ROW_GAP;
  const cy  = h / 2;
  const w   = 28;
  const ys  = Array.from({ length: n }, (_, i) => ROW_H / 2 + i * (ROW_H + ROW_GAP));

  return (
    <Box
      component="svg"
      aria-hidden="true"
      sx={(theme) => ({
        flexShrink: 0,
        width: w,
        height: h,
        alignSelf: "flex-start",
        display: "block",
        overflow: "visible",
        "--line": theme.palette.divider,
      })}
      viewBox={`0 0 ${w} ${h}`}
    >
      {ys.map((y, i) => (
        <path
          key={i}
          d={`M 0 ${cy} C ${w * 0.55} ${cy}, ${w * 0.45} ${y}, ${w} ${y}`}
          stroke="var(--line)"
          fill="none"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      ))}
      <circle cx={0} cy={cy} r={2.5} fill="var(--line)" />
    </Box>
  );
}

function formatDateLabel(d: Date | null | undefined): string {
  if (!d) return "";
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Compact predecessor navigation pill (left zone of current card).
function PrevPill({ onClick }: { label: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        px: "7px",
        py: "5px",
        borderRadius: 999,
        background: "oklch(0 0 0 / 0.22)",
        border: `1px solid ${LINE_SOFT}`,
        color: TEXT_MUTE,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
        "&:hover": { borderColor: TEXT_MUTE },
      }}
    >
      <Box component="span" sx={{ fontSize: 14, lineHeight: 1 }}>‹</Box>
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: TEXT_MUTE, flexShrink: 0 }} />
    </Box>
  );
}

// Full predecessor pill (left zone of past cards).
function PrevFullPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        px: "9px",
        py: "5px",
        borderRadius: 999,
        background: "oklch(0 0 0 / 0.22)",
        border: `1px solid ${LINE_SOFT}`,
        color: TEXT_MUTE,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        cursor: "pointer",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        flexShrink: 0,
        "&:hover": { borderColor: TEXT_MUTE },
      }}
    >
      <Box component="span" sx={{ fontSize: 14, lineHeight: 1 }}>‹</Box>
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: TEXT_MUTE, flexShrink: 0 }} />
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>{label}</Box>
    </Box>
  );
}

// Next-state navigation pill (right zone of past cards).
function NextPill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        px: "9px",
        py: "5px",
        borderRadius: 999,
        background: "oklch(0 0 0 / 0.22)",
        border: `1px solid ${LINE_SOFT}`,
        color: TEXT_MUTE,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        cursor: "pointer",
        whiteSpace: "nowrap",
        maxWidth: "100%",
        overflow: "hidden",
        flexShrink: 0,
        "&:hover": { borderColor: TEXT_MUTE },
      }}
    >
      <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>{label}</Box>
      <Box component="span" sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: TEXT_MUTE, flexShrink: 0 }} />
      <Box component="span" sx={{ fontSize: 14, lineHeight: 1 }}>›</Box>
    </Box>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
type PieceTimelineProps = {
  statesHistory: PieceState[];
  piece: PieceDetailType;
  onPieceUpdated: (updated: PieceDetailType) => void;
  rewindedStateId?: string | null;
  onRewind?: (id: string | null) => void;
  historyLoading?: boolean;
  historyError?: unknown;
  refetchHistory?: () => void;
  onTransition?: (nextState: string) => void;
  transitioning?: boolean;
  transitionError?: string | null;
  hasSaveError?: boolean;
};

export default function StateCarousel({
  statesHistory,
  piece,
  onPieceUpdated,
  rewindedStateId,
  onRewind,
  historyLoading = false,
  historyError = null,
  refetchHistory,
  onTransition,
  transitioning = false,
  transitionError,
  hasSaveError = false,
}: PieceTimelineProps) {
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<string | null>(null);

  const railRef     = useRef<HTMLDivElement>(null);
  const cardRefs    = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef     = useRef({ startX: 0, startScroll: 0, active: false, moved: false });
  const mountedRef  = useRef(false);
  const currentIdx  = statesHistory.length - 1;

  const initialIdx = rewindedStateId
    ? Math.max(0, statesHistory.findIndex((ps) => ps.id === rewindedStateId))
    : currentIdx;

  const [activeIdx, setActiveIdx] = useState(initialIdx);
  const [dragging, setDragging]   = useState(false);

  // Instant scroll to the correct card before first paint.
  useLayoutEffect(() => {
    const rail   = railRef.current;
    const target = cardRefs.current[initialIdx];
    if (rail && target) {
      rail.scrollLeft = target.offsetLeft;
    }
    mountedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated scroll whenever rewind state or current card changes after mount
  // (covers: entering/exiting rewind, post-transition new current card).
  useEffect(() => {
    if (!mountedRef.current) return;
    const targetIdx = rewindedStateId
      ? Math.max(0, statesHistory.findIndex((ps) => ps.id === rewindedStateId))
      : currentIdx;
    const rail   = railRef.current;
    const target = cardRefs.current[targetIdx];
    if (rail && target) {
      rail.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    }
    setActiveIdx(targetIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rewindedStateId, currentIdx]);

  // Current state is always available from piece.current_state even while history loads.
  const fallbackHistory: PieceState[] = statesHistory.length > 0
    ? statesHistory
    : [piece.current_state];

  const effectiveHistory = fallbackHistory;

  const canEdit          = piece.can_edit;
  const currentState     = effectiveHistory[effectiveHistory.length - 1];
  const successors       = sortSuccessorsForDisplay(SUCCESSORS[currentState.state] ?? []);
  const isTerminal       = successors.length === 0;
  const transitionDisabled = !canEdit || hasSaveError || piece.is_editable || transitioning;
  const rewindedState    = rewindedStateId
    ? effectiveHistory.find((ps) => ps.id === rewindedStateId) ?? null
    : null;

  // ── Carousel helpers ───────────────────────────────────────────────────────
  const onScroll = () => {
    const rail = railRef.current;
    if (!rail) return;
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let best = 0, bestDist = Infinity;
    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      const dist = Math.abs(el.offsetLeft + el.clientWidth / 2 - center);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    setActiveIdx(best);
  };

  const goTo = (idx: number) => {
    const rail   = railRef.current;
    const target = cardRefs.current[idx];
    if (rail && target) {
      rail.scrollTo({
        left: target.offsetLeft - (rail.clientWidth - target.clientWidth) / 2,
        behavior: "smooth",
      });
    }
  };

  const DRAG_THRESHOLD = 5;

  const onMouseDown = (e: React.MouseEvent) => {
    const rail = railRef.current;
    if (!rail) return;
    dragRef.current = { startX: e.clientX, startScroll: rail.scrollLeft, active: true, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const delta = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD) return;
    if (!drag.moved) { drag.moved = true; setDragging(true); }
    const rail = railRef.current;
    if (rail) rail.scrollLeft = drag.startScroll - delta;
  };
  const stopDrag = () => {
    dragRef.current.active = false;
    setDragging(false);
    // moved flag is cleared after a tick so the click event that follows
    // mouseup sees it as still true and gets suppressed.
    setTimeout(() => { dragRef.current.moved = false; }, 0);
  };

  // ── Transition helpers ─────────────────────────────────────────────────────
  const openDialog  = (next: string) => { if (!transitionDisabled) setPendingTransition(next); };
  const closeDialog = () => setPendingTransition(null);
  const confirmTransition = () => {
    if (pendingTransition && onTransition) { onTransition(pendingTransition); }
    setPendingTransition(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Box
        ref={railRef}
        onScroll={onScroll}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onClickCapture={(e) => { if (dragRef.current.moved) { e.stopPropagation(); e.preventDefault(); } }}
        sx={{
          display: "flex",
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          "&::-webkit-scrollbar": { display: "none" },
          cursor: dragging ? "grabbing" : "grab",
          userSelect: dragging ? "none" : "auto",
        }}
      >
        {effectiveHistory.map((ps, i) => {
          const effCurrentIdx = effectiveHistory.length - 1;
          const isCurrent  = i === effCurrentIdx;
          const isActive   = i === activeIdx;
          const isRewinded = ps.id === rewindedStateId;
          const prev       = i > 0 ? effectiveHistory[i - 1] : null;
          const next       = i < effCurrentIdx ? effectiveHistory[i + 1] : null;

          return (
            <Box
              key={ps.id ?? i}
              ref={(el) => { cardRefs.current[i] = el as HTMLDivElement | null; }}
              sx={{
                flex: "0 0 100%",
                scrollSnapAlign: "center",
                scrollSnapStop: "always",
                display: "grid",
                gridTemplateColumns: (isCurrent && !isTerminal) ? "auto auto minmax(0, 1fr)" : "minmax(0, 1fr) auto minmax(0, 1fr)",
                alignItems: "center",
                gap: "8px",
                px: 0,
                py: 1,
                opacity: isActive ? 1 : 0.45,
                transition: "opacity 0.25s ease",
              }}
            >
              {/* Left: predecessor */}
              <Box sx={{ display: "flex", justifyContent: "flex-start", alignItems: "center", minWidth: 0 }}>
                {prev ? (
                  isCurrent
                    ? <PrevPill label={formatState(prev.state)} onClick={() => goTo(i - 1)} />
                    : <PrevFullPill label={formatState(prev.state)} onClick={() => goTo(i - 1)} />
                ) : (
                  <Typography variant="caption" sx={{ color: TEXT_MUTE, opacity: 0.5, fontSize: 10 }}>
                    start
                  </Typography>
                )}
              </Box>

              {/* Center: state chip + date */}
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, py: 0.5 }}>
                <StateChip
                  state={ps.state}
                  label={formatState(ps.state)}
                  description={
                    isCurrent
                      ? "Click to return to current state"
                      : isRewinded
                        ? "Click to stop viewing this state"
                        : "Click to view this state"
                  }
                  variant={isCurrent ? "current" : "past"}
                  isTerminal={isTerminalState(ps.state)}
                  muted={isCurrent && !!rewindedStateId}
                  rewindSelected={!isCurrent && isRewinded}
                  onClick={
                    isCurrent && onRewind
                      ? () => onRewind(null)
                      : !isCurrent && onRewind
                        ? () => onRewind(isRewinded ? null : ps.id)
                        : undefined
                  }
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: 10,
                    color: isCurrent ? "primary.main" : TEXT_MUTE,
                    fontWeight: isCurrent ? 600 : 400,
                    letterSpacing: isCurrent ? "0.04em" : 0,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDateLabel(ps.created)}
                </Typography>
              </Box>

              {/* Right: next navigation (past) or successor branch (current) */}
              {isCurrent ? (
                <Box sx={{ display: "flex", alignItems: "flex-start", minWidth: 0, overflow: "hidden" }}>
                  {!isTerminal && canEdit ? (
                    <>
                      <BranchConnector count={successors.length} />
                      <Box sx={{ display: "flex", flexDirection: "column", gap: `${ROW_GAP}px`, pl: "4px", minWidth: 0, overflow: "hidden", flex: 1 }}>
                        {successors.map((next) => (
                          <Box key={next} sx={{ height: ROW_H, display: "flex", alignItems: "center", minWidth: 0, overflow: "hidden" }}>
                            <StateChip
                              state={next}
                              label={formatState(next)}
                              description={getStateDescription(next)}
                              variant="future"
                              isTerminal={isTerminalState(next)}
                              onClick={() => openDialog(next)}
                              disabled={transitionDisabled}
                            />
                          </Box>
                        ))}
                      </Box>
                    </>
                  ) : (
                    <Typography variant="caption" sx={{ color: TEXT_MUTE, opacity: 0.5, fontSize: 10, alignSelf: "center" }}>
                      end
                    </Typography>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", minWidth: 0 }}>
                  {next ? (
                    <NextPill label={formatState(next.state)} onClick={() => goTo(i + 1)} />
                  ) : (
                    <Typography variant="caption" sx={{ color: TEXT_MUTE, opacity: 0.5, fontSize: 10 }}>
                      end
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* History error banner — shown below the carousel so transitions still work */}
      {historyError && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, pt: 0.5 }}>
          <Typography variant="caption" color="error">Failed to load history.</Typography>
          <Button size="small" variant="outlined" color="error" onClick={refetchHistory} sx={{ py: 0, minWidth: 0 }}>
            Retry
          </Button>
        </Box>
      )}

      {/* History loading indicator */}
      {historyLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 0.5 }}>
          <CircularProgress size={16} />
        </Box>
      )}

      {/* Pager dots */}
      <Box sx={{ display: "flex", justifyContent: "center", gap: 0.75, pt: 1, pb: 0.25 }}>
        {effectiveHistory.map((ps, i) => (
          <Box
            key={ps.id ?? i}
            component="button"
            onClick={() => goTo(i)}
            aria-label={`Jump to ${formatState(ps.state)}`}
            sx={{
              width: i === activeIdx ? 18 : 6,
              height: 6,
              borderRadius: 999,
              bgcolor: i === activeIdx
                ? i === effectiveHistory.length - 1 ? "primary.main" : "text.secondary"
                : i === effectiveHistory.length - 1 ? "primary.main" : "divider",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "all 0.25s ease",
            }}
          />
        ))}
      </Box>

      {/* Rewind indicator — integrated so user doesn't have to scroll */}
      {rewindedState && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1, pt: 0.5, pb: 0.25 }}>
          <Chip
            icon={<HistoryIcon sx={{ fontSize: "14px !important" }} />}
            label={`Viewing: ${formatState(rewindedState.state)}`}
            size="small"
            color="primary"
            variant="outlined"
            onDelete={() => onRewind?.(null)}
            sx={{ fontSize: "0.75rem" }}
          />
          {piece.is_editable && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
              editing historical state
            </Typography>
          )}
        </Box>
      )}

      {transitionError && (
        <Typography color="error" variant="body2" sx={{ mt: 0.5, textAlign: "center" }}>
          {transitionError}
        </Typography>
      )}
      {transitionDisabled && !isTerminal && canEdit && (hasSaveError || piece.is_editable) && (
        <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block", textAlign: "center" }}>
          {piece.is_editable
            ? "Seal edit mode before transitioning to a new state."
            : "Auto-save failed. Your changes may not be saved."}
        </Typography>
      )}

      {/* Edit history button */}
      {piece.is_editable && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => setEditModalOpen(true)}
            aria-label="Edit history"
            sx={{ opacity: 0.6, "&:hover": { opacity: 1 } }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Edit history modal */}
      {piece.is_editable && (
        <Dialog open={editModalOpen} onClose={() => setEditModalOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ pb: 1 }}>Edit History</DialogTitle>
          <DialogContent>
            <PieceHistory
              pastHistory={effectiveHistory.slice(0, -1)}
              piece={piece}
              history={effectiveHistory}
              onPieceUpdated={onPieceUpdated}
              rewindedStateId={rewindedStateId}
              onRewind={(id) => {
                onRewind?.(id);
                setEditModalOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Transition confirmation dialog */}
      <Dialog
        open={pendingTransition !== null}
        onClose={closeDialog}
        TransitionProps={{ onExited: () => setPendingTransition(null) }}
      >
        <DialogTitle>Confirm State Transition</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Transition <strong>{formatState(currentState.state)}</strong> →{" "}
            <strong>{pendingTransition ? formatState(pendingTransition) : ""}</strong>?
            <br /><br />
            Once transitioned, the current state will be sealed and can no longer be edited.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={confirmTransition}
            variant="contained"
            color={pendingTransition === "recycled" ? "error" : "primary"}
            endIcon={pendingTransition !== "recycled" ? <ArrowOutwardIcon fontSize="small" /> : undefined}
            disabled={transitioning}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
