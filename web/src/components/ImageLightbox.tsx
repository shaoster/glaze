import React, { useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Modal,
  Typography,
} from "@mui/material";
import type { CaptionedImage } from "../util/types";
import CloudinaryImage from "./CloudinaryImage";

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
  const [settingThumbnail, setSettingThumbnail] = useState(false);
  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const touchStartX = useRef<number | null>(null);

  function prev() {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }
  function next() {
    setIndex((i) => (i < images.length - 1 ? i + 1 : i));
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta > 50) prev();
    else if (delta < -50) next();
    touchStartX.current = null;
  }

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
        onClick={onClose}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
        <CloudinaryImage
          url={image.url}
          cloudinary_public_id={image.cloudinary_public_id}
          alt={image.caption || "Pottery image"}
          context="lightbox"
          style={{
            maxWidth: "90vw",
            maxHeight: "80vh",
            objectFit: "contain",
            borderRadius: 4,
            userSelect: "none",
          }}
        />
        {image.caption && (
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.8)" }}>
            {image.caption}
          </Typography>
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
        {footerActions && (
          <Box onClick={(e) => e.stopPropagation()}>{footerActions(index)}</Box>
        )}
        {!isTouchDevice && images.length > 1 && (
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{ display: "flex", gap: 2 }}
          >
            <IconButton
              onClick={prev}
              disabled={index === 0}
              sx={{ color: "white", fontSize: "1.5rem" }}
              aria-label="previous image"
            >
              ←
            </IconButton>
            <Typography
              variant="body2"
              sx={{ color: "rgba(255,255,255,0.6)", alignSelf: "center" }}
            >
              {index + 1} / {images.length}
            </Typography>
            <IconButton
              onClick={next}
              disabled={index === images.length - 1}
              sx={{ color: "white", fontSize: "1.5rem" }}
              aria-label="next image"
            >
              →
            </IconButton>
          </Box>
        )}
      </Box>
    </Modal>
  );
}
