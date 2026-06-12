import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  IconButton,
  Typography,
  useTheme,
  useMediaQuery,
  Tooltip,
} from "@mui/material";
import type { ImageCrop } from "../util/types";
import AppImage from "./AppImage";
import { Masonry } from "masonic";

type PiecePhotoGalleryGridImage = {
  url: string;
  caption: string;
  cropped_url?: string | null;
  crop?: ImageCrop | null;
  stateLabel: string;
  editableCurrentStateIndex: number | null;
};

// Extends the image with pre-computed per-tile context so MasonryTile can be
// defined at module scope (stable reference) rather than inside the component.
// Masonic remounts all tiles when the render prop identity changes, which
// causes use-resize-observer to crash with a WeakMap error on unmount.
type MasonryTileData = PiecePhotoGalleryGridImage & {
  canDelete: boolean;
  isThumbnail: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

type PiecePhotoGalleryGridProps = {
  images: PiecePhotoGalleryGridImage[];
  canDeleteImages: boolean;
  canDeletePastImages?: boolean;
  currentThumbnailUrl?: string;
  onOpenImage: (index: number) => void;
  onRequestDelete: (index: number) => void;
};

function MasonryTile({
  data: image,
  index,
}: {
  data: MasonryTileData;
  index: number;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={image.onOpen}
        aria-label={`Open piece photo ${index + 1}`}
        sx={{
          p: 0,
          border: "none",
          width: "100%",
          background: "transparent",
          display: "block",
          lineHeight: 0,
          cursor: "pointer",
        }}
      >
        <Box sx={{ position: "relative", width: "100%" }}>
          <AppImage
            url={image.url}
            croppedUrl={image.cropped_url}
            crop={image.crop}
            alt={image.caption || "Piece photo"}
            context="gallery"
            style={{
              width: "100%",
              height: "auto",
              objectFit: "contain",
              display: "block",
            }}
          />
        </Box>
      </Box>
      {image.canDelete && (
        <Tooltip
          title={
            image.isThumbnail
              ? "Cannot delete the current piece thumbnail"
              : "Delete photo"
          }
        >
          <span>
            <IconButton
              aria-label={`Delete piece photo ${index + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                image.onDelete();
              }}
              disabled={image.isThumbnail}
              size="small"
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                color: "common.white",
                backgroundColor: image.isThumbnail
                  ? "rgba(0,0,0,0.24)"
                  : "rgba(0,0,0,0.52)",
                backdropFilter: "blur(6px)",
                "&:hover": {
                  backgroundColor: image.isThumbnail
                    ? "rgba(0,0,0,0.24)"
                    : "rgba(0,0,0,0.68)",
                },
                "&.Mui-disabled": {
                  color: "rgba(255,255,255,0.45)",
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}

export default function PiecePhotoGalleryGrid({
  images,
  canDeleteImages,
  canDeletePastImages = false,
  currentThumbnailUrl,
  onOpenImage,
  onRequestDelete,
}: PiecePhotoGalleryGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  if (images.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        No images for this piece yet.
      </Typography>
    );
  }

  const tileData: MasonryTileData[] = images.map((image, idx) => ({
    ...image,
    canDelete:
      image.editableCurrentStateIndex !== null
        ? canDeleteImages
        : canDeletePastImages,
    isThumbnail: image.url === currentThumbnailUrl,
    onOpen: () => onOpenImage(idx),
    onDelete: () => onRequestDelete(idx),
  }));

  return (
    <Masonry
      items={tileData}
      render={MasonryTile}
      columnCount={isMobile ? 2 : 3}
      columnGutter={6}
      rowGutter={6}
    />
  );
}
