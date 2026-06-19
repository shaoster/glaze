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
      <DialogTitle>Save Failed</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Your recent changes couldn't be saved automatically. Leave anyway and
          lose those changes?
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
