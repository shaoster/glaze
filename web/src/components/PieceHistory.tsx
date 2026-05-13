import { useEffect, useReducer, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import AddIcon from "@mui/icons-material/Add";
import {
  alpha,
  Box,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
  Typography,
} from "@mui/material";
import type {
  PieceDetail as PieceDetailType,
  PieceState,
  State,
} from "../util/types";
import {
  formatPastState,
  formatState,
  insertableStatesBetween,
} from "../util/workflow";
import { addPieceState, deletePieceState, updatePastState } from "../util/api";
import WorkflowState from "./WorkflowState";

type PieceHistoryProps = {
  pastHistory: PieceState[];
  piece?: PieceDetailType;
  onPieceUpdated?: (updated: PieceDetailType) => void;
  rewindedStateId?: string | null;
  onRewind?: (id: string | null) => void;
};

function InsertButton({
  predecessor,
  presentStates,
  piece,
  onPieceUpdated,
}: {
  predecessor: State;
  presentStates: ReadonlySet<State>;
  piece: PieceDetailType;
  onPieceUpdated: (updated: PieceDetailType) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState(false);

  const insertable = insertableStatesBetween(predecessor, presentStates);
  if (insertable.length === 0) return null;

  async function handleSelect(state: State) {
    setAnchorEl(null);
    setLoading(true);
    try {
      const updated = await addPieceState(piece.id, { state });
      onPieceUpdated(updated);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ display: "flex", justifyContent: "center", my: 0.25 }}>
      {loading ? (
        <CircularProgress size={16} />
      ) : (
        <>
          <IconButton
            size="small"
            aria-label="Insert state"
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}
          >
            <AddIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={() => setAnchorEl(null)}
          >
            {insertable.map((s) => (
              <MenuItem key={s} onClick={() => handleSelect(s as State)}>
                {formatState(s)}
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    </Box>
  );
}

type HistoryUIState = {
  historyOpen: boolean;
  deletingStateId: string | null;
  prevIsEditable: boolean;
};

type HistoryAction =
  | { type: "toggle_history" }
  | { type: "start_deleting"; id: string }
  | { type: "done_deleting" }
  | { type: "is_editable_changed"; isEditable: boolean };

function historyReducer(
  state: HistoryUIState,
  action: HistoryAction,
): HistoryUIState {
  switch (action.type) {
    case "toggle_history":
      return { ...state, historyOpen: !state.historyOpen };
    case "start_deleting":
      return { ...state, deletingStateId: action.id };
    case "done_deleting":
      return { ...state, deletingStateId: null };
    case "is_editable_changed":
      return {
        ...state,
        prevIsEditable: action.isEditable,
        historyOpen: action.isEditable ? true : state.historyOpen,
      };
  }
}

export default function PieceHistory({
  pastHistory,
  piece,
  onPieceUpdated,
  rewindedStateId,
  onRewind,
}: PieceHistoryProps) {
  const isEditable = piece?.is_editable ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const [{ historyOpen, deletingStateId, prevIsEditable }, dispatch] =
    useReducer(historyReducer, {
      historyOpen: false,
      deletingStateId: null,
      prevIsEditable: isEditable,
    });

  // Sync when isEditable changes. Dispatching during render is the React-recommended
  // "adjust state based on props" pattern — no effect needed, no lint violation.
  if (prevIsEditable !== isEditable) {
    dispatch({ type: "is_editable_changed", isEditable });
  }

  // Scroll into view after the panel expands. useEffect (post-paint) is correct
  // for a smooth scroll animation — no need to block paint with useLayoutEffect.
  useEffect(() => {
    if (isEditable) {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isEditable]);

  if (pastHistory.length === 0 && !isEditable) return null;

  const presentStates = new Set<State>(
    piece?.history.map((ps) => ps.state) ?? [],
  );

  const rewindIndex = rewindedStateId
    ? pastHistory.findIndex((ps) => ps.id === rewindedStateId)
    : -1;

  const canModifyHistory = isEditable && !!piece && !!onPieceUpdated;
  const showTrailingInsert = canModifyHistory && pastHistory.length > 0;

  return (
    <Box ref={containerRef}>
      <Box
        component="button"
        type="button"
        onClick={() => dispatch({ type: "toggle_history" })}
        aria-expanded={historyOpen}
        sx={(theme) => ({
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          mb: 1.5,
          px: 0,
          py: 0.5,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: theme.palette.text.secondary,
          textAlign: "left",
        })}
      >
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            transition: "transform 0.2s",
            transform: historyOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
        <Typography variant="body2" sx={{ color: "inherit" }}>
          {historyOpen ? "Hide" : "Show"} history ({pastHistory.length} past
          state{pastHistory.length !== 1 ? "s" : ""})
        </Typography>
      </Box>
      <Collapse in={historyOpen}>
        <List dense sx={{ display: "grid", gap: 0 }}>
          {pastHistory.map((ps, i) => {
            const isRewinded = ps.id === rewindedStateId;
            const isAfterRewind = rewindIndex !== -1 && i > rewindIndex;

            // Predecessor for insert-before affordance
            const predecessor: State | null =
              i === 0 ? null : pastHistory[i - 1]?.state ?? null;

            // Only show insert affordance in edit mode, with a valid predecessor,
            // and NOT before the last item (no affordance after pastHistory.at(-1))
            const showInsert = canModifyHistory && predecessor !== null;

            return (
              <Box key={ps.id ?? i}>
                {showInsert && predecessor && (
                  <InsertButton
                    predecessor={predecessor}
                    presentStates={presentStates}
                    piece={piece!}
                    onPieceUpdated={onPieceUpdated!}
                  />
                )}
                <Tooltip
                  title={
                    isRewinded
                      ? "Click to stop viewing this state"
                      : canModifyHistory
                        ? "Click to view and edit this state"
                        : "Click to view this state"
                  }
                  placement="top-start"
                  disableHoverListener={!onRewind}
                >
                  <ListItem
                    disableGutters
                    onClick={
                      onRewind
                        ? () => onRewind(isRewinded ? null : ps.id)
                        : undefined
                    }
                    sx={(theme) => ({
                      px: 1.5,
                      py: 1.5,
                      mb: 1,
                      borderRadius: 3,
                      border: "1px solid",
                      borderColor: isRewinded ? "primary.main" : "divider",
                      backgroundColor: alpha(
                        theme.palette.background.default,
                        0.34,
                      ),
                      flexDirection: "column",
                      alignItems: "flex-start",
                      cursor: onRewind ? "pointer" : "default",
                      opacity: isAfterRewind ? 0.35 : 1,
                      transition: "opacity 0.2s, border-color 0.2s",
                      "&:hover": {
                        borderColor: onRewind ? "primary.main" : "divider",
                      },
                    })}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: canModifyHistory ? 0.75 : 0,
                        width: "100%",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: isRewinded ? "primary.main" : "text.secondary",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                          flexGrow: 1,
                        }}
                      >
                        {formatPastState(ps.state)}
                      </Typography>
                      {isRewinded && (
                        <Chip
                          icon={<HistoryIcon sx={{ fontSize: "0.8rem !important" }} />}
                          label="Viewing"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.65rem" }}
                        />
                      )}
                      {canModifyHistory && ps.state !== "designed" && (
                        <Box onClick={(e) => e.stopPropagation()}>
                          {deletingStateId === ps.id ? (
                            <CircularProgress size={16} />
                          ) : (
                            <IconButton
                              size="small"
                              aria-label={`Delete ${formatPastState(ps.state)} state`}
                              onClick={async () => {
                                dispatch({ type: "start_deleting", id: ps.id });
                                try {
                                  const updated = await deletePieceState(
                                    piece!.id,
                                    ps.id,
                                  );
                                  onPieceUpdated!(updated);
                                } finally {
                                  dispatch({ type: "done_deleting" });
                                }
                              }}
                              sx={{ opacity: 0.5, "&:hover": { opacity: 1 } }}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Box>
                      )}
                    </Box>

                    {canModifyHistory ? (
                      <Box
                        sx={{ width: "100%" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <WorkflowState
                          key={ps.id}
                          initialPieceState={ps}
                          pieceId={piece!.id}
                          onSaved={onPieceUpdated!}
                          saveStateFn={(payload) =>
                            updatePastState(piece!.id, ps.id, payload)
                          }
                        />
                      </Box>
                    ) : (
                      <ListItemText
                        secondary={`${ps.created.toLocaleString()}${ps.notes ? " — " + ps.notes : ""}`}
                        secondaryTypographyProps={{
                          variant: "caption",
                          sx: { color: "text.secondary" },
                        }}
                        sx={{ m: 0 }}
                      />
                    )}
                  </ListItem>
                </Tooltip>
              </Box>
            );
          })}
          {showTrailingInsert && piece && onPieceUpdated && (
            <InsertButton
              predecessor={pastHistory[pastHistory.length - 1].state}
              presentStates={presentStates}
              piece={piece}
              onPieceUpdated={onPieceUpdated}
            />
          )}
        </List>
      </Collapse>
    </Box>
  );
}
