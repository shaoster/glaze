import CloseIcon from "@mui/icons-material/Close";
import { Box, IconButton, Typography } from "@mui/material";
import CloudinaryImage from "./CloudinaryImage";

type PiecePhotoGalleryGridImage = {
  url: string;
  caption: string;
  cloudinary_public_id?: string | null;
  cloud_name?: string | null;
  stateLabel: string;
  editableCurrentStateIndex: number | null;
};

type PiecePhotoGalleryGridProps = {
  images: PiecePhotoGalleryGridImage[];
  requestedWidth: number;
  requestedHeight: number;
  canDeleteImages: boolean;
  onOpenImage: (index: number) => void;
  onRequestDelete: (index: number) => void;
};

export default function PiecePhotoGalleryGrid({
  images,
  requestedWidth,
  requestedHeight,
  canDeleteImages,
  onOpenImage,
  onRequestDelete,
}: PiecePhotoGalleryGridProps) {
  if (images.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        No images for this piece yet.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(3, minmax(0, 1fr))",
        },
        gap: 1.25,
      }}
    >
      {images.map((image, index) => (
        <Box
          key={`${image.url}-${index}`}
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
            <Box sx={{ position: "relative", aspectRatio: "5 / 4" }}>
              <CloudinaryImage
                url={image.url}
                cloud_name={image.cloud_name}
                cloudinary_public_id={image.cloudinary_public_id}
                alt={image.caption || "Piece photo"}
                context="gallery"
                requestedWidth={requestedWidth}
                requestedHeight={requestedHeight}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            </Box>
          </Box>
          {image.editableCurrentStateIndex !== null && canDeleteImages && (
            <IconButton
              aria-label={`Delete piece photo ${index + 1}`}
              onClick={() => onRequestDelete(index)}
              size="small"
              sx={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                color: "common.white",
                backgroundColor: "rgba(0,0,0,0.52)",
                backdropFilter: "blur(6px)",
                "&:hover": {
                  backgroundColor: "rgba(0,0,0,0.68)",
                },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
  );
}
