import { useRef, useState } from 'react'
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Grid,
    Tab,
    Tabs,
    TextField,
    Typography,
} from '@mui/material'
import { ReactSketchCanvas } from 'react-sketch-canvas'
import type { ReactSketchCanvasRef } from 'react-sketch-canvas'
import { createPiece } from '../api'
import type { PieceDetail } from '../types'

export const CURATED_THUMBNAILS = [
    '/thumbnails/bowl.svg',
    '/thumbnails/mug.svg',
    '/thumbnails/vase.svg',
    '/thumbnails/plate.svg',
    '/thumbnails/teapot.svg',
]

const MAX_NOTES_LENGTH = 300

export interface NewPieceDialogProps {
    open: boolean
    onClose: () => void
    onCreated: (piece: PieceDetail) => void
}

export default function NewPieceDialog({ open, onClose, onCreated }: NewPieceDialogProps) {
    const [name, setName] = useState('')
    const [notes, setNotes] = useState('')
    const [thumbnailTab, setThumbnailTab] = useState(0)
    const [selectedThumbnail, setSelectedThumbnail] = useState<string | null>(null)
    const [canvasHasStrokes, setCanvasHasStrokes] = useState(false)
    const [saving, setSaving] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const canvasRef = useRef<ReactSketchCanvasRef>(null)

    const isDirty =
        name.trim() !== '' ||
        notes !== '' ||
        selectedThumbnail !== null ||
        canvasHasStrokes

    function resetState() {
        setName('')
        setNotes('')
        setThumbnailTab(0)
        setSelectedThumbnail(null)
        setCanvasHasStrokes(false)
        setSaving(false)
        setConfirmDiscard(false)
        canvasRef.current?.clearCanvas()
    }

    function handleAttemptClose() {
        if (isDirty) {
            setConfirmDiscard(true)
        } else {
            resetState()
            onClose()
        }
    }

    function handleConfirmDiscard() {
        resetState()
        onClose()
    }

    async function handleSave() {
        if (!name.trim()) return
        setSaving(true)
        try {
            let thumbnail = selectedThumbnail ?? ''
            if (thumbnailTab === 1 && canvasHasStrokes) {
                const svg = await canvasRef.current?.exportSvg()
                thumbnail = svg ?? ''
            }
            const piece = await createPiece({
                name: name.trim(),
                thumbnail,
                notes: notes || undefined,
            })
            resetState()
            onCreated(piece)
        } finally {
            setSaving(false)
        }
    }

    const nameIsInvalid = name !== '' && name.trim() === ''
    const canSave = name.trim() !== '' && !saving

    return (
        <>
            <Dialog open={open} onClose={handleAttemptClose} maxWidth="sm" fullWidth>
                <DialogTitle>New Piece</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        fullWidth
                        error={nameIsInvalid}
                        helperText={nameIsInvalid ? 'Name cannot be blank' : ''}
                        inputProps={{ 'data-testid': 'name-input' }}
                        sx={{ mt: 1, mb: 2 }}
                    />
                    <TextField
                        label="Notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES_LENGTH))}
                        multiline
                        rows={3}
                        fullWidth
                        helperText={`${notes.length} / ${MAX_NOTES_LENGTH}`}
                        inputProps={{ 'data-testid': 'notes-input' }}
                        sx={{ mb: 2 }}
                    />
                    <Typography variant="subtitle2" gutterBottom>
                        Thumbnail
                    </Typography>
                    <Tabs
                        value={thumbnailTab}
                        onChange={(_, v: number) => setThumbnailTab(v)}
                        sx={{ mb: 2 }}
                    >
                        <Tab label="Gallery" />
                        <Tab label="Draw" />
                    </Tabs>
                    {thumbnailTab === 0 && (
                        <Grid container spacing={1}>
                            {CURATED_THUMBNAILS.map((url) => (
                                <Grid key={url} size={2.4}>
                                    <Box
                                        component="img"
                                        src={url}
                                        alt={url.split('/').pop()?.replace('.svg', '') ?? url}
                                        onClick={() => setSelectedThumbnail(url)}
                                        sx={{
                                            width: '100%',
                                            aspectRatio: '1',
                                            cursor: 'pointer',
                                            border: selectedThumbnail === url
                                                ? '3px solid'
                                                : '3px solid transparent',
                                            borderColor: selectedThumbnail === url
                                                ? 'primary.main'
                                                : 'transparent',
                                            borderRadius: 1,
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    )}
                    {thumbnailTab === 1 && (
                        <Box>
                            <Box
                                sx={{
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 1,
                                    overflow: 'hidden',
                                }}
                            >
                                <ReactSketchCanvas
                                    ref={canvasRef}
                                    width="100%"
                                    height="200px"
                                    strokeColor="#333333"
                                    strokeWidth={3}
                                    canvasColor="#ffffff"
                                    onChange={(strokes) => setCanvasHasStrokes(strokes.length > 0)}
                                />
                            </Box>
                            <Button
                                size="small"
                                onClick={() => {
                                    canvasRef.current?.clearCanvas()
                                    setCanvasHasStrokes(false)
                                }}
                                sx={{ mt: 1 }}
                            >
                                Clear
                            </Button>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleAttemptClose}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={!canSave}
                        data-testid="save-button"
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)}>
                <DialogTitle>Discard new piece?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Your changes have not been saved. If you leave now, your new piece will not be
                        created.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
                    <Button onClick={handleConfirmDiscard} color="error" data-testid="discard-button">
                        Discard
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
