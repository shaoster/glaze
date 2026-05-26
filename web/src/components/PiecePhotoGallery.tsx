import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import CropIcon from "@mui/icons-material/Crop";
import EditIcon from "@mui/icons-material/Edit";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import PhotoSizeSelectActualIcon from "@mui/icons-material/PhotoSizeSelectActual";
import {
  alpha,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { CaptionedImage, ImageCrop, PieceDetail } from "../util/types";
import { moveImage, updateCurrentState, updateImageCrop, updatePiece } from "../util/api";
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
  const outerState = Object.fromEntries(
    Object.entries((location.state as Record<string, unknown> | null) ?? {}).filter(
      ([k]) => k !== "fromLightbox",
    ),
  );

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
  const outerState = Object.fromEntries(
    Object.entries((location.state as Record<string, unknown> | null) ?? {}).filter(
      ([k]) => k !== "fromLightbox",
    ),
  );

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
  const [moveMenuAnchor, setMoveMenuAnchor] = useState<HTMLElement | null>(null);

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
    .map(({ url, caption, cloudinary_public_id, cloud_name, crop, image_id }) => ({
      url,
      caption,
      cloudinary_public_id: cloudinary_public_id ?? null,
      cloud_name: cloud_name ?? null,
      crop: crop ?? null,
      image_id: image_id ?? null,
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

  async function handleCropSave(image: CaptionedImage, crop: ImageCrop) {
    if (!image.image_id) return;
    const updated = await updateImageCrop(image.image_id, crop);
    onPieceUpdated?.(updated);
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
        navigate(galleryPath, { state: { ...outerState, fromLightbox: true } });
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
  const canEditCaption = editableCurrentStateIndex !== null;

  const showMoveButton =
    activeImage?.image_id && pieceStates && pieceStates.length > 1;
  const canMove = Boolean(moveImageFn) && !moveSaving;

  const footer = ({ onCrop, onSetAsThumbnail: onSetThumb, settingThumbnail, isCurrentThumbnail }: {
    onCrop?: () => void;
    onSetAsThumbnail?: () => Promise<void>;
    settingThumbnail: boolean;
    isCurrentThumbnail: boolean;
  }) => activeImage ? (
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
            slotProps={{ htmlInput: { "aria-label": "Edit photo caption" } }}
            sx={{
              minWidth: 220,
              "& .MuiOutlinedInput-root": {
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "white",
              },
            }}
          />
          <Button size="small" variant="contained" onClick={() => void handleSaveCaption()} disabled={captionSaving}>
            {captionSaving ? "Saving…" : "Save"}
          </Button>
          <Button size="small" variant="text" onClick={stopEditingCaption} disabled={captionSaving}>
            Cancel
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
          {/* Caption */}
          {activeImage.caption ? (
            <Tooltip title={canEditCaption ? "Edit caption" : activeImage.caption}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditIcon fontSize="small" />}
                onClick={() => { if (canEditCaption) setCaptionEditing(true); }}
                disabled={!canEditCaption}
                sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)", textTransform: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {activeImage.caption}
              </Button>
            </Tooltip>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon fontSize="small" />}
              onClick={() => { setCaptionDraft(""); setCaptionEditing(true); }}
              disabled={!canEditCaption}
              sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)" }}
            >
              Caption
            </Button>
          )}

          {/* Move to */}
          {showMoveButton && (
            <>
              <Button
                size="small"
                variant="outlined"
                disabled={!canMove}
                onClick={(e) => { if (canMove) setMoveMenuAnchor(e.currentTarget); }}
                sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)" }}
              >
                {moveSaving ? "Moving…" : "Move to…"}
              </Button>
              <Menu
                anchorEl={moveMenuAnchor}
                open={Boolean(moveMenuAnchor)}
                onClose={() => setMoveMenuAnchor(null)}
              >
                {pieceStates!
                  .filter((s) => s.id !== activeImage.stateId)
                  .map((s) => (
                    <MenuItem
                      key={s.id}
                      onClick={() => {
                        setMoveMenuAnchor(null);
                        void handleMoveImage(s.id);
                      }}
                    >
                      {s.label}
                    </MenuItem>
                  ))}
              </Menu>
            </>
          )}

          {/* Thumbnail */}
          {onSetThumb && (
            <Tooltip title={isCurrentThumbnail ? "Current thumbnail" : "Set as thumbnail"}>
              <span>
                <IconButton
                  disabled={isCurrentThumbnail || settingThumbnail}
                  onClick={() => void onSetThumb()}
                  aria-label="Set as thumbnail"
                  sx={{ color: "white" }}
                >
                  {settingThumbnail
                    ? <CircularProgress size={20} sx={{ color: "white" }} />
                    : <PhotoSizeSelectActualIcon />}
                </IconButton>
              </span>
            </Tooltip>
          )}

          {/* Crop */}
          {onCrop && (
            <Tooltip title="Edit crop">
              <IconButton onClick={onCrop} aria-label="Edit crop" sx={{ color: "white" }}>
                <CropIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
      {captionSaveError && (
        <Typography variant="caption" sx={{ color: "error.light" }}>{captionSaveError}</Typography>
      )}
      {moveError && (
        <Typography variant="caption" sx={{ color: "error.light" }}>{moveError}</Typography>
      )}
      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
        {editableCurrentStateIndex !== null ? "Added in current state" : `Added in ${activeImage.stateLabel}`}
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
          key={lightboxIndex}
          images={images}
          initialIndex={lightboxIndex}
          onClose={() =>
            navigate(galleryPath, {
              state: { ...outerState, fromLightbox: true },
            })
          }
          currentThumbnailUrl={currentThumbnailUrl}
          onSetAsThumbnail={canSetThumbnail ? handleSetThumbnail : undefined}
          onCropSave={onPieceUpdated ? handleCropSave : undefined}
          canEditImage={(i) => isEditableImage(images[i])}
          footerActions={footer}
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
