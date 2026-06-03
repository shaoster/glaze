import { useRef, useState } from "react";
import { alpha, Box, IconButton, TextField, Typography, useTheme } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import type { PieceDetail } from "../util/types";
import { useMutation } from "@tanstack/react-query";
import { updatePiece, extractErrorMessage } from "../util/api";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";

type PieceNameEditorProps = {
  piece: PieceDetail;
  onPieceUpdated: (updated: PieceDetail) => void;
};

/**
 * Inline-edit heading for a piece's name. Shows the name as a large h2 with an
 * edit icon when `canEdit` is true; clicking the icon switches to a TextField
 * with save/cancel controls. Coordinates with PieceDetailSaveStatus so manual
 * saves don't race with the workflow-state autosave.
 */
export default function PieceNameEditor({
  piece,
  onPieceUpdated,
}: PieceNameEditorProps) {
  const canEdit = piece.can_edit;
  const theme = useTheme();
  const pieceDetailSaveStatus = usePieceDetailSaveStatus();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(piece.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const editButtonSx = {
    width: 22,
    height: 22,
    borderRadius: "4px",
    border: "1px solid",
    borderColor: "divider",
    color: "text.secondary",
    backgroundColor: alpha(theme.palette.background.paper, 0.38),
  } as const;

  function startEditingName() {
    setNameValue(piece.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function cancelEditingName() {
    setEditingName(false);
    setNameValue(piece.name);
  }

  const [nameValidationError, setNameValidationError] = useState<string | null>(null);
  const { mutate: commitName, isPending: nameSaving, error: rawNameError } = useMutation({
    mutationFn: (trimmed: string) => {
      const saveNameRequest = () => updatePiece(piece.id, { name: trimmed });
      return pieceDetailSaveStatus
        ? pieceDetailSaveStatus.runManualSave(saveNameRequest)
        : saveNameRequest();
    },
    onSuccess: (updated) => { onPieceUpdated(updated); setEditingName(false); },
  });

  function saveName() {
    setNameValidationError(null);
    const trimmed = nameValue.trim();
    if (!trimmed) { setNameValidationError("Name cannot be empty."); return; }
    if (trimmed === piece.name) { setEditingName(false); return; }
    commitName(trimmed);
  }

  const nameError = nameValidationError
    ?? (rawNameError ? extractErrorMessage(rawNameError, "Failed to save name. Please try again.") : null);

  return (
    <Box sx={{ minWidth: 0, mb: 1.25 }}>
      {editingName ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
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
            sx={{
              minWidth: 220,
              flex: 1,
              maxWidth: 460,
            }}
          />
          <Box sx={{ display: "flex", alignItems: "center" }}>
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
        </Box>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            variant="h3"
            component="h2"
            data-testid="piece-title"
            sx={{
              fontSize: { xs: "2rem", sm: "2.6rem", md: "2rem" },
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              textWrap: "balance",
            }}
          >
            {piece.name}
          </Typography>
          {canEdit && (
            <IconButton
              aria-label="Edit piece name"
              onClick={startEditingName}
              size="small"
              sx={{ ...editButtonSx, alignSelf: "center" }}
            >
              <EditIcon sx={{ fontSize: 14 }} />
            </IconButton>
          )}
        </Box>
      )}
    </Box>
  );
}
