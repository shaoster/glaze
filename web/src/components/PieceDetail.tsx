import { useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { useBlocker } from "react-router-dom";
import type { PieceDetail as PieceDetailType } from "../util/types";
import { formatState, isTerminalState } from "../util/types";
import { addPieceState, updatePiece } from "../util/api";
import CloudinaryImage from "./CloudinaryImage";
import WorkflowState from "./WorkflowState";
import TagManager from "./TagManager";
import StateTransition from "./StateTransition";
import PieceHistory from "./PieceHistory";

type PieceDetailProps = {
  piece: PieceDetailType;
  onPieceUpdated: (updated: PieceDetailType) => void;
};

export default function PieceDetail({
  piece,
  onPieceUpdated,
}: PieceDetailProps) {
  const [isDirty, setIsDirty] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(piece.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const currentState = piece.current_state;
  const isTerminal = isTerminalState(currentState.state);
  const pastHistory = piece.history.slice(0, -1);

  const blocker = useBlocker(isDirty);

  async function handleTransition(nextState: string) {
    setTransitioning(true);
    setTransitionError(null);
    try {
      const updated = await addPieceState(piece.id, {
        state: nextState as PieceDetailType["current_state"]["state"],
      });
      onPieceUpdated(updated);
      setIsDirty(false);
    } catch {
      setTransitionError("Failed to transition state. Please try again.");
    } finally {
      setTransitioning(false);
    }
  }

  function startEditingName() {
    setNameValue(piece.name);
    setNameError(null);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function cancelEditingName() {
    setEditingName(false);
    setNameError(null);
    setNameValue(piece.name);
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty.");
      return;
    }
    if (trimmed === piece.name) {
      setEditingName(false);
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      const updated = await updatePiece(piece.id, { name: trimmed });
      onPieceUpdated(updated);
      setEditingName(false);
    } catch {
      setNameError("Failed to save name. Please try again.");
    } finally {
      setNameSaving(false);
    }
  }

  return (
    <Box sx={{ textAlign: "left" }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 0 }}>
        {piece.thumbnail && (
          <CloudinaryImage
            url={piece.thumbnail.url}
            cloudinary_public_id={piece.thumbnail.cloudinary_public_id}
            alt={piece.name}
            context="thumbnail"
            style={{ objectFit: "cover", borderRadius: 4 }}
          />
        )}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            width: "100%",
            alignItems: "center",
          }}
        >
          <Box sx={{ minWidth: 0, flexBasis: "100%" }}>
            {editingName ? (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <TextField
                  inputRef={nameInputRef}
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") cancelEditingName();
                  }}
                  size="small"
                  error={!!nameError}
                  helperText={nameError}
                  disabled={nameSaving}
                  slotProps={{
                    htmlInput: { "aria-label": "Piece name", maxLength: 255 },
                  }}
                  sx={{ minWidth: 200 }}
                />
                <IconButton
                  aria-label="Save name"
                  onClick={saveName}
                  disabled={nameSaving}
                  size="small"
                  color="primary"
                >
                  <CheckIcon fontSize="small" />
                </IconButton>
                <IconButton
                  aria-label="Cancel name edit"
                  onClick={cancelEditingName}
                  disabled={nameSaving}
                  size="small"
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Typography variant="h5" component="h2">
                  {piece.name}
                </Typography>
                <IconButton
                  aria-label="Edit piece name"
                  onClick={startEditingName}
                  size="small"
                  sx={{ color: "text.secondary" }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>
          <TagManager
            pieceId={piece.id}
            initialTags={piece.tags ?? []}
            onSaved={onPieceUpdated}
          />
        </Box>
      </Box>

      <StateTransition
        currentStateName={currentState.state}
        disabled={isDirty}
        transitioning={transitioning}
        transitionError={transitionError}
        onTransition={handleTransition}
      />

      {/* Current state form */}
      <WorkflowState
        key={currentState.state + currentState.created.toISOString()}
        pieceState={currentState}
        pieceId={piece.id}
        onSaved={onPieceUpdated}
        onDirtyChange={setIsDirty}
        currentLocation={piece.current_location ?? ""}
        currentThumbnail={piece.thumbnail}
        onSetAsThumbnail={async (image) => {
          const updated = await updatePiece(piece.id, {
            thumbnail: {
              url: image.url,
              cloudinary_public_id: image.cloudinary_public_id ?? null,
            },
          });
          onPieceUpdated(updated);
        }}
      />

      <Divider sx={{ my: 3 }} />

      {isTerminal && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This piece is in a terminal state (
          <strong>{formatState(currentState.state)}</strong>). No further
          transitions are possible.
        </Alert>
      )}

      <PieceHistory
        pastHistory={pastHistory}
        currentThumbnailUrl={piece.thumbnail?.url}
        onSetAsThumbnail={async (image) => {
          const updated = await updatePiece(piece.id, {
            thumbnail: {
              url: image.url,
              cloudinary_public_id: image.cloudinary_public_id ?? null,
            },
          });
          onPieceUpdated(updated);
        }}
      />

      {/* Navigation blocker dialog */}
      <Dialog open={blocker.state === "blocked"}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Are you sure you want to leave?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Stay</Button>
          <Button onClick={() => blocker.proceed?.()} color="error">
            Leave without saving
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
