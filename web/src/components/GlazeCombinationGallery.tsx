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
 * thumbnails. Hovering a thumbnail shows the piece name and state; clicking
 * navigates to /pieces/<id>.
 */
import { Link } from 'react-router-dom'
import {
    Box,
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
import { fetchGlazeCombinationImages } from '@common/api'
import type { GlazeCombinationImageEntry } from '@common/types'
import { formatState } from '@common/types'
import { useAsync } from '../util/useAsync'

const EMPTY_STATE_MESSAGE =
    'No images yet — add images to pieces that use a glaze combination to see them here.'

export default function GlazeCombinationGallery() {
    const { data: entries, loading, error } = useAsync<GlazeCombinationImageEntry[]>(
        fetchGlazeCombinationImages,
    )

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

    return (
        <Stack spacing={2}>
            {entries.map((entry) => {
                const { glaze_combination: combo, pieces } = entry
                return (
                    <Card key={combo.id} variant="outlined">
                        <CardHeader
                            avatar={
                                combo.test_tile_image ? (
                                    <CloudinaryImage
                                        url={combo.test_tile_image}
                                        context="thumbnail"
                                        alt={combo.name}
                                    />
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
                                                component={Link}
                                                to={`/pieces/${piece.id}`}
                                                sx={{
                                                    flexShrink: 0,
                                                    display: 'inline-flex',
                                                    textDecoration: 'none',
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
    )
}
