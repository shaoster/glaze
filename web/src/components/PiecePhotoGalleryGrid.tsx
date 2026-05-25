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
import CloudinaryImage from "./CloudinaryImage";
import { Masonry } from "masonic";

type PiecePhotoGalleryGridImage = {
  url: string;
  caption: string;
  cloudinary_public_id?: string | null;
  cloud_name?: string | null;
  crop?: ImageCrop | null;
  stateLabel: string;
  editableCurrentStateIndex: number | null;
};

type PiecePhotoGalleryGridProps = {
  images: PiecePhotoGalleryGridImage[];
  canDeleteImages: boolean;
  currentThumbnailUrl?: string;
  onOpenImage: (index: number) => void;
  onRequestDelete: (index: number) => void;
};

export default function PiecePhotoGalleryGrid({
  images,
  canDeleteImages,
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

  const MasonryTile = ({
    data: image,
    index,
    width,
  }: {
    data: PiecePhotoGalleryGridImage;
    index: number;
    width: number;
  }) => {
    const isThumbnail = image.url === currentThumbnailUrl;

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
          onClick={() => onOpenImage(index)}
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
            <CloudinaryImage
              url={image.url}
              cloud_name={image.cloud_name}
              cloudinary_public_id={image.cloudinary_public_id}
              crop={image.crop}
              alt={image.caption || "Piece photo"}
              context="gallery"
              requestedWidth={Math.round(
                width * (globalThis.window?.devicePixelRatio ?? 1),
              )}
              style={{
                width: "100%",
                height: "auto",
                objectFit: "contain",
                display: "block",
              }}
            />
          </Box>
        </Box>
        {image.editableCurrentStateIndex !== null && canDeleteImages && (
          <Tooltip
            title={
              isThumbnail
                ? "Cannot delete the current piece thumbnail"
                : "Delete photo"
            }
          >
            <span>
              <IconButton
                aria-label={`Delete piece photo ${index + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(index);
                }}
                disabled={isThumbnail}
                size="small"
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 28,
                  height: 28,
                  color: "common.white",
                  backgroundColor: isThumbnail
                    ? "rgba(0,0,0,0.24)"
                    : "rgba(0,0,0,0.52)",
                  backdropFilter: "blur(6px)",
                  "&:hover": {
                    backgroundColor: isThumbnail
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
  };

  return (
    <Masonry
      items={images}
      render={MasonryTile}
      columnCount={isMobile ? 2 : 3}
      columnGutter={6}
      rowGutter={6}
    />
  );
}
