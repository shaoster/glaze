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
  IconButton,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { CaptionedImage, PieceDetail } from "../util/types";
import { updateCurrentState, updatePiece } from "../util/api";
import DeletePiecePhotoDialog from "./DeletePiecePhotoDialog";
import ImageLightbox from "./ImageLightbox";
import PiecePhotoGalleryGrid from "./PiecePhotoGalleryGrid";
import { normalizeFields } from "../util/normalizeWorkflowFields";

export type PiecePhotoGalleryImage = CaptionedImage & {
  stateLabel: string;
  editableCurrentStateIndex: number | null;
};

export type EditablePiecePhoto = Pick<
  CaptionedImage,
  "url" | "caption" | "cloudinary_public_id" | "cloud_name"
>;

type PiecePhotoGalleryProps = {
  images: PiecePhotoGalleryImage[];
  pieceId?: string;
  currentStateNotes?: string;
  currentStateAdditionalFields?: Record<string, unknown>;
  currentThumbnailUrl?: string;
  onPieceUpdated?: (updated: PieceDetail) => void;
  updatePieceFn?: typeof updatePiece;
  updateCurrentStateFn?: typeof updateCurrentState;
};

const DEFAULT_VIEWPORT_WIDTH = 768;
const DEFAULT_PIXEL_RATIO = 1;

function getBrowserViewportWidth(): number {
  return globalThis.window?.innerWidth ?? DEFAULT_VIEWPORT_WIDTH;
}

function getBrowserPixelRatio(): number {
  return Math.max(globalThis.window?.devicePixelRatio ?? DEFAULT_PIXEL_RATIO, 1);
}

function isEditableImage(
  image: PiecePhotoGalleryImage,
): image is PiecePhotoGalleryImage & { editableCurrentStateIndex: number } {
  return image.editableCurrentStateIndex !== null;
}

export default function PiecePhotoGallery({
  images,
  pieceId,
  currentStateNotes,
  currentStateAdditionalFields,
  currentThumbnailUrl,
  onPieceUpdated,
  updatePieceFn,
  updateCurrentStateFn,
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
  const [viewportWidth, setViewportWidth] = useState(getBrowserViewportWidth);
  const pixelRatio = getBrowserPixelRatio();

  useEffect(() => {
    function syncWidth() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener("resize", syncWidth);
    return () => window.removeEventListener("resize", syncWidth);
  }, []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    setCaptionEditing(false);
    setCaptionSaveError(null);
    setCaptionDraft(images[lightboxIndex]?.caption ?? "");
  }, [images, lightboxIndex]);

  const photoCount = images.length;
  const columns = viewportWidth < 600 ? 2 : 3;
  const tileWidth = Math.max(
    120,
    Math.floor((Math.min(viewportWidth, 900) - 32 - (columns - 1) * 10) / columns),
  );
  const requestedWidth = Math.round(tileWidth * pixelRatio);
  const requestedHeight = Math.round(tileWidth * 0.8 * pixelRatio);

  const activeImage =
    lightboxIndex !== null ? images[lightboxIndex] : null;
  const editableCurrentStateIndex =
    activeImage?.editableCurrentStateIndex ?? null;
  const editableCurrentStateImages = images
    .filter(isEditableImage)
    .sort((left, right) => left.editableCurrentStateIndex - right.editableCurrentStateIndex)
    .map(({ url, caption, cloudinary_public_id, cloud_name }) => ({
      url,
      caption,
      cloudinary_public_id: cloudinary_public_id ?? null,
      cloud_name: cloud_name ?? null,
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
      })),
      additional_fields: normalizeFields(currentStateAdditionalFields ?? {}),
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
            requestedWidth={requestedWidth}
            requestedHeight={requestedHeight}
            canDeleteImages={canMutateCurrentStateImages}
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
    </>
  );
}
