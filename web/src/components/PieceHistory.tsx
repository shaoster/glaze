import { useEffect, useRef, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import {
  alpha,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type {
  PieceDetail as PieceDetailType,
  PieceState,
  State,
} from "../util/types";
import { formatPastState, formatState, STATES } from "../util/types";
import { addPieceState, updatePastState } from "../util/api";
import WorkflowState from "./WorkflowState";

type PieceHistoryProps = {
  pastHistory: PieceState[];
  piece?: PieceDetailType;
  onPieceUpdated?: (updated: PieceDetailType) => void;
  rewindedStateId?: string | null;
  onRewind?: (id: string | null) => void;
};

function AddMissingStateDialog({
  open,
  onClose,
  piece,
  onPieceUpdated,
}: {
  open: boolean;
  onClose: () => void;
  piece: PieceDetailType;
  onPieceUpdated: (updated: PieceDetailType) => void;
}) {
  const presentStates = new Set<State>(piece.history.map((ps) => ps.state));
  const availableStates = (STATES as State[]).filter(
    (s) => !presentStates.has(s),
  );

  const [selectedState, setSelectedState] = useState<State | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setSelectedState("");
    setNotes("");
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    if (!selectedState) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await addPieceState(piece.id, {
        state: selectedState as PieceState["state"],
        notes: notes.trim() || undefined,
      });
      onPieceUpdated(updated);
      handleClose();
    } catch {
      setError("Failed to add state. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Add missing state</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>
          <TextField
            select
            label="State"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value as State)}
            fullWidth
            size="small"
          >
            {availableStates.map((s) => (
              <MenuItem key={s} value={s}>
                {formatState(s)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Notes"
            multiline
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          {error && (
            <Typography variant="caption" color="error">
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!selectedState || saving}
        >
          Add state
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PieceHistory({
  pastHistory,
  piece,
  onPieceUpdated,
  rewindedStateId,
  onRewind,
}: PieceHistoryProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const isEditable = piece?.is_editable ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const prevIsEditableRef = useRef(isEditable);

  useEffect(() => {
    if (isEditable && !prevIsEditableRef.current) {
      setHistoryOpen(true);
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    prevIsEditableRef.current = isEditable;
  }, [isEditable]);

  if (pastHistory.length === 0 && !isEditable) return null;

  const rewindIndex = rewindedStateId
    ? pastHistory.findIndex((ps) => ps.id === rewindedStateId)
    : -1;

  return (
    <Box ref={containerRef}>
      <Box
        component="button"
        type="button"
        onClick={() => setHistoryOpen((o) => !o)}
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
        <List dense sx={{ display: "grid", gap: 1.25 }}>
          {pastHistory.map((ps, i) => {
            const isRewinded = ps.id === rewindedStateId;
            const isAfterRewind = rewindIndex !== -1 && i > rewindIndex;
            if (isEditable && piece && onPieceUpdated) {
              return (
                <Tooltip
                  key={ps.id ?? i}
                  title={
                    isRewinded
                      ? "Click to stop viewing this state"
                      : "Click to view and edit this state"
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
                      pointerEvents: isAfterRewind ? "none" : "auto",
                      transition: "opacity 0.2s, border-color 0.2s",
                    })}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 0.75,
                        width: "100%",
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: isRewinded ? "primary.main" : "text.secondary",
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        {formatPastState(ps.state)}
                      </Typography>
                      {isRewinded && (
                        <Chip
                          icon={<HistoryIcon />}
                          label="Viewing"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 18, fontSize: "0.65rem" }}
                        />
                      )}
                    </Box>
                    <Box
                      sx={{ width: "100%" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <WorkflowState
                        key={ps.id}
                        initialPieceState={ps}
                        pieceId={piece.id}
                        onSaved={onPieceUpdated}
                        hideImageUpload
                        saveStateFn={(payload) =>
                          updatePastState(piece.id, ps.id, payload)
                        }
                      />
                    </Box>
                  </ListItem>
                </Tooltip>
              );
            }
            return (
              <ListItem
                key={ps.id ?? i}
                disableGutters
                sx={(theme) => ({
                  px: 1.5,
                  py: 1.5,
                  borderRadius: 3,
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: alpha(
                    theme.palette.background.default,
                    0.34,
                  ),
                  flexDirection: "column",
                  alignItems: "flex-start",
                })}
              >
                <ListItemText
                  primary={formatPastState(ps.state)}
                  secondary={`${ps.created.toLocaleString()}${ps.notes ? " — " + ps.notes : ""}`}
                  slotProps={{
                    primary: { sx: { color: "text.primary" } },
                    secondary: { sx: { color: "text.secondary" } },
                  }}
                />
              </ListItem>
            );
          })}
        </List>
        {isEditable && piece && onPieceUpdated && (
          <Box sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddDialogOpen(true)}
              sx={{ borderStyle: "dashed" }}
            >
              Add missing state
            </Button>
            <AddMissingStateDialog
              open={addDialogOpen}
              onClose={() => setAddDialogOpen(false)}
              piece={piece}
              onPieceUpdated={onPieceUpdated}
            />
          </Box>
        )}
      </Collapse>
    </Box>
  );
}
