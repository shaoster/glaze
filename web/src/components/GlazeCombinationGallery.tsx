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
 * The card body is a horizontally scrollable row of AppImage
 * thumbnails. Clicking any thumbnail opens an ImageLightbox that shows all
 * images for the combination across every piece; the footer "Go to the Piece"
 * button reflects whichever piece owns the currently-displayed image.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCombinationGalleryRouting, type GalleryImage } from "../routing/galleryRouting";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import AppImage from "./AppImage";
import ImageLightbox from "./ImageLightbox";
import { useSuspenseQuery } from "@tanstack/react-query";
import { fetchGlazeCombinationImages } from "../util/api";
import type {
  CaptionedImage,
  GlazeCombinationEntry,
  GlazeCombinationImageEntry,
} from "../util/types";
import { formatState } from "../util/workflow";
import { GLAZE_COMBINATION_IMAGES_QUERY_KEY } from "../util/queryKeys";

const EMPTY_STATE_MESSAGE =
  "No images yet — add images to pieces that use a glaze combination to see them here.";

type PieceEntry = GlazeCombinationImageEntry["pieces"][number];

// GalleryImage is defined in galleryRouting — imported above.

type LightboxState =
  | { kind: "tile"; images: CaptionedImage[]; initialIndex: 0 }
  | { kind: "piece"; images: GalleryImage[]; initialIndex: number };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TileAvatarButtonProps {
  image: NonNullable<GlazeCombinationEntry["test_tile_image"]>;
  name: string;
  onClick: (
    image: NonNullable<GlazeCombinationEntry["test_tile_image"]>,
    name: string,
  ) => void;
}

function TileAvatarButton({ image, name, onClick }: TileAvatarButtonProps) {
  return (
    <Box
      component="button"
      onClick={() => onClick(image, name)}
      sx={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        display: "inline-flex",
      }}
      aria-label={`View test tile for ${name}`}
    >
      <AppImage url={image.url} context="thumbnail" alt={name} />
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
        <AppImage
          url={img.url}
          croppedUrl={img.cropped_url}
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
  onTileClick: (
    image: NonNullable<GlazeCombinationEntry["test_tile_image"]>,
    name: string,
  ) => void;
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
              image={combo.test_tile_image}
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
  const { data: entries } = useSuspenseQuery<GlazeCombinationImageEntry[]>({
    queryKey: GLAZE_COMBINATION_IMAGES_QUERY_KEY,
    queryFn: fetchGlazeCombinationImages,
  });
  // Tile lightboxes are local (ephemeral, not shareable).
  const [tileBox, setTileBox] = useState<LightboxState | null>(null);
  const navigate = useNavigate();
  const {
    pieceLightbox,
    onPieceImageClick,
    onPieceLightboxIndexChange,
    onClosePieceLightbox,
  } = useCombinationGalleryRouting(entries);
  const lightbox = pieceLightbox ?? tileBox;

  if (entries.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
        {EMPTY_STATE_MESSAGE}
      </Typography>
    );
  }

  function handleTileClick(
    image: NonNullable<GlazeCombinationEntry["test_tile_image"]>,
    name: string,
  ) {
    setTileBox({
      kind: "tile",
      initialIndex: 0,
      images: [
        {
          url: image.url,
          caption: name,
          created: new Date(),
          cropped_url: null,
          r2_key: image.r2_key ?? null,
          crop_task_failed: false,
        },
      ],
    });
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
            onPieceImageClick={(_images, idx) =>
              onPieceImageClick(combo.id, idx)
            }
          />
        ))}
      </Stack>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.initialIndex}
          onIndexChange={pieceLightbox ? onPieceLightboxIndexChange : undefined}
          onClose={() => {
            if (pieceLightbox) {
              onClosePieceLightbox();
            } else {
              setTileBox(null);
            }
          }}
          footerActions={
            lightbox.kind === "piece"
              ? ({ index }) => {
                  const img = lightbox.images[index] as GalleryImage;
                  return (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      navigate(`/pieces/${img.pieceId}`, {
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
                  );
                }
              : undefined
          }
        />
      )}
    </>
  );
}
