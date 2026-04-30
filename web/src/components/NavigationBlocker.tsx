import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";

type NavigationBlockerProps = {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
};

export default function NavigationBlocker({
  open,
  onStay,
  onLeave,
}: NavigationBlockerProps) {
  return (
    <Dialog open={open}>
      <DialogTitle>Unsaved Changes</DialogTitle>
      <DialogContent>
        <DialogContentText>
          You have unsaved changes. Are you sure you want to leave?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onStay}>Stay</Button>
        <Button onClick={onLeave} color="error">
          Leave without saving
        </Button>
      </DialogActions>
    </Dialog>
  );
}
