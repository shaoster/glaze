import { useEffect, useState } from "react";
import EditIcon from "@mui/icons-material/Edit";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import {
  alpha,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { CaptionedImage, PieceDetail, State } from "../util/types";
import { updateCurrentState, updatePastState, updatePiece } from "../util/api";
import DeletePiecePhotoDialog from "./DeletePiecePhotoDialog";
import ImageLightbox from "./ImageLightbox";
import PiecePhotoGalleryGrid from "./PiecePhotoGalleryGrid";
import { normalizeFields } from "../util/normalizeWorkflowFields";

export type PiecePhotoGalleryImage = CaptionedImage & {
  stateLabel: string;
  stateId: string;
  editableCurrentStateIndex: number | null;
};

export type EditablePiecePhoto = Pick<
  CaptionedImage,
  "url" | "caption" | "cloudinary_public_id" | "cloud_name" | "crop"
>;

type PieceStateRef = {
  id: string;
  state: State;
  label: string;
};

type PiecePhotoGalleryProps = {
  images: PiecePhotoGalleryImage[];
  pieceId?: string;
  currentStateNotes?: string;
  currentStateCustomFields?: Record<string, unknown>;
  currentThumbnailUrl?: string;
  onPieceUpdated?: (updated: PieceDetail) => void;
  updatePieceFn?: typeof updatePiece;
  updateCurrentStateFn?: typeof updateCurrentState;
  pieceStates?: PieceStateRef[];
  currentStateId?: string;
  isEditable?: boolean;
  updatePastStateFn?: typeof updatePastState;
};

function isEditableImage(
  image: PiecePhotoGalleryImage,
): image is PiecePhotoGalleryImage & { editableCurrentStateIndex: number } {
  return image.editableCurrentStateIndex !== null;
}

function toEditablePhoto(image: CaptionedImage): EditablePiecePhoto {
  return {
    url: image.url,
    caption: image.caption,
    cloudinary_public_id: image.cloudinary_public_id ?? null,
    cloud_name: image.cloud_name ?? null,
    crop: image.crop ?? null,
  };
}

export default function PiecePhotoGallery({
  images,
  pieceId,
  currentStateNotes,
  currentStateCustomFields,
  currentThumbnailUrl,
  onPieceUpdated,
  updatePieceFn,
  updateCurrentStateFn,
  pieceStates,
  currentStateId,
  isEditable,
  updatePastStateFn,
}: PiecePhotoGalleryProps) {
  const theme = useTheme();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [captionDraft, setCaptionDraft] = useState("");
  const [captionEditing, setCaptionEditing] = useState(false);
  const [captionSaving, setCaptionSaving] = useState(false);
  const [captionSaveError, setCaptionSaveError] = useState<string | null>(null);
  const [deleteDialogIndex, setDeleteDialogIndex] = useState<number | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [moveDialogImageIndex, setMoveDialogImageIndex] = useState<number | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    if (lightboxIndex === null) return;
    setCaptionEditing(false);
    setCaptionSaveError(null);
    setCaptionDraft(images[lightboxIndex]?.caption ?? "");
  }, [images, lightboxIndex]);

  const photoCount = images.length;

  const activeImage =
    lightboxIndex !== null ? images[lightboxIndex] : null;
  const editableCurrentStateIndex =
    activeImage?.editableCurrentStateIndex ?? null;
  const editableCurrentStateImages = images
    .filter(isEditableImage)
    .sort((left, right) => left.editableCurrentStateIndex - right.editableCurrentStateIndex)
    .map(({ url, caption, cloudinary_public_id, cloud_name, crop }) => ({
      url,
      caption,
      cloudinary_public_id: cloudinary_public_id ?? null,
      cloud_name: cloud_name ?? null,
      crop: crop ?? null,
    }));

  function stopEditingCaption() {
    setCaptionEditing(false);
    setCaptionSaveError(null);
    setCaptionDraft(activeImage?.caption ?? "");
  }

  async function persistCurrentStateImages(nextImages: EditablePiecePhoto[]) {
    if (
      !pieceId ||
      currentStateNotes === undefined ||
      !onPieceUpdated ||
      !updateCurrentStateFn
    ) {
      return;
    }
    const updated = await updateCurrentStateFn(pieceId, {
      notes: currentStateNotes,
      images: nextImages.map((image) => ({
        url: image.url,
        caption: image.caption,
        cloudinary_public_id: image.cloudinary_public_id ?? null,
        cloud_name: image.cloud_name ?? null,
        crop: image.crop ?? null,
      })),
      custom_fields: normalizeFields(currentStateCustomFields ?? {}),
    });
    onPieceUpdated(updated);
  }

  async function handleSetThumbnail(image: CaptionedImage) {
    if (!pieceId || !onPieceUpdated || !updatePieceFn) {
      return;
    }
    const updated = await updatePieceFn(pieceId, {
      thumbnail: {
        url: image.url,
        cloudinary_public_id: image.cloudinary_public_id ?? null,
        cloud_name: image.cloud_name ?? null,
        crop: image.crop ?? null,
      },
    });
    onPieceUpdated(updated);
  }

  async function handleSaveCaption() {
    if (
      lightboxIndex === null ||
      editableCurrentStateIndex === null ||
      !updateCurrentStateFn
    ) {
      return;
    }
    setCaptionSaving(true);
    setCaptionSaveError(null);
    try {
      await persistCurrentStateImages(
        editableCurrentStateImages.map((image, index) => ({
          ...image,
          caption: index === editableCurrentStateIndex ? captionDraft.trim() : image.caption,
        })),
      );
      setCaptionEditing(false);
    } catch {
      setCaptionSaveError("Failed to save caption. Please try again.");
    } finally {
      setCaptionSaving(false);
    }
  }

  async function handleDeleteImage() {
    if (deleteDialogIndex === null || !updateCurrentStateFn) {
      return;
    }
    const image = images[deleteDialogIndex];
    if (!image || image.editableCurrentStateIndex === null) {
      return;
    }
    setDeleteSaving(true);
    try {
      await persistCurrentStateImages(
        editableCurrentStateImages.filter(
          (_editableImage, index) => index !== image.editableCurrentStateIndex,
        ),
      );
      if (lightboxIndex === deleteDialogIndex) {
        setLightboxIndex(null);
      }
      setDeleteDialogIndex(null);
    } finally {
      setDeleteSaving(false);
    }
  }

  async function handleMoveImage(targetStateId: string) {
    if (
      moveDialogImageIndex === null ||
      !pieceId ||
      !onPieceUpdated ||
      !updateCurrentStateFn ||
      !updatePastStateFn
    ) {
      return;
    }
    const image = images[moveDialogImageIndex];
    const sourceStateId = image.stateId;

    const nextSourceImages = images
      .filter((img) => img.stateId === sourceStateId && img !== image)
      .map(toEditablePhoto);

    setMoveSaving(true);
    setMoveError(null);
    try {
      let updatedAfterSource: PieceDetail;
      if (sourceStateId === currentStateId) {
        updatedAfterSource = await updateCurrentStateFn(pieceId, {
          notes: currentStateNotes!,
          images: nextSourceImages,
          custom_fields: normalizeFields(currentStateCustomFields ?? {}),
        });
      } else {
        updatedAfterSource = await updatePastStateFn(pieceId, sourceStateId, {
          images: nextSourceImages,
        });
      }

      const allStates = [updatedAfterSource.current_state, ...updatedAfterSource.history];
      const targetState = allStates.find((s) => s.id === targetStateId);
      if (!targetState) {
        throw new Error("Target state not found.");
      }
      const nextTargetImages = [...targetState.images.map(toEditablePhoto), toEditablePhoto(image)];

      let finalPiece: PieceDetail;
      if (targetStateId === currentStateId) {
        finalPiece = await updateCurrentStateFn(pieceId, {
          notes: updatedAfterSource.current_state.notes,
          images: nextTargetImages,
          custom_fields: normalizeFields(updatedAfterSource.current_state.custom_fields ?? {}),
        });
      } else {
        finalPiece = await updatePastStateFn(pieceId, targetStateId, {
          images: nextTargetImages,
        });
      }
      onPieceUpdated(finalPiece);
      setMoveDialogImageIndex(null);
      setLightboxIndex(null);
    } catch {
      setMoveError("Failed to move image. Please try again.");
    } finally {
      setMoveSaving(false);
    }
  }

  const triggerLabel = `${photoCount} photo${photoCount === 1 ? "" : "s"}`;

  const canMutateCurrentStateImages =
    pieceId !== undefined &&
    currentStateNotes !== undefined &&
    onPieceUpdated !== undefined &&
    updateCurrentStateFn !== undefined;
  const canSetThumbnail =
    pieceId !== undefined &&
    onPieceUpdated !== undefined &&
    updatePieceFn !== undefined;
  const canEditCaption =
    editableCurrentStateIndex !== null &&
    canMutateCurrentStateImages;
  const canMove =
    canMutateCurrentStateImages &&
    isEditable === true &&
    updatePastStateFn !== undefined &&
    (pieceStates?.length ?? 0) > 1;

  const footer = activeImage ? (
    <Box sx={{ display: "grid", gap: 0.75, justifyItems: "center" }}>
      {captionEditing ? (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            size="small"
            value={captionDraft}
            onChange={(event) => setCaptionDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSaveCaption();
              if (event.key === "Escape") stopEditingCaption();
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
            onClick={() => void handleSaveCaption()}
            disabled={captionSaving}
          >
            {captionSaving ? "Saving…" : "Save"}
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={stopEditingCaption}
            disabled={captionSaving}
          >
            Cancel
          </Button>
        </Box>
      ) : activeImage.caption ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              if (!canEditCaption) return;
              setCaptionEditing(true);
            }}
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
            {activeImage.caption}
          </Button>
          {canEditCaption && (
            <Tooltip title="Edit caption">
              <IconButton
                size="small"
                onClick={() => setCaptionEditing(true)}
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
          onClick={() => {
            setCaptionDraft("");
            setCaptionEditing(true);
          }}
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
        {editableCurrentStateIndex !== null
          ? "Added in current state"
          : `Added in ${activeImage.stateLabel}`}
      </Typography>
      {canMove ? (
        <Button
          size="small"
          variant="outlined"
          onClick={() => setMoveDialogImageIndex(lightboxIndex)}
          sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)" }}
        >
          Move to state
        </Button>
      ) : canMutateCurrentStateImages && !isEditable ? (
        <Tooltip title="Piece must be editable to move images.">
          <span>
            <Button
              size="small"
              variant="outlined"
              disabled
              sx={{ color: "rgba(255,255,255,0.35)", borderColor: "rgba(255,255,255,0.2)" }}
            >
              Move to state
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </Box>
  ) : null;

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={() => photoCount > 0 && setGalleryOpen(true)}
        disabled={photoCount === 0}
        aria-label={triggerLabel}
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          px: 1.25,
          py: 0.75,
          borderRadius: 999,
          backgroundColor: alpha(theme.palette.background.default, 0.56),
          color: "text.secondary",
          backdropFilter: "blur(8px)",
          border: "1px solid",
          borderColor: "divider",
          cursor: photoCount > 0 ? "pointer" : "default",
          opacity: photoCount > 0 ? 1 : 0.7,
        }}
      >
        <PhotoLibraryOutlinedIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption">{triggerLabel}</Typography>
      </Box>

      <Dialog
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        maxWidth="md"
        fullWidth
        aria-label="Piece photos"
        PaperProps={{ sx: { height: "80vh", borderRadius: "8px" } }}
      >
        <DialogContent sx={{ p: 2 }}>
          <PiecePhotoGalleryGrid
            images={images}
            canDeleteImages={canMutateCurrentStateImages}
            currentThumbnailUrl={currentThumbnailUrl}
            onOpenImage={setLightboxIndex}
            onRequestDelete={setDeleteDialogIndex}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGalleryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          currentThumbnailUrl={currentThumbnailUrl}
          onSetAsThumbnail={canSetThumbnail ? handleSetThumbnail : undefined}
          footerActions={() => footer}
        />
      )}

      <DeletePiecePhotoDialog
        open={deleteDialogIndex !== null}
        deleting={deleteSaving}
        onCancel={() => setDeleteDialogIndex(null)}
        onConfirm={() => void handleDeleteImage()}
      />

      {moveDialogImageIndex !== null && (
        <Dialog
          open
          onClose={() => !moveSaving && setMoveDialogImageIndex(null)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Move image to state</DialogTitle>
          <DialogContent>
            <List disablePadding>
              {(pieceStates ?? [])
                .filter((s) => s.id !== images[moveDialogImageIndex]?.stateId)
                .map((s) => (
                  <ListItemButton
                    key={s.id}
                    onClick={() => void handleMoveImage(s.id)}
                    disabled={moveSaving}
                  >
                    <ListItemText primary={s.label} />
                  </ListItemButton>
                ))}
            </List>
            {moveError && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                {moveError}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setMoveDialogImageIndex(null);
                setMoveError(null);
              }}
              disabled={moveSaving}
            >
              Cancel
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
