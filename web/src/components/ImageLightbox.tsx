import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  IconButton,
  Modal,
  Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useSwipeable } from "react-swipeable";
import type { CaptionedImage, ImageCrop } from "../util/types";
import { SuspenseAppImage } from "./AppImage";
import CropOverlay from "./CropOverlay";

const SWIPE_THRESHOLD = 50;

type ImageLightboxProps = {
  images: CaptionedImage[];
  initialIndex: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
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
  onIndexChange,
  currentThumbnailUrl,
  onSetAsThumbnail,
  onCropSave,
  canEditImage,
  footerActions,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  // Notify caller when index changes due to user navigation (swipe, arrow,
  // thumbnail). Suppressed when the index already matches the URL-driven
  // initialIndex so we don't write a duplicate history entry for an
  // already-current URL. Refs are updated in effects (never during render);
  // the ref-sync effects are declared first so they run before the notify
  // effect within the same commit.
  const onIndexChangeRef = useRef(onIndexChange);
  useEffect(() => {
    onIndexChangeRef.current = onIndexChange;
  });
  const initialIndexRef = useRef(initialIndex);
  useEffect(() => {
    initialIndexRef.current = initialIndex;
  });
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (index === initialIndexRef.current) return;
    onIndexChangeRef.current?.(index);
  }, [index]);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [cropMode, setCropMode] = useState(false);
  const [pendingSaveCrop, setPendingSaveCrop] = useState<ImageCrop | null>(null);

  const image = images[index];

  useEffect(() => {
    setPendingSaveCrop(null);
  }, [image.image_id]);

  const [prevInitialIndex, setPrevInitialIndex] = useState(initialIndex);

  // Sync to URL-driven index changes (e.g. browser Back while lightbox is
  // open). The notify effect skips this update because the resulting index
  // equals the URL's initialIndex.
  if (initialIndex !== prevInitialIndex) {
    setPrevInitialIndex(initialIndex);
    setIndex(initialIndex);
  }
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

        {cropMode ? (
          <CropOverlay
            url={image.url}
            initialCrop={image.crop ?? null}
            onSave={async (crop) => {
              setCropMode(false);
              setPendingSaveCrop(crop);
              try {
                await onCropSave?.(image, crop);
              } finally {
                setPendingSaveCrop(null);
              }
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
              <SuspenseAppImage
                key={index}
                url={image.url}
                croppedUrl={pendingSaveCrop ? null : image.cropped_url}
                crop={pendingSaveCrop ?? image.crop}
                r2Key={image.r2_key}
                cropTaskFailed={image.crop_task_failed}
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
              onCrop: onCropSave && canEditImage?.(index) && image.image_id
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

