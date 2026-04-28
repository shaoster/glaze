import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from "@mui/material";
import { createPiece } from "../util/api";
import type { PieceDetail } from "../util/types";
import { entryNameOrEmpty, undefinedIfBlank } from "../util/optionalValues";
import GlobalEntryField from "./GlobalEntryField";
import { DEFAULT_THUMBNAIL, CURATED_THUMBNAILS } from "./thumbnailConstants";

const MAX_NOTES_LENGTH = 300;

export interface NewPieceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (piece: PieceDetail) => void;
}

export default function NewPieceDialog({
  open,
  onClose,
  onCreated,
}: NewPieceDialogProps) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedThumbnail, setSelectedThumbnail] =
    useState<string>(DEFAULT_THUMBNAIL);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function resetState() {
    setName("");
    setNotes("");
    setSelectedThumbnail(DEFAULT_THUMBNAIL);
    setLocation("");
    setSaving(false);
    setConfirmDiscard(false);
  }

  const isDirty =
    name.trim() !== "" ||
    notes !== "" ||
    selectedThumbnail !== DEFAULT_THUMBNAIL;

  function handleAttemptClose() {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      resetState();
      onClose();
    }
  }

  function handleConfirmDiscard() {
    resetState();
    onClose();
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const piece = await createPiece({
        name: name.trim(),
        thumbnail: selectedThumbnail ?? "",
        notes: notes || undefined,
        current_location: undefinedIfBlank(location),
      });
      resetState();
      onClose();
      onCreated(piece);
    } finally {
      setSaving(false);
    }
  }

  const nameIsInvalid = name !== "" && name.trim() === "";
  const canSave = name.trim() !== "" && !saving;

  return (
    <>
      <Dialog open={open} onClose={handleAttemptClose} maxWidth="sm" fullWidth>
        <DialogTitle>New Piece</DialogTitle>
        <DialogContent>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            fullWidth
            error={nameIsInvalid}
            helperText={nameIsInvalid ? "Name cannot be blank" : ""}
            slotProps={{ htmlInput: { "data-testid": "name-input" } }}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) =>
              setNotes(e.target.value.slice(0, MAX_NOTES_LENGTH))
            }
            multiline
            rows={3}
            fullWidth
            helperText={`${notes.length} / ${MAX_NOTES_LENGTH}`}
            slotProps={{ htmlInput: { "data-testid": "notes-input" } }}
            sx={{ mb: 2 }}
          />
          <GlobalEntryField
            globalName="location"
            label="Location"
            value={location}
            onSelect={(entry) => setLocation(entryNameOrEmpty(entry))}
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle2" gutterBottom>
            Thumbnail
          </Typography>
          <Grid container spacing={1}>
            {CURATED_THUMBNAILS.map((url) => (
              <Grid key={url} size={2}>
                <Box
                  component="img"
                  src={url}
                  alt={url.split("/").pop()?.replace(".svg", "") ?? url}
                  onClick={() => setSelectedThumbnail(url)}
                  sx={{
                    width: "100%",
                    aspectRatio: "1",
                    cursor: "pointer",
                    border:
                      selectedThumbnail === url
                        ? "3px solid"
                        : "3px solid transparent",
                    borderColor:
                      selectedThumbnail === url
                        ? "primary.main"
                        : "transparent",
                    borderRadius: 1,
                    boxSizing: "border-box",
                  }}
                />
              </Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAttemptClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="save-button"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
        <DialogTitle>Discard new piece?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your changes have not been saved. If you leave now, your new piece
            will not be created.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button
            onClick={handleConfirmDiscard}
            color="error"
            data-testid="discard-button"
          >
            Discard
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
