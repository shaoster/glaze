/**
 * Routing hook for /analyze/glaze-combinations?combo=<id>&image=<idx>.
 *
 * Piece lightboxes are derived from URL so browser back/forward and direct
 * links stay in sync. Tile lightboxes (local, ephemeral) are not routed.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { CaptionedImage, GlazeCombinationImageEntry } from "../util/types";

export interface GalleryImage extends CaptionedImage {
  pieceId: string;
  pieceName: string;
  pieceState: string;
}

export interface PieceLightboxState {
  kind: "piece";
  images: GalleryImage[];
  initialIndex: number;
}

export interface CombinationGalleryRouting {
  pieceLightbox: PieceLightboxState | null;
  onPieceImageClick: (comboId: string, idx: number) => void;
  onPieceLightboxIndexChange: (idx: number) => void;
  onClosePieceLightbox: () => void;
}

export function useCombinationGalleryRouting(
  entries: GlazeCombinationImageEntry[],
): CombinationGalleryRouting {
  const [searchParams, setSearchParams] = useSearchParams();

  const pieceLightbox = useMemo<PieceLightboxState | null>(() => {
    const comboParam = searchParams.get("combo");
    const imageParam = searchParams.get("image");
    if (!comboParam || imageParam === null) return null;
    const idx = parseInt(imageParam, 10);
    if (isNaN(idx) || idx < 0) return null;
    const entry = entries.find((e) => e.glaze_combination.id === comboParam);
    if (!entry) return null;
    const images: GalleryImage[] = entry.pieces.flatMap((piece) =>
      piece.images.map((img) => ({
        ...img,
        pieceId: piece.id,
        pieceName: piece.name,
        pieceState: piece.state,
      })),
    );
    if (idx >= images.length) return null;
    return { kind: "piece", images, initialIndex: idx };
  }, [searchParams, entries]);

  const comboParam = searchParams.get("combo");

  return {
    pieceLightbox,
    onPieceImageClick: (comboId, idx) =>
      setSearchParams({ combo: comboId, image: String(idx) }),
    onPieceLightboxIndexChange: (idx) => {
      if (comboParam) setSearchParams({ combo: comboParam, image: String(idx) });
    },
    onClosePieceLightbox: () => setSearchParams({}),
  };
}
