import React, { useState, Suspense } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Modal,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useSwipeable } from "react-swipeable";
import type { CaptionedImage, ImageCrop } from "../util/types";
import CloudinaryImage from "./CloudinaryImage";
import { getCloudinaryUrl } from "../util/cloudinary";
import CropOverlay from "./CropOverlay";
import { useSuspendedImageLoad } from "../util/imageQueries";

const SWIPE_THRESHOLD = 50;

type ImageLightboxProps = {
  images: CaptionedImage[];
  initialIndex: number;
  onClose: () => void;
  currentThumbnailUrl?: string;
  onSetAsThumbnail?: (image: CaptionedImage) => Promise<void>;
  onCropSave?: (image: CaptionedImage, crop: ImageCrop) => Promise<void>;
  canEditImage?: (index: number) => boolean;
  footerActions?: (opts: {
    index: number;
    onCrop?: () => void;
    cropAvailable?: boolean;
    onSetAsThumbnail?: () => Promise<void>;
    isCurrentThumbnail: boolean;
  }) => React.ReactNode;
};

export default function ImageLightbox({
  images,
  initialIndex,
  onClose,
  currentThumbnailUrl,
  onSetAsThumbnail,
  onCropSave,
  canEditImage,
  footerActions,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [postCropLoading, setPostCropLoading] = useState(false);
  const [pendingCropAspect, setPendingCropAspect] = useState<number | null>(null);

  function prev() {
    setIndex((i) => {
      if (i > 0) { setCropMode(false); setPostCropLoading(false); setPendingCropAspect(null); return i - 1; }
      return i;
    });
  }
  function next() {
    setIndex((i) => {
      if (i < images.length - 1) { setCropMode(false); setPostCropLoading(false); setPendingCropAspect(null); return i + 1; }
      return i;
    });
  }

  const swipeHandlers = useSwipeable({
    onSwiping: ({ deltaX, deltaY, dir }) => {
      if (dir === "Up" || dir === "Down") {
        // Resist downward swipes — only upward closes
        setDragDeltaY(dir === "Down" ? deltaY * 0.25 : deltaY);
      } else {
        // Resist at boundaries — dampen drag past the first/last image
        if ((index === 0 && dir === "Right") || (index === images.length - 1 && dir === "Left")) {
          setDragDeltaX(deltaX * 0.25);
        } else {
          setDragDeltaX(deltaX);
        }
      }
    },
    onSwipedLeft: ({ absX }) => {
      setDragDeltaX(0);
      if (absX >= SWIPE_THRESHOLD) next();
    },
    onSwipedRight: ({ absX }) => {
      setDragDeltaX(0);
      if (absX >= SWIPE_THRESHOLD) prev();
    },
    onSwipedUp: () => { setDragDeltaY(0); onClose(); },
    onSwipedDown: () => setDragDeltaY(0),
    onTouchEndOrOnMouseUp: () => {
      setDragDeltaX(0);
      setDragDeltaY(0);
    },
    trackMouse: false,
    trackTouch: true,
    delta: 10,
    preventScrollOnSwipe: true,
  });

  const image = images[index];
  const isCurrentThumbnail =
    !!currentThumbnailUrl && image.url === currentThumbnailUrl;

  return (
    <Modal
      open
      onClose={onClose}
      slotProps={{ backdrop: { sx: { backgroundColor: "rgba(0,0,0,0.92)" } } }}
    >
      <Box
        data-testid="lightbox-backdrop"
        onClick={cropMode ? undefined : onClose}
        sx={{
          position: "fixed",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          outline: "none",
        }}
      >
        {/* Swipe-up-to-close hint overlay */}
        {dragDeltaY < 0 && (
          <Box
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              pt: 2,
              gap: 0.5,
              opacity: Math.min(1, Math.abs(dragDeltaY) / 80),
              pointerEvents: "none",
              color: "white",
            }}
          >
            <ArrowUpwardIcon fontSize="small" />
            <Typography variant="caption" sx={{ letterSpacing: 1, textTransform: "uppercase" }}>
              drag to close
            </Typography>
          </Box>
        )}

        {/* Swipeable image area / crop editor */}
        {cropMode && image.cloudinary_public_id && image.cloud_name ? (
          <CropOverlay
            cloudinaryPublicId={image.cloudinary_public_id}
            cloudName={image.cloud_name}
            initialCrop={image.crop ?? null}
            onSave={async (crop) => {
              await onCropSave?.(image, crop);
              setPendingCropAspect(crop.width / crop.height);
              setPostCropLoading(true);
              setCropMode(false);
            }}
            onCancel={() => setCropMode(false)}
          />
        ) : (
          <Box
            {...swipeHandlers}
            data-testid="lightbox-swipe-area"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            sx={{ touchAction: "pan-y", cursor: images.length > 1 ? "grab" : undefined }}
          >
            <Box
              onClick={(e) => e.stopPropagation()}
              sx={{
                transform: `translate(${dragDeltaX}px, ${dragDeltaY}px)`,
                transition: dragDeltaX === 0 && dragDeltaY === 0 ? "transform 0.25s ease" : "none",
                width: "fit-content",
                position: "relative",
              }}
            >
              {postCropLoading && pendingCropAspect !== null && (
                <LightboxSkeleton aspectRatio={pendingCropAspect} />
              )}
              <Box
                sx={postCropLoading ? {
                  position: "absolute",
                  inset: 0,
                  opacity: 0,
                  pointerEvents: "none",
                } : undefined}
              >
                <Suspense
                  key={index}
                  fallback={<LightboxSkeleton crop={image.crop} />}
                >
                  <SuspendedLightboxImage
                    image={image}
                    onLoad={() => { setPostCropLoading(false); setPendingCropAspect(null); }}
                  />
                </Suspense>
              </Box>
            </Box>
          </Box>
        )}

        {!cropMode && footerActions && (
          <Box onClick={(e) => e.stopPropagation()} sx={{ alignSelf: "center" }}>
            {footerActions({
              index,
              onCrop: onCropSave && canEditImage?.(index) && image.image_id && image.cloudinary_public_id && image.cloud_name
                ? () => setCropMode(true)
                : undefined,
              cropAvailable: !!onCropSave,
              onSetAsThumbnail: onSetAsThumbnail ? () => onSetAsThumbnail(image) : undefined,
              isCurrentThumbnail,
            })}
          </Box>
        )}

        {/* Nav row — centered */}
        {!cropMode && images.length > 1 && (
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.5 }}
          >
            <IconButton
              onClick={prev}
              disabled={index === 0}
              size="small"
              sx={{ color: "white", display: { xs: "none", sm: "inline-flex" } }}
              aria-label="previous image"
            >
              ←
            </IconButton>
            <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
              {images.map((_, i) => (
                <Box
                  key={i}
                  onClick={() => setIndex(i)}
                  sx={{
                    width: i === index ? 10 : 7,
                    height: i === index ? 10 : 7,
                    borderRadius: "50%",
                    backgroundColor: i === index ? "white" : "rgba(255,255,255,0.35)",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    flexShrink: 0,
                  }}
                  role="button"
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </Box>
            <IconButton
              onClick={next}
              disabled={index === images.length - 1}
              size="small"
              sx={{ color: "white", display: { xs: "none", sm: "inline-flex" } }}
              aria-label="next image"
            >
              →
            </IconButton>
            <Typography
              variant="caption"
              sx={{ color: "rgba(255,255,255,0.5)", display: { xs: "none", sm: "block" }, ml: 0.5 }}
            >
              {index + 1} / {images.length}
            </Typography>
          </Box>
        )}
      </Box>
    </Modal>
  );
}

function LightboxSkeleton({
  crop,
  aspectRatio,
}: {
  crop?: ImageCrop | null;
  aspectRatio?: number | null;
}) {
  const aspect = aspectRatio ?? (crop ? crop.width / crop.height : 4 / 3);
  return (
    <Box
      sx={{
        aspectRatio: aspect,
        maxWidth: "90vw",
        maxHeight: "80vh",
        width: "90vw",
        borderRadius: "4px",
        bgcolor: "rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress sx={{ color: "white" }} />
    </Box>
  );
}

function SuspendedLightboxImage({
  image,
  onLoad,
}: {
  image: CaptionedImage;
  onLoad?: () => void;
}) {
  const url = getCloudinaryUrl({
    url: image.url,
    cloud_name: image.cloud_name,
    cloudinary_public_id: image.cloudinary_public_id,
    crop: image.crop,
    context: "lightbox",
  });

  useSuspendedImageLoad(url);

  return (
    <CloudinaryImage
      url={image.url}
      cloud_name={image.cloud_name}
      cloudinary_public_id={image.cloudinary_public_id}
      crop={image.crop}
      alt={image.caption || "Pottery image"}
      context="lightbox"
      onLoad={onLoad}
      style={{
        maxWidth: "90vw",
        maxHeight: "80vh",
        objectFit: "contain",
        borderRadius: 4,
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  );
}
