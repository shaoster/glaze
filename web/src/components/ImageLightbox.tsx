import React, { useState } from "react";
import {
  Box,
  IconButton,
  Modal,
  Typography,
} from "@mui/material";
import { useSwipeable } from "react-swipeable";
import type { CaptionedImage, ImageCrop } from "../util/types";
import CloudinaryImage from "./CloudinaryImage";
import CropOverlay from "./CropOverlay";

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
    onSetAsThumbnail?: () => Promise<void>;
    settingThumbnail: boolean;
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
  const [settingThumbnail, setSettingThumbnail] = useState(false);
  const [cropMode, setCropMode] = useState(false);

  function prev() {
    setIndex((i) => {
      if (i > 0) { setCropMode(false); return i - 1; }
      return i;
    });
  }
  function next() {
    setIndex((i) => {
      if (i < images.length - 1) { setCropMode(false); return i + 1; }
      return i;
    });
  }

  const swipeHandlers = useSwipeable({
    onSwiping: ({ deltaX, dir }) => {
      // Resist at boundaries — dampen drag past the first/last image
      if ((index === 0 && dir === "Right") || (index === images.length - 1 && dir === "Left")) {
        setDragDeltaX(deltaX * 0.25);
      } else {
        setDragDeltaX(deltaX);
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
    onTouchEndOrOnMouseUp: () => {
      setDragDeltaX(0);
    },
    trackMouse: false,
    trackTouch: true,
    delta: 10,
    preventScrollOnSwipe: true,
  });

  const image = images[index];
  const isCurrentThumbnail =
    !!currentThumbnailUrl && image.url === currentThumbnailUrl;

  async function handleSetAsThumbnail() {
    if (!onSetAsThumbnail) return;
    setSettingThumbnail(true);
    try {
      await onSetAsThumbnail(image);
    } finally {
      setSettingThumbnail(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      slotProps={{ backdrop: { sx: { backgroundColor: "rgba(0,0,0,0.92)" } } }}
    >
      <Box
        data-testid="lightbox-backdrop"
        onClick={onClose}
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
        {/* Swipeable image area / crop editor */}
        {cropMode && image.cloudinary_public_id && image.cloud_name ? (
          <CropOverlay
            cloudinaryPublicId={image.cloudinary_public_id}
            cloudName={image.cloud_name}
            initialCrop={image.crop ?? null}
            onSave={async (crop) => {
              await onCropSave?.(image, crop);
              setCropMode(false);
            }}
            onCancel={() => setCropMode(false)}
          />
        ) : (
          <Box
            {...swipeHandlers}
            data-testid="lightbox-swipe-area"
            onClick={(e) => e.stopPropagation()}
            sx={{ touchAction: "pan-y", cursor: images.length > 1 ? "grab" : undefined }}
          >
            <Box
              sx={{
                transform: `translateX(${dragDeltaX}px)`,
                transition: dragDeltaX === 0 ? "transform 0.25s ease" : "none",
              }}
            >
              <CloudinaryImage
                url={image.url}
                cloud_name={image.cloud_name}
                cloudinary_public_id={image.cloudinary_public_id}
                crop={image.crop}
                alt={image.caption || "Pottery image"}
                context="lightbox"
                style={{
                  maxWidth: "90vw",
                  maxHeight: "80vh",
                  objectFit: "contain",
                  borderRadius: 4,
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              />
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
              onSetAsThumbnail: onSetAsThumbnail ? handleSetAsThumbnail : undefined,
              settingThumbnail,
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
