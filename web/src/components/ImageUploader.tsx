import {
  Box,
  Button,
  CircularProgress,
  Fab,
  Portal,
  Typography,
} from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";

export type ImageUploaderProps = {
  saving: boolean;
  widgetLoading: boolean;
  uploadError: string | null;
  imageError: string | null;
  mobile: boolean;
  hidden?: boolean;
  onUploadClick: () => void;
};

/**
 * Upload trigger button rendered either as a mobile FAB (via Portal) or a desktop
 * inline button (portaled into #piece-upload-trigger). Displays save/widget loading
 * states and surfaces upload or image-save errors beneath the trigger.
 */
export default function ImageUploader({
  saving,
  widgetLoading,
  uploadError,
  imageError,
  mobile,
  hidden = false,
  onUploadClick,
}: ImageUploaderProps) {
  const buttonDisabled = saving || widgetLoading;
  const statusMessage = saving ? "Saving…" : "Upload Image";

  return (
    <Box sx={hidden ? { display: "none" } : undefined}>
      {mobile ? (
        <Portal>
          <Fab
            color="primary"
            aria-label="Upload Image"
            onClick={onUploadClick}
            disabled={buttonDisabled}
            sx={{
              display: hidden ? "none" : undefined,
              position: "fixed",
              right: 24,
              bottom: 24,
              zIndex: (theme) => theme.zIndex.speedDial,
              boxShadow: (theme) => theme.shadows[8],
            }}
          >
            {widgetLoading ? (
              <CircularProgress aria-hidden size={20} color="inherit" />
            ) : (
              <PhotoCameraOutlinedIcon />
            )}
            <Box
              component="span"
              sx={{
                position: "absolute",
                width: 1,
                height: 1,
                p: 0,
                m: -1,
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            >
              {statusMessage}
            </Box>
          </Fab>
        </Portal>
      ) : (
        <Portal
          container={
            (typeof document !== "undefined" &&
              document.getElementById("piece-upload-trigger")) ||
            null
          }
        >
          <Button
            variant="outlined"
            size="small"
            onClick={onUploadClick}
            disabled={buttonDisabled}
            startIcon={
              saving ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
            sx={{ display: hidden ? "none" : undefined, position: "relative" }}
          >
            <Box sx={{ opacity: widgetLoading ? 0 : 1 }}>{statusMessage}</Box>
            {widgetLoading && (
              <CircularProgress
                aria-hidden
                size={14}
                color="inherit"
                sx={{ position: "absolute" }}
              />
            )}
          </Button>
        </Portal>
      )}
      {(uploadError || imageError) && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {uploadError ?? imageError}
        </Typography>
      )}
    </Box>
  );
}
