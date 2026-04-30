import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

type DeletePiecePhotoDialogProps = {
  open: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeletePiecePhotoDialog({
  open,
  deleting,
  onCancel,
  onConfirm,
}: DeletePiecePhotoDialogProps) {
  return (
    <Dialog open={open} onClose={() => !deleting && onCancel()}>
      <DialogTitle>Remove Image</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Remove this image? This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={deleting}
        >
          Remove
        </Button>
      </DialogActions>
    </Dialog>
  );
}
