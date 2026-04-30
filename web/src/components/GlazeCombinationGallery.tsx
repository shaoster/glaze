/**
 * GlazeCombinationGallery — Analyze tab view.
 *
 * Shows one card per glaze combination the user has applied to at least one
 * piece with images recorded in a qualifying state (glazed, glaze_fired, or
 * completed). Pieces appear sorted by most-recently-modified; combinations
 * appear sorted by the most-recently-modified qualifying piece.
 *
 * Each card header shows the combination name, a test-tile thumbnail if
 * available, and a chip for each constituent glaze type.
 * The card body is a horizontally scrollable row of CloudinaryImage
 * thumbnails. Clicking any thumbnail opens an ImageLightbox that shows all
 * images for the combination across every piece; the footer "Go to the Piece"
 * button reflects whichever piece owns the currently-displayed image.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloudinaryImage from "./CloudinaryImage";
import ImageLightbox from "./ImageLightbox";
import { fetchGlazeCombinationImages } from "../util/api";
import type {
  CaptionedImage,
  GlazeCombinationEntry,
  GlazeCombinationImageEntry,
} from "../util/types";
import { formatState } from "../util/types";
import { useAsync } from "../util/useAsync";

const EMPTY_STATE_MESSAGE =
  "No images yet — add images to pieces that use a glaze combination to see them here.";

type PieceEntry = GlazeCombinationImageEntry["pieces"][number];

// A CaptionedImage tagged with the piece it came from.
interface GalleryImage extends CaptionedImage {
  pieceId: string;
  pieceName: string;
  pieceState: string;
}

type LightboxState =
  | { kind: "tile"; images: CaptionedImage[]; initialIndex: 0 }
  | { kind: "piece"; images: GalleryImage[]; initialIndex: number };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TileAvatarButtonProps {
  url: string;
  name: string;
  onClick: (url: string, name: string) => void;
}

function TileAvatarButton({ url, name, onClick }: TileAvatarButtonProps) {
  return (
    <Box
      component="button"
      onClick={() => onClick(url, name)}
      sx={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
      }}
      aria-label={`View test tile for ${name}`}
    >
      <CloudinaryImage url={url} context="thumbnail" alt={name} />
    </Box>
  );
}

interface PieceImageButtonProps {
  img: CaptionedImage;
  label: string;
  onClick: () => void;
}

function PieceImageButton({ img, label, onClick }: PieceImageButtonProps) {
  return (
    <Tooltip title={label} placement="top">
      <Box
        component="button"
        onClick={onClick}
        sx={{
          flexShrink: 0,
          display: "inline-flex",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
        }}
        aria-label={label}
      >
        <CloudinaryImage
          url={img.url}
          cloudinary_public_id={img.cloudinary_public_id}
          alt={label}
          context="preview"
        />
      </Box>
    </Tooltip>
  );
}

interface ComboCardProps {
  combo: GlazeCombinationEntry;
  pieces: PieceEntry[];
  onTileClick: (url: string, name: string) => void;
  onPieceImageClick: (images: GalleryImage[], idx: number) => void;
}

function ComboCard({
  combo,
  pieces,
  onTileClick,
  onPieceImageClick,
}: ComboCardProps) {
  const galleryImages: GalleryImage[] = pieces.flatMap((piece) =>
    piece.images.map((img) => ({
      ...img,
      pieceId: piece.id,
      pieceName: piece.name,
      pieceState: piece.state,
    })),
  );

  return (
    <Card variant="outlined">
      <CardHeader
        avatar={
          combo.test_tile_image?.url ? (
            <TileAvatarButton
              url={combo.test_tile_image.url}
              name={combo.name ?? ""}
              onClick={onTileClick}
            />
          ) : null
        }
        title={
          <Typography variant="subtitle1" fontWeight="bold">
            {combo.name}
          </Typography>
        }
        subheader={
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            {combo.glaze_types.map((gt) => (
              <Chip
                key={gt.id}
                label={gt.name}
                size="small"
                variant="outlined"
              />
            ))}
          </Box>
        }
      />
      <CardContent sx={{ pt: 0 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            overflowX: "auto",
            gap: 1,
            pb: 1,
          }}
        >
          {galleryImages.map((gi, idx) => (
            <PieceImageButton
              key={`${gi.pieceId}-${idx}`}
              img={gi}
              label={`${gi.pieceName} — ${formatState(gi.pieceState)}`}
              onClick={() => onPieceImageClick(galleryImages, idx)}
            />
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function GlazeCombinationGallery() {
  const {
    data: entries,
    loading,
    error,
  } = useAsync<GlazeCombinationImageEntry[]>(fetchGlazeCombinationImages);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const navigate = useNavigate();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Typography color="error">
        Failed to load glaze combination gallery.
      </Typography>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        {EMPTY_STATE_MESSAGE}
      </Typography>
    );
  }

  function handleTileClick(url: string, name: string) {
    setLightbox({
      kind: "tile",
      initialIndex: 0,
      images: [
        { url, caption: name, created: new Date(), cloudinary_public_id: null },
      ],
    });
  }

  function handlePieceImageClick(images: GalleryImage[], idx: number) {
    setLightbox({ kind: "piece", images, initialIndex: idx });
  }

  return (
    <>
      <Stack spacing={2}>
        {entries.map(({ glaze_combination: combo, pieces }) => (
          <ComboCard
            key={combo.id}
            combo={combo}
            pieces={pieces}
            onTileClick={handleTileClick}
            onPieceImageClick={handlePieceImageClick}
          />
        ))}
      </Stack>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.initialIndex}
          onClose={() => setLightbox(null)}
          footerActions={
            lightbox.kind === "piece"
              ? (i) => (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      navigate(`/pieces/${lightbox.images[i].pieceId}`, {
                        state: { fromGallery: true },
                      })
                    }
                    sx={{
                      color: "white",
                      borderColor: "rgba(255,255,255,0.5)",
                    }}
                  >
                    Go to the Piece
                  </Button>
                )
              : undefined
          }
        />
      )}
    </>
  );
}
