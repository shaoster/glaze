import EditIcon from "@mui/icons-material/Edit";
import {
  Box,
  Button,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

type PiecePhotoGalleryFooterProps = {
  activeCaption: string;
  stateLabel: string;
  captionDraft: string;
  captionEditing: boolean;
  captionSaving: boolean;
  captionSaveError: string | null;
  canEditCaption: boolean;
  isCurrentStateImage: boolean;
  onCaptionDraftChange: (value: string) => void;
  onStartEditing: () => void;
  onStopEditing: () => void;
  onSaveCaption: () => void;
};

export default function PiecePhotoGalleryFooter({
  activeCaption,
  stateLabel,
  captionDraft,
  captionEditing,
  captionSaving,
  captionSaveError,
  canEditCaption,
  isCurrentStateImage,
  onCaptionDraftChange,
  onStartEditing,
  onStopEditing,
  onSaveCaption,
}: PiecePhotoGalleryFooterProps) {
  return (
    <Box sx={{ display: "grid", gap: 0.75, justifyItems: "center" }}>
      {captionEditing ? (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            size="small"
            value={captionDraft}
            onChange={(event) => onCaptionDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSaveCaption();
              if (event.key === "Escape") onStopEditing();
            }}
            autoFocus
            slotProps={{
              htmlInput: { "aria-label": "Edit photo caption" },
            }}
            sx={{
              minWidth: 220,
              "& .MuiOutlinedInput-root": {
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "white",
              },
            }}
          />
          <Button
            size="small"
            variant="contained"
            onClick={onSaveCaption}
            disabled={captionSaving}
          >
            {captionSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={onStopEditing}
            disabled={captionSaving}
          >
            Cancel
          </Button>
        </Box>
      ) : activeCaption ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => canEditCaption && onStartEditing()}
            disabled={!canEditCaption}
            sx={{
              color: "rgba(255,255,255,0.85)",
              textTransform: "none",
              minWidth: 0,
              p: 0,
              lineHeight: 1.4,
              "&:hover": { backgroundColor: "transparent", color: "white" },
            }}
          >
            {activeCaption}
          </Button>
          {canEditCaption && (
            <Tooltip title="Edit caption">
              <IconButton
                size="small"
                onClick={onStartEditing}
                aria-label="Edit caption"
                sx={{ color: "rgba(255,255,255,0.6)", "&:hover": { color: "white" } }}
              >
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ) : canEditCaption ? (
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditIcon fontSize="small" />}
          onClick={onStartEditing}
          sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)" }}
        >
          Add caption
        </Button>
      ) : null}
      {captionSaveError && (
        <Typography variant="caption" sx={{ color: "error.light" }}>
          {captionSaveError}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
        {isCurrentStateImage ? "Added in current state" : `Added in ${stateLabel}`}
      </Typography>
    </Box>
  );
}
