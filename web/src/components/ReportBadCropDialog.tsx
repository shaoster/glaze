import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Box,
  TextField,
} from "@mui/material";

import { createHumanCropRun } from "../util/api";
import { extractErrorMessage } from "../util/api";
import type { ImageCrop } from "../util/types";

interface ReportBadCropDialogProps {
  open: boolean;
  onClose: () => void;
  imageId: string;
  initialCrop?: ImageCrop | null;
}

export default function ReportBadCropDialog({
  open,
  onClose,
  imageId,
  initialCrop,
}: ReportBadCropDialogProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [crop, setCrop] = useState<ImageCrop>(
    initialCrop ?? { x: 0, y: 0, width: 1, height: 1 },
  );

  useEffect(() => {
    if (open) {
      setNotes("");
      setError(null);
      setSuccess(false);
      setCrop(initialCrop ?? { x: 0, y: 0, width: 1, height: 1 });
    }
  }, [open, initialCrop]);

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
      await createHumanCropRun({ image_id: imageId, notes, crop });
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
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, minmax(0, 1fr))" },
            gap: 1.5,
            mb: 2,
          }}
        >
          {(["x", "y", "width", "height"] as const).map((field) => (
            <Box key={field}>
              <TextField
                label={field.toUpperCase()}
                type="number"
                value={crop[field]}
                onChange={(e) =>
                  setCrop((prev) => ({
                    ...prev,
                    [field]: Number(e.target.value),
                  }))
                }
                inputProps={{
                  min: 0,
                  max: 1,
                  step: 0.01,
                  "aria-label": field,
                }}
                fullWidth
                disabled={submitting || success}
              />
            </Box>
          ))}
        </Box>
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
