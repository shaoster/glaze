import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
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
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { CaptionedImage, PieceDetail } from "../util/types";
import { moveImage, updateCurrentState, updatePiece } from "../util/api";
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
  label: string;
};

type PiecePhotoGalleryButtonProps = {
  images: PiecePhotoGalleryImage[];
  pieceId?: string;
};

/** Pill button that navigates to the piece's photo gallery URL. */
export function PiecePhotoGalleryButton({
  images,
  pieceId,
}: PiecePhotoGalleryButtonProps) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { id: pieceIdFromParams } = useParams<{ id: string }>();

  const effectivePieceId = pieceId || pieceIdFromParams;
  const galleryPath = `/pieces/${effectivePieceId}/photos`;

  // Strip the internal fromLightbox flag before forwarding state — keeps
  // fromGallery/returnTo alive so PieceDetailPage's back button stays correct.
  const { fromLightbox: _fromLightbox, ...outerState } =
    (location.state as Record<string, unknown> | null) ?? {};

  const photoCount = images.length;
  const triggerLabel = `${photoCount} photo${photoCount === 1 ? "" : "s"}`;

  return (
    <Box
      component="button"
      type="button"
      onClick={() =>
        photoCount > 0 && navigate(galleryPath, { state: outerState })
      }
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
  );
}

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
  moveImageFn?: typeof moveImage;
};

function isEditableImage(
  image: PiecePhotoGalleryImage,
): image is PiecePhotoGalleryImage & { editableCurrentStateIndex: number } {
  return image.editableCurrentStateIndex !== null;
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
  moveImageFn,
}: PiecePhotoGalleryProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: pieceIdFromParams } = useParams<{ id: string }>();

  const effectivePieceId = pieceId || pieceIdFromParams;
  const piecePath = `/pieces/${effectivePieceId}`;
  const galleryPath = `${piecePath}/photos`;

  // Strip the internal fromLightbox flag before forwarding state — keeps
  // fromGallery/returnTo alive so PieceDetailPage's back button stays correct.
  const { fromLightbox: _fromLightbox, ...outerState } =
    (location.state as Record<string, unknown> | null) ?? {};

  const atGallery = location.pathname === galleryPath;
  const atPhotos =
    location.pathname === galleryPath ||
    location.pathname.startsWith(`${galleryPath}/`);
  const photoIndexMatch = location.pathname.match(/\/photos\/(\d+)$/);
  const urlPhotoIndex = photoIndexMatch
    ? parseInt(photoIndexMatch[1], 10)
    : null;
  const atLightbox = urlPhotoIndex !== null && !isNaN(urlPhotoIndex);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(
    urlPhotoIndex,
  );
  const [captionDraft, setCaptionDraft] = useState("");
  const [captionEditing, setCaptionEditing] = useState(false);
  const [captionSaving, setCaptionSaving] = useState(false);
  const [captionSaveError, setCaptionSaveError] = useState<string | null>(null);
  const [deleteDialogIndex, setDeleteDialogIndex] = useState<number | null>(
    null,
  );
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    if (urlPhotoIndex !== null) setLightboxIndex(urlPhotoIndex);
  }, [urlPhotoIndex]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    setCaptionEditing(false);
    setCaptionSaveError(null);
    setMoveError(null);
    setCaptionDraft(images[lightboxIndex]?.caption ?? "");
  }, [images, lightboxIndex]);

  const activeImage = lightboxIndex !== null ? images[lightboxIndex] : null;
  const editableCurrentStateIndex =
    activeImage?.editableCurrentStateIndex ?? null;
  const editableCurrentStateImages = images
    .filter(isEditableImage)
    .sort(
      (left, right) =>
        left.editableCurrentStateIndex - right.editableCurrentStateIndex,
    )
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
          caption:
            index === editableCurrentStateIndex
              ? captionDraft.trim()
              : image.caption,
        })),
      );
      setCaptionEditing(false);
    } catch {
      setCaptionSaveError("Failed to save caption. Please try again.");
    } finally {
      setCaptionSaving(false);
    }
  }

  async function handleMoveImage(toStateId: string) {
    if (!activeImage?.image_id || !moveImageFn || !onPieceUpdated) return;
    setMoveSaving(true);
    setMoveError(null);
    try {
      const updated = await moveImageFn(
        activeImage.image_id,
        activeImage.stateId,
        toStateId,
      );
      onPieceUpdated(updated);
      navigate(galleryPath, { state: outerState });
    } catch {
      setMoveError("Failed to move photo. Please try again.");
    } finally {
      setMoveSaving(false);
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
          (_editableImage, index) =>
            index !== image.editableCurrentStateIndex,
        ),
      );
      if (lightboxIndex === deleteDialogIndex) {
        navigate(galleryPath, { state: outerState });
      }
      setDeleteDialogIndex(null);
    } finally {
      setDeleteSaving(false);
    }
  }

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
    editableCurrentStateIndex !== null && canMutateCurrentStateImages;

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
                sx={{
                  color: "rgba(255,255,255,0.6)",
                  "&:hover": { color: "white" },
                }}
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
      {moveImageFn &&
        activeImage.image_id &&
        pieceStates &&
        pieceStates.length > 1 && (
          <Select
            size="small"
            displayEmpty
            value=""
            disabled={moveSaving}
            onChange={(e) => {
              if (e.target.value) void handleMoveImage(e.target.value);
            }}
            aria-label="Move photo to state"
            sx={{
              color: "rgba(255,255,255,0.85)",
              fontSize: "0.75rem",
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.35)",
              },
              "& .MuiSvgIcon-root": { color: "rgba(255,255,255,0.6)" },
            }}
          >
            <MenuItem value="" disabled>
              {moveSaving ? "Moving…" : "Move to…"}
            </MenuItem>
            {pieceStates
              .filter((s) => s.id !== activeImage.stateId)
              .map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.label}
                </MenuItem>
              ))}
          </Select>
        )}
      {moveError && (
        <Typography variant="caption" sx={{ color: "error.light" }}>
          {moveError}
        </Typography>
      )}
      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
        {editableCurrentStateIndex !== null
          ? "Added in current state"
          : `Added in ${activeImage.stateLabel}`}
      </Typography>
    </Box>
  ) : null;

  if (atGallery) {
    const fromLightbox =
      (location.state as Record<string, unknown>)?.fromLightbox === true;
    if (images.length === 0) return <Navigate to={piecePath} replace />;
    if (images.length === 1) {
      return fromLightbox ? (
        <Navigate to={piecePath} replace />
      ) : (
        <Navigate to={`${galleryPath}/0`} replace />
      );
    }
  }

  return (
    <>
      <PiecePhotoGalleryButton images={images} pieceId={pieceId} />

      <Dialog
        open={atPhotos}
        onClose={() => navigate(piecePath, { state: outerState })}
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
            onOpenImage={(index) =>
              navigate(`${galleryPath}/${index}`, { state: outerState })
            }
            onRequestDelete={setDeleteDialogIndex}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => navigate(piecePath, { state: outerState })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {atLightbox && lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() =>
            navigate(galleryPath, {
              state: { ...outerState, fromLightbox: true },
            })
          }
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
