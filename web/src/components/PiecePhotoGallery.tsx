import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import PhotoLibraryOutlinedIcon from "@mui/icons-material/PhotoLibraryOutlined";
import {
  alpha,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Typography,
  useTheme,
} from "@mui/material";
import type { CaptionedImage, ImageCrop, PieceDetail } from "../util/types";
import { moveImage, updateCurrentState, updateImageCrop, updatePastState, updatePiece } from "../util/api";
import DeletePiecePhotoDialog from "./DeletePiecePhotoDialog";
import ImageLightbox from "./ImageLightbox";
import PiecePhotoGalleryGrid from "./PiecePhotoGalleryGrid";
import { normalizeFields } from "../util/normalizeWorkflowFields";
import LightboxFooter from "./LightboxFooter";

export type PiecePhotoGalleryImage = CaptionedImage & {
  stateLabel: string;
  stateId: string;
  editableCurrentStateIndex: number | null;
};

export type EditablePiecePhoto = Pick<
  CaptionedImage,
  "url" | "caption" | "crop" | "width" | "height"
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
  updatePastStateFn?: typeof updatePastState;
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
  updatePastStateFn,
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
  const atPhotos = atGallery || location.pathname.startsWith(`${galleryPath}/`);
  const photoIndexMatch = location.pathname.match(/\/photos\/(\d+)$/);
  const urlPhotoIndex = photoIndexMatch
    ? parseInt(photoIndexMatch[1], 10)
    : null;
  const atLightbox = urlPhotoIndex !== null && !isNaN(urlPhotoIndex);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(
    urlPhotoIndex,
  );
  const [deleteDialogIndex, setDeleteDialogIndex] = useState<number | null>(
    null,
  );
  const [deleteSaving, setDeleteSaving] = useState(false);

  const activeImage = lightboxIndex !== null ? images[lightboxIndex] : null;
  const editableCurrentStateIndex =
    activeImage?.editableCurrentStateIndex ?? null;
  const editableCurrentStateImages = images
    .filter(isEditableImage)
    .sort(
      (left, right) =>
        left.editableCurrentStateIndex - right.editableCurrentStateIndex,
    )
    .map(({ url, caption, crop, image_id, width, height }) => ({
      url,
      caption,
      crop: crop ?? null,
      image_id: image_id ?? null,
      width: width ?? null,
      height: height ?? null,
    }));

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
        crop: image.crop ?? null,
        width: image.width ?? null,
        height: image.height ?? null,
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
        crop: image.crop ?? null,
        cropped_url: image.cropped_url ?? null,
        image_id: image.image_id ?? null,
        width: image.width ?? null,
        height: image.height ?? null,
      },
    });
    onPieceUpdated(updated);
  }

  async function handleCropSave(image: CaptionedImage, crop: ImageCrop) {
    if (!image.image_id) return;
    const updated = await updateImageCrop(image.image_id, crop);
    onPieceUpdated?.(updated);
  }

  async function handleDeleteImage() {
    if (deleteDialogIndex === null) return;
    const image = images[deleteDialogIndex];
    if (!image) return;

    setDeleteSaving(true);
    try {
      if (image.editableCurrentStateIndex !== null && updateCurrentStateFn) {
        await persistCurrentStateImages(
          editableCurrentStateImages.filter(
            (_editableImage, index) =>
              index !== image.editableCurrentStateIndex,
          ),
        );
      } else if (image.editableCurrentStateIndex === null && updatePastStateFn && pieceId) {
        const siblingImages = images
          .filter((img) => img.stateId === image.stateId && img !== image)
          .map(({ url, caption, crop, width, height }) => ({
            url,
            caption,
            crop: crop ?? null,
            width: width ?? null,
            height: height ?? null,
          }));
        const updated = await updatePastStateFn(pieceId, image.stateId, {
          images: siblingImages,
        });
        onPieceUpdated?.(updated);
      } else {
        return;
      }
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
  const canDeletePastStateImages =
    pieceId !== undefined &&
    onPieceUpdated !== undefined &&
    updatePastStateFn !== undefined;
  const canSetThumbnail =
    pieceId !== undefined &&
    onPieceUpdated !== undefined &&
    updatePieceFn !== undefined;

  useEffect(() => {
    if (urlPhotoIndex !== null) setLightboxIndex(urlPhotoIndex);
  }, [urlPhotoIndex]);

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
            canDeletePastImages={canDeletePastStateImages}
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
          canEditImage={(i) => {
            const img = images[i];
            return !!img?.image_id;
          }}
          footerActions={(props) => {
            const onSaveCaption =
              canMutateCurrentStateImages && editableCurrentStateIndex !== null
                ? async (caption: string) => {
                    await persistCurrentStateImages(
                      editableCurrentStateImages.map((img, i) => ({
                        ...img,
                        caption:
                          i === editableCurrentStateIndex ? caption : img.caption,
                      })),
                    );
                  }
                : null;
            return (
              <LightboxFooter
                activeImage={activeImage}
                onSaveCaption={onSaveCaption}
                pieceStates={pieceStates}
                moveImageFn={moveImageFn}
                onPieceUpdated={onPieceUpdated}
                onMoveSuccess={() =>
                  navigate(galleryPath, { state: outerState })
                }
                {...props}
              />
            );
          }}
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
