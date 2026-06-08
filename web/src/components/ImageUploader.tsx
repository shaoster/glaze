import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Fab,
  Portal,
  Typography,
  useTheme,
} from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import type { Dispatch } from "react";
import type { PieceDetail } from "../util/types";
import { updateCurrentState, type UpdateStatePayload } from "../util/api";
import { openCloudinaryUploadWidget } from "../util/cloudinaryUpload";
import type { DraftAction, ImageEntry } from "./workflowStateDraft";

export type ImageUploaderProps = {
  pieceId: string;
  initialStateId: string;
  saveStateFn?: (payload: UpdateStatePayload) => Promise<PieceDetail>;
  notes: string;
  normalizedCustomFields: Record<string, string | number | boolean | null>;
  images: ImageEntry[];
  onSaved: (updated: PieceDetail) => void;
  dispatch: Dispatch<DraftAction>;
  mobile: boolean;
  hidden?: boolean;
};

/**
 * Upload trigger button that owns the full Cloudinary upload lifecycle and
 * sequential image-save queue. Renders as a mobile FAB (via Portal) or a
 * desktop inline button (portaled into #piece-upload-trigger). Manages its
 * own loading and error state so callers only provide configuration.
 */
export default function ImageUploader({
  pieceId,
  initialStateId,
  saveStateFn,
  notes,
  normalizedCustomFields,
  images,
  onSaved,
  dispatch,
  mobile,
  hidden = false,
}: ImageUploaderProps) {
  const theme = useTheme();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const latestImagesRef = useRef<ImageEntry[]>(images);
  const imageSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latestImagesRef.current = images;
  }, [images]);

  const saveUploadedImage = useCallback(
    (newImage: ImageEntry) => {
      setSaving(true);
      setImageError(null);
      const queuedSave = imageSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const nextImages = [...latestImagesRef.current, newImage];
          const payload = {
            notes,
            images: nextImages,
            custom_fields: normalizedCustomFields,
          };
          const saveFn = saveStateFn ?? ((p) => updateCurrentState(pieceId, p));
          const result = await saveFn(payload);
          const savedState = saveStateFn
            ? (result.history.find((ps) => ps.id === initialStateId) ??
              result.current_state)
            : result.current_state;
          latestImagesRef.current = savedState.images;
          dispatch({ type: "replace_base_state", pieceState: savedState });
          onSaved(result);
        });
      imageSaveQueueRef.current = queuedSave;
      queuedSave
        .catch(() => setImageError("Failed to save image. Please try again."))
        .finally(() => {
          if (imageSaveQueueRef.current === queuedSave) {
            setSaving(false);
          }
        });
    },
    [dispatch, initialStateId, normalizedCustomFields, notes, onSaved, pieceId, saveStateFn],
  );

  const handleUploadClick = useCallback(async () => {
    if (hidden) return;
    setUploadError(null);
    setWidgetLoading(true);
    const hideStyle = document.createElement("style");
    hideStyle.textContent = 'iframe[title="Upload Widget"] { opacity: 0; }';
    document.head.appendChild(hideStyle);
    // On iOS PWA with viewport-fit=cover the status bar overlays the page.
    const safeAreaStyle = document.createElement("style");
    safeAreaStyle.textContent =
      'iframe[title="Upload Widget"] { top: env(safe-area-inset-top) !important; height: calc(100dvh - env(safe-area-inset-top)) !important; }';
    document.head.appendChild(safeAreaStyle);

    const cleanupWidgetStyles = () => {
      hideStyle.remove();
      safeAreaStyle.remove();
    };
    const uploadWidget = await openCloudinaryUploadWidget({
      messages: {
        configError: "Failed to load upload configuration. Please try again.",
        unavailableError:
          "Upload widget is not available in this browser. Please try again.",
        signatureError: "Failed to sign upload. Please try again.",
        uploadError: "Upload failed. Please try again.",
      },
      widgetOptions: {
        sources: ["local", "camera"],
        multiple: true,
        resourceType: "image",
        styles: {
          palette: {
            window: theme.palette.background.paper,
            windowBorder: theme.palette.divider,
            tabIcon: theme.palette.primary.main,
            menuIcons: theme.palette.text.secondary,
            textDark: theme.palette.text.primary,
            textLight: theme.palette.text.secondary,
            link: theme.palette.primary.main,
            action: theme.palette.primary.dark,
            inactiveTabIcon: theme.palette.text.disabled,
            error: theme.palette.error.main,
            inProgress: theme.palette.primary.main,
            complete: theme.palette.success.main,
            sourceBg: theme.palette.background.default,
          },
          frame: { background: "#00000000" },
        } as { palette: Record<string, string> },
      },
      callbacks: {
        onError: (message) => {
          setWidgetLoading(false);
          cleanupWidgetStyles();
          setUploadError(message);
        },
        onDisplayChange: (state) => {
          if (state === "shown") {
            setWidgetLoading(false);
            hideStyle.remove();
            const iframe = document.querySelector(
              'iframe[title="Upload Widget"]',
            );
            if (iframe instanceof HTMLElement) {
              iframe.style.transition = "opacity 0.15s ease-in";
              iframe.style.opacity = "1";
            }
          } else if (state === "hidden" || state === "destroyed") {
            safeAreaStyle.remove();
          }
        },
        onSuccess: (result, config) => {
          saveUploadedImage({
            url: result.info.secure_url,
            caption: "",
            cloudinary_public_id: result.info.public_id,
            cloud_name: config.cloud_name,
            crop: null,
            width: result.info.width ?? null,
            height: result.info.height ?? null,
          });
        },
      },
    });
    if (!uploadWidget) {
      setWidgetLoading(false);
      cleanupWidgetStyles();
    }
  }, [hidden, saveUploadedImage, theme]);

  const buttonDisabled = saving || widgetLoading;
  const statusMessage = saving ? "Saving…" : "Upload Image";

  return (
    <Box sx={hidden ? { display: "none" } : undefined}>
      {mobile ? (
        <Portal>
          <Fab
            color="primary"
            aria-label="Upload Image"
            onClick={() => void handleUploadClick()}
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
            onClick={() => void handleUploadClick()}
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
