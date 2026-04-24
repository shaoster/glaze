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
 * thumbnails. Clicking a thumbnail opens a lightbox; piece thumbnails include
 * a "Go to the Piece" button in the lightbox footer.
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
import type { CaptionedImage, GlazeCombinationImageEntry } from '@common/types'
import { formatState } from '@common/types'
import { useAsync } from '../util/useAsync'

const EMPTY_STATE_MESSAGE =
    'No images yet — add images to pieces that use a glaze combination to see them here.'

type LightboxState =
    | { kind: 'tile'; images: CaptionedImage[]; initialIndex: 0 }
    | { kind: 'piece'; images: CaptionedImage[]; initialIndex: number; pieceId: string; pieceName: string }

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

    function openTileLightbox(url: string, name: string) {
        setLightbox({
            kind: 'tile',
            initialIndex: 0,
            images: [{ url, caption: name, created: new Date(), cloudinary_public_id: null }],
        })
    }

    function openPieceLightbox(
        images: CaptionedImage[],
        imgIdx: number,
        pieceId: string,
        pieceName: string,
    ) {
        setLightbox({ kind: 'piece', images, initialIndex: imgIdx, pieceId, pieceName })
    }

    return (
        <>
            <Stack spacing={2}>
                {entries.map((entry) => {
                    const { glaze_combination: combo, pieces } = entry
                    const testTileImage = combo.test_tile_image
                    return (
                        <Card key={combo.id} variant="outlined">
                            <CardHeader
                                avatar={
                                    testTileImage ? (
                                        <Box
                                            component="button"
                                            onClick={() => openTileLightbox(testTileImage, combo.name)}
                                            sx={{
                                                background: 'none',
                                                border: 'none',
                                                padding: 0,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                            }}
                                            aria-label={`View test tile for ${combo.name}`}
                                        >
                                            <CloudinaryImage
                                                url={testTileImage}
                                                context="thumbnail"
                                                alt={combo.name}
                                            />
                                        </Box>
                                    ) : null
                                }
                                title={
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        {combo.name}
                                    </Typography>
                                }
                                subheader={
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
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
                                        display: 'flex',
                                        flexDirection: 'row',
                                        overflowX: 'auto',
                                        gap: 1,
                                        pb: 1,
                                    }}
                                >
                                    {pieces.map((piece) =>
                                        piece.images.map((img, imgIdx) => (
                                            <Tooltip
                                                key={`${piece.id}-${imgIdx}`}
                                                title={`${piece.name} — ${formatState(piece.state)}`}
                                                placement="top"
                                            >
                                                <Box
                                                    component="button"
                                                    onClick={() =>
                                                        openPieceLightbox(
                                                            piece.images,
                                                            imgIdx,
                                                            piece.id,
                                                            piece.name,
                                                        )
                                                    }
                                                    sx={{
                                                        flexShrink: 0,
                                                        display: 'inline-flex',
                                                        background: 'none',
                                                        border: 'none',
                                                        padding: 0,
                                                        cursor: 'pointer',
                                                    }}
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
                                        ))
                                    )}
                                </Box>
                            </CardContent>
                        </Card>
                    )
                })}
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
                                onClick={() =>
                                    navigate(`/pieces/${lightbox.pieceId}`, {
                                        state: { fromGallery: true },
                                    })
                                }
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
