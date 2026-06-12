import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Fab,
  Portal,
  Typography,
} from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import type { Dispatch } from "react";
import type { PieceDetail } from "../util/types";
import { updateCurrentState, type UpdateStatePayload } from "../util/api";
import { uploadImageToR2 } from "../util/r2Upload";
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
 * Upload trigger button that owns the direct-to-R2 upload lifecycle and
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const latestImagesRef = useRef<ImageEntry[]>(images);
  const imageSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleFilesSelected = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setUploadError(null);
      setUploading(true);
      try {
        for (const file of Array.from(fileList)) {
          const uploaded = await uploadImageToR2(file);
          saveUploadedImage({
            url: uploaded.url,
            caption: "",
            crop: null,
            cropped_url: null,
            width: uploaded.width,
            height: uploaded.height,
          });
        }
      } catch {
        setUploadError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [saveUploadedImage],
  );

  const handleUploadClick = useCallback(() => {
    if (hidden) return;
    setUploadError(null);
    fileInputRef.current?.click();
  }, [hidden]);

  const buttonDisabled = saving || uploading;
  const statusMessage = uploading
    ? "Uploading…"
    : saving
      ? "Saving…"
      : "Upload Image";

  return (
    <Box sx={hidden ? { display: "none" } : undefined}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="image-upload-input"
        onChange={(event) => void handleFilesSelected(event.target.files)}
      />
      {mobile ? (
        <Portal>
          <Fab
            color="primary"
            aria-label="Upload Image"
            onClick={handleUploadClick}
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
            {uploading ? (
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
            onClick={handleUploadClick}
            disabled={buttonDisabled}
            startIcon={
              saving || uploading ? (
                <CircularProgress size={14} color="inherit" />
              ) : undefined
            }
            sx={{ display: hidden ? "none" : undefined, position: "relative" }}
          >
            {statusMessage}
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
