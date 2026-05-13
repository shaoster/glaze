import { useState } from "react";
import ArrowOutwardIcon from "@mui/icons-material/ArrowOutward";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography,
} from "@mui/material";
import StateChip from "./StateChip";
import {
  formatState,
  getStateDescription,
  isTerminalState,
  SUCCESSORS,
} from "../util/workflow";

// Fixed height for each successor chip row — must match the sx on the wrapper Box below.
const SUCCESSOR_ROW_HEIGHT = 36;
// Gap between rows — must match gap:1 (8px) on the successor flex column.
const SUCCESSOR_ROW_GAP = 8;

type StateBranchConnectorProps = {
  count: number;
};

function StateBranchConnector({ count }: StateBranchConnectorProps) {
  const connectorCount = Math.max(count, 1);
  const chipHeight = SUCCESSOR_ROW_HEIGHT;
  const chipGap = SUCCESSOR_ROW_GAP;
  const height =
    connectorCount === 1
      ? chipHeight
      : connectorCount * chipHeight + (connectorCount - 1) * chipGap;

  // Y center of each successor chip
  const chipCenters = Array.from(
    { length: connectorCount },
    (_, i) => chipHeight / 2 + i * (chipHeight + chipGap),
  );
  const firstY = chipCenters[0];
  const lastY = chipCenters[connectorCount - 1];
  // Trunk x-position (left side, close to current chip)
  const trunkX = 8;

  return (
    <Box
      component="svg"
      aria-hidden="true"
      preserveAspectRatio="none"
      sx={(theme) => ({
        flex: 1,
        minWidth: 24,
        height,
        alignSelf: "flex-start",
        display: "block",
        overflow: "visible",
        "--line": theme.palette.divider,
      })}
      viewBox={`0 0 40 ${height}`}
    >
      {connectorCount === 1 ? (
        // Single successor: straight horizontal line
        <path
          d={`M 0 ${firstY} H 40`}
          stroke="var(--line)"
          fill="none"
          strokeWidth="1.2"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <>
          {/* Horizontal entry to trunk */}
          <path
            d={`M 0 ${firstY} H ${trunkX}`}
            stroke="var(--line)"
            fill="none"
            strokeWidth="1.2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Vertical trunk */}
          <path
            d={`M ${trunkX} ${firstY} V ${lastY}`}
            stroke="var(--line)"
            fill="none"
            strokeWidth="1.2"
            strokeLinecap="square"
            vectorEffect="non-scaling-stroke"
          />
          {/* Horizontal tick to each successor */}
          {chipCenters.map((cy) => (
            <path
              key={cy}
              d={`M ${trunkX} ${cy} H 40`}
              stroke="var(--line)"
              fill="none"
              strokeWidth="1.2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      )}
    </Box>
  );
}

function sortSuccessorsForDisplay(successors: string[]): string[] {
  const standardSuccessors = successors.filter(
    (state) => state !== "completed" && state !== "recycled",
  );
  const trailingSuccessors = successors.filter(
    (state) => state === "completed" || state === "recycled",
  );
  trailingSuccessors.sort((left, right) => {
    if (left === right) return 0;
    if (left === "completed") return -1;
    if (right === "completed") return 1;
    return 0;
  });
  return [...standardSuccessors, ...trailingSuccessors];
}

type StateTransitionProps = {
  currentStateName: string;
  disabled?: boolean;
  disabledHint?: string;
  transitioning?: boolean;
  transitionError?: string | null;
  onTransition: (nextState: string) => void;
};

export default function StateTransition({
  currentStateName,
  disabled = false,
  disabledHint,
  transitioning = false,
  transitionError,
  onTransition,
}: StateTransitionProps) {
  const successors = sortSuccessorsForDisplay(SUCCESSORS[currentStateName] ?? []);
  const isTerminal = successors.length === 0;
  const [hoveredSuccessor, setHoveredSuccessor] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<string | null>(null);
  const dialogOpen = pendingTransition !== null;

  function openDialog(next: string) {
    setPendingTransition(next);
  }

  function closeDialog() {
    setPendingTransition(null);
  }

  function confirmTransition() {
    if (pendingTransition) {
      onTransition(pendingTransition);
      setPendingTransition(null);
    }
  }

  return (
    <>
      <Box
        aria-label="State flow"
        role="group"
        sx={{ mb: 0.75 }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              // Gap only between current chip and connector; SVG is flush
              // with the successor column so ticks reach the chip border.
              gap: 0,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                minWidth: 0,
                height: SUCCESSOR_ROW_HEIGHT,
                mr: 1.5,
              }}
            >
              <StateChip
                state={currentStateName}
                label={formatState(currentStateName)}
                description={getStateDescription(currentStateName)}
                variant="current"
                isTerminal={isTerminalState(currentStateName)}
                muted={hoveredSuccessor !== null}
              />
            </Box>
            {!isTerminal && <StateBranchConnector count={successors.length} />}
            {!isTerminal && (
              // pl provides the visual gap between the connector's right edge
              // and each chip's left border. Row boxes are full-width so this
              // gap is consistent regardless of individual chip width.
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: `${SUCCESSOR_ROW_GAP}px`,
                  pl: "4px",
                }}
              >
                {successors.map((next) => (
                  <Box
                    key={next}
                    sx={{
                      height: SUCCESSOR_ROW_HEIGHT,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <StateChip
                      state={next}
                      label={formatState(next)}
                      description={getStateDescription(next)}
                      variant="future"
                      isTerminal={isTerminalState(next)}
                      onClick={() => openDialog(next)}
                      disabled={disabled || transitioning}
                      onHoverStart={() => setHoveredSuccessor(next)}
                      onHoverEnd={() =>
                        setHoveredSuccessor((value) =>
                          value === next ? null : value,
                        )
                      }
                    />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {transitionError && (
        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
          {transitionError}
        </Typography>
      )}
      {disabled && !isTerminal && (
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", mb: 1, display: "block" }}
        >
          {disabledHint ?? "Save your changes before transitioning to a new state."}
        </Typography>
      )}

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        TransitionProps={{ onExited: () => setPendingTransition(null) }}
      >
        <DialogTitle>Confirm State Transition</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Transition <strong>{formatState(currentStateName)}</strong> →{" "}
            <strong>
              {pendingTransition ? formatState(pendingTransition) : ""}
            </strong>
            ?
            <br />
            <br />
            Once transitioned, the current state will be sealed and can no
            longer be edited.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            onClick={confirmTransition}
            variant="contained"
            color={pendingTransition === "recycled" ? "error" : "primary"}
            endIcon={
              pendingTransition === "recycled" ? undefined : (
                <ArrowOutwardIcon fontSize="small" />
              )
            }
            disabled={transitioning}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
