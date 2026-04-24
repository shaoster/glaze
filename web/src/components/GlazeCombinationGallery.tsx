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
 * thumbnails. Clicking any thumbnail opens an ImageLightbox; piece thumbnails
 * include a "Go to the Piece" button in the lightbox footer.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from '@mui/material'
import CloudinaryImage from './CloudinaryImage'
import ImageLightbox from './ImageLightbox'
import { fetchGlazeCombinationImages } from '@common/api'
import type { CaptionedImage, GlazeCombinationEntry, GlazeCombinationImageEntry } from '@common/types'
import { formatState } from '@common/types'
import { useAsync } from '../util/useAsync'

const EMPTY_STATE_MESSAGE =
    'No images yet — add images to pieces that use a glaze combination to see them here.'

type PieceEntry = GlazeCombinationImageEntry['pieces'][number]

type LightboxState =
    | { kind: 'tile'; images: CaptionedImage[]; initialIndex: 0 }
    | { kind: 'piece'; images: CaptionedImage[]; initialIndex: number; pieceId: string }

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TileAvatarButtonProps {
    url: string
    name: string
    onClick: (url: string, name: string) => void
}

function TileAvatarButton({ url, name, onClick }: TileAvatarButtonProps) {
    return (
        <Box
            component="button"
            onClick={() => onClick(url, name)}
            sx={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex' }}
            aria-label={`View test tile for ${name}`}
        >
            <CloudinaryImage url={url} context="thumbnail" alt={name} />
        </Box>
    )
}

interface PieceImageButtonProps {
    piece: PieceEntry
    img: CaptionedImage
    imgIdx: number
    onClick: (piece: PieceEntry, imgIdx: number) => void
}

function PieceImageButton({ piece, img, imgIdx, onClick }: PieceImageButtonProps) {
    return (
        <Tooltip title={`${piece.name} — ${formatState(piece.state)}`} placement="top">
            <Box
                component="button"
                onClick={() => onClick(piece, imgIdx)}
                sx={{ flexShrink: 0, display: 'inline-flex', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                aria-label={`${piece.name} — ${formatState(piece.state)}`}
            >
                <CloudinaryImage
                    url={img.url}
                    cloudinary_public_id={img.cloudinary_public_id}
                    alt={`${piece.name} — ${formatState(piece.state)}`}
                    context="preview"
                />
            </Box>
        </Tooltip>
    )
}

interface ComboCardProps {
    combo: GlazeCombinationEntry
    pieces: PieceEntry[]
    onTileClick: (url: string, name: string) => void
    onPieceImageClick: (piece: PieceEntry, imgIdx: number) => void
}

function ComboCard({ combo, pieces, onTileClick, onPieceImageClick }: ComboCardProps) {
    return (
        <Card variant="outlined">
            <CardHeader
                avatar={combo.test_tile_image
                    ? <TileAvatarButton url={combo.test_tile_image} name={combo.name ?? ''} onClick={onTileClick} />
                    : null}
                title={<Typography variant="subtitle1" fontWeight="bold">{combo.name}</Typography>}
                subheader={
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                        {combo.glaze_types.map((gt) => (
                            <Chip key={gt.id} label={gt.name} size="small" variant="outlined" />
                        ))}
                    </Box>
                }
            />
            <CardContent sx={{ pt: 0 }}>
                <Box sx={{ display: 'flex', flexDirection: 'row', overflowX: 'auto', gap: 1, pb: 1 }}>
                    {pieces.map((piece) =>
                        piece.images.map((img, imgIdx) => (
                            <PieceImageButton
                                key={`${piece.id}-${imgIdx}`}
                                piece={piece}
                                img={img}
                                imgIdx={imgIdx}
                                onClick={onPieceImageClick}
                            />
                        ))
                    )}
                </Box>
            </CardContent>
        </Card>
    )
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export default function GlazeCombinationGallery() {
    const { data: entries, loading, error } = useAsync<GlazeCombinationImageEntry[]>(
        fetchGlazeCombinationImages,
    )
    const [lightbox, setLightbox] = useState<LightboxState | null>(null)
    const navigate = useNavigate()

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
            </Box>
        )
    }

    if (error) {
        return <Typography color="error">Failed to load glaze combination gallery.</Typography>
    }

    if (!entries || entries.length === 0) {
        return (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                {EMPTY_STATE_MESSAGE}
            </Typography>
        )
    }

    function handleTileClick(url: string, name: string) {
        setLightbox({
            kind: 'tile',
            initialIndex: 0,
            images: [{ url, caption: name, created: new Date(), cloudinary_public_id: null }],
        })
    }

    function handlePieceImageClick(piece: PieceEntry, imgIdx: number) {
        setLightbox({ kind: 'piece', images: piece.images, initialIndex: imgIdx, pieceId: piece.id })
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
                        lightbox.kind === 'piece' ? (
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={() => navigate(`/pieces/${lightbox.pieceId}`, { state: { fromGallery: true } })}
                                sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
                            >
                                Go to the Piece
                            </Button>
                        ) : undefined
                    }
                />
            )}
        </>
    )
}
