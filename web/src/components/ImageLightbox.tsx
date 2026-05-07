import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Modal,
  Typography,
} from "@mui/material";
import { useSwipeable } from "react-swipeable";
import type { CaptionedImage } from "../util/types";
import CloudinaryImage from "./CloudinaryImage";

const SWIPE_THRESHOLD = 50;

type ImageLightboxProps = {
  images: CaptionedImage[];
  initialIndex: number;
  onClose: () => void;
  currentThumbnailUrl?: string;
  onSetAsThumbnail?: (image: CaptionedImage) => Promise<void>;
  footerActions?: (index: number) => React.ReactNode;
};

export default function ImageLightbox({
  images,
  initialIndex,
  onClose,
  currentThumbnailUrl,
  onSetAsThumbnail,
  footerActions,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [settingThumbnail, setSettingThumbnail] = useState(false);

  function prev() {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }
  function next() {
    setIndex((i) => (i < images.length - 1 ? i + 1 : i));
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

  async function handleSetAsThumbnail(e: React.MouseEvent) {
    e.stopPropagation();
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
        {/* Swipeable image area */}
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

        {footerActions && (
          <Box onClick={(e) => e.stopPropagation()}>{footerActions(index)}</Box>
        )}
        {onSetAsThumbnail && (
          <Box onClick={(e) => e.stopPropagation()}>
            <Button
              size="small"
              variant="outlined"
              disabled={isCurrentThumbnail || settingThumbnail}
              onClick={handleSetAsThumbnail}
              startIcon={
                settingThumbnail ? (
                  <CircularProgress size={14} color="inherit" />
                ) : undefined
              }
              sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)" }}
            >
              {isCurrentThumbnail
                ? "Current thumbnail"
                : settingThumbnail
                  ? "Setting…"
                  : "Set as thumbnail"}
            </Button>
          </Box>
        )}

        {/* Navigation — arrows on non-touch, dots always when multiple images */}
        {images.length > 1 && (
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <IconButton
              onClick={prev}
              disabled={index === 0}
              sx={{
                color: "white",
                fontSize: "1.5rem",
                display: { xs: "none", sm: "inline-flex" },
              }}
              aria-label="previous image"
            >
              ←
            </IconButton>

            {/* Indicator dots */}
            <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
              {images.map((_, i) => (
                <Box
                  key={i}
                  onClick={() => setIndex(i)}
                  sx={{
                    width: i === index ? 10 : 7,
                    height: i === index ? 10 : 7,
                    borderRadius: "50%",
                    backgroundColor:
                      i === index
                        ? "white"
                        : "rgba(255,255,255,0.35)",
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
              sx={{
                color: "white",
                fontSize: "1.5rem",
                display: { xs: "none", sm: "inline-flex" },
              }}
              aria-label="next image"
            >
              →
            </IconButton>
          </Box>
        )}

        {/* Counter — non-touch only, alongside arrows */}
        {images.length > 1 && (
          <Typography
            variant="body2"
            sx={{
              color: "rgba(255,255,255,0.5)",
              mt: -1.5,
              display: { xs: "none", sm: "block" },
            }}
          >
            {index + 1} / {images.length}
          </Typography>
        )}
      </Box>
    </Modal>
  );
}
