import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";

import { createHumanCropRun } from "../util/api";
import { extractErrorMessage } from "../util/api";

interface ReportBadCropDialogProps {
  open: boolean;
  onClose: () => void;
  imageId: string;
}

export default function ReportBadCropDialog({
  open,
  onClose,
  imageId,
}: ReportBadCropDialogProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleClose() {
    if (!submitting) {
      setNotes("");
      setError(null);
      setSuccess(false);
      onClose();
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await createHumanCropRun({ image_id: imageId, notes });
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1000);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Report Bad Crop</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Let us know that the automatic crop for this image is incorrect.
          Optionally describe what looks wrong.
        </DialogContentText>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Thank you for your feedback!
          </Alert>
        )}
        <TextField
          label="Notes (optional)"
          multiline
          minRows={2}
          fullWidth
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting || success}
          slotProps={{ htmlInput: { "aria-label": "notes" } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting || success}
        >
          {submitting ? "Submitting…" : "Report"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
