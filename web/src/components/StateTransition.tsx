import { useState } from "react";
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
} from "../util/types";

type StateBranchConnectorProps = {
  count: number;
};

function StateBranchConnector({ count }: StateBranchConnectorProps) {
  const connectorCount = Math.max(count, 1);
  const height = connectorCount === 1 ? 24 : connectorCount * 28 - 4;
  const centerY = height / 2;
  const targetYs =
    connectorCount === 1
      ? [centerY]
      : Array.from({ length: connectorCount }, (_, index) => {
          const start = 10;
          const end = height - 10;
          return start + ((end - start) * index) / (connectorCount - 1);
        });

  return (
    <Box
      component="svg"
      aria-hidden="true"
      sx={(theme) => ({
        width: 24,
        height,
        flexShrink: 0,
        overflow: "visible",
        "--line": theme.palette.divider,
      })}
      viewBox={`0 0 24 ${height}`}
    >
      {targetYs.map((targetY) => (
        <path
          key={targetY}
          d={`M 0 ${centerY} Q 12 ${centerY} 24 ${targetY}`}
          stroke="var(--line)"
          fill="none"
          strokeWidth="1"
        />
      ))}
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
  transitioning?: boolean;
  transitionError?: string | null;
  onTransition: (nextState: string) => void;
};

export default function StateTransition({
  currentStateName,
  disabled = false,
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
        sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1.25 }}
      >
        <StateChip
          state={currentStateName}
          label={formatState(currentStateName)}
          description={getStateDescription(currentStateName)}
          variant="current"
          isTerminal={isTerminalState(currentStateName)}
          muted={hoveredSuccessor !== null}
        />
        {!isTerminal && <StateBranchConnector count={successors.length} />}
        {!isTerminal && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 0.75,
            }}
          >
            {successors.map((next) => (
              <StateChip
                key={next}
                state={next}
                label={formatState(next)}
                description={getStateDescription(next)}
                variant="future"
                isTerminal={isTerminalState(next)}
                onClick={() => openDialog(next)}
                disabled={disabled || transitioning}
                onHoverStart={() => setHoveredSuccessor(next)}
                onHoverEnd={() =>
                  setHoveredSuccessor((value) => (value === next ? null : value))
                }
              />
            ))}
          </Box>
        )}
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
          Save your changes before transitioning to a new state.
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
            disabled={transitioning}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
