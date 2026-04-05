import { useEffect, useState } from 'react'
import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Grid,
    TextField,
    Typography,
} from '@mui/material'
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import { createPiece, createGlobalEntry, fetchGlobalEntries } from '../api'
import type { PieceDetail } from '../types'

export const DEFAULT_THUMBNAIL = '/thumbnails/question-mark.svg'

export const CURATED_THUMBNAILS = [
    DEFAULT_THUMBNAIL,
    '/thumbnails/bowl.svg',
    '/thumbnails/mug.svg',
    '/thumbnails/vase.svg',
    '/thumbnails/plate.svg',
    '/thumbnails/teapot.svg',
]

const MAX_NOTES_LENGTH = 300
const locationFilter = createFilterOptions<string>()
const CREATE_OPTION_PREFIX = 'Create "'
const CREATE_OPTION_SUFFIX = '"'

function buildCreateOptionValue(label: string): string {
    return `${CREATE_OPTION_PREFIX}${label}${CREATE_OPTION_SUFFIX}`
}

function parseCreateOptionValue(option: string): string | null {
    if (option.startsWith(CREATE_OPTION_PREFIX) && option.endsWith(CREATE_OPTION_SUFFIX)) {
        return option.slice(CREATE_OPTION_PREFIX.length, -CREATE_OPTION_SUFFIX.length)
    }
    return null
}

export interface NewPieceDialogProps {
    open: boolean
    onClose: () => void
    onCreated: (piece: PieceDetail) => void
}

export default function NewPieceDialog({ open, onClose, onCreated }: NewPieceDialogProps) {
    const [name, setName] = useState('')
    const [notes, setNotes] = useState('')
    const [selectedThumbnail, setSelectedThumbnail] = useState<string>(DEFAULT_THUMBNAIL)
    const [saving, setSaving] = useState(false)
    const [location, setLocation] = useState('')
    const [locationOptions, setLocationOptions] = useState<string[]>([])
    const [locationCreating, setLocationCreating] = useState(false)
    const [locationError, setLocationError] = useState<string | null>(null)
    const [confirmDiscard, setConfirmDiscard] = useState(false)

    function resetState() {
        setName('')
        setNotes('')
        setSelectedThumbnail(DEFAULT_THUMBNAIL)
        setLocation('')
        setLocationError(null)
        setSaving(false)
        setConfirmDiscard(false)
    }

    const isDirty = name.trim() !== '' || notes !== '' || selectedThumbnail !== DEFAULT_THUMBNAIL

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

    async function handleLocationSelection(option: string | null) {
        if (!option) {
            setLocation('')
            return
        }
        const createValue = parseCreateOptionValue(option)
        if (createValue) {
            setLocationCreating(true)
            setLocationError(null)
            try {
                const createdName = await createGlobalEntry('location', 'name', createValue)
                setLocationOptions((prev) => {
                    const merged = Array.from(new Set([...prev, createdName]))
                    merged.sort()
                    return merged
                })
                setLocation(createdName)
            } catch {
                setLocationError('Failed to create location. Please try again.')
            } finally {
                setLocationCreating(false)
            }
            return
        }
        setLocation(option)
    }

    useEffect(() => {
        fetchGlobalEntries('location')
            .then(setLocationOptions)
            .catch(() => {})
    }, [])

    async function handleSave() {
        if (!name.trim()) return
        setSaving(true)
        try {
            const piece = await createPiece({
                name: name.trim(),
                thumbnail: selectedThumbnail ?? '',
                notes: notes || undefined,
                current_location: location.trim() || undefined,
            })
            resetState()
            onClose()
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
                        slotProps={{ htmlInput: { 'data-testid': 'name-input' } }}
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
                        slotProps={{ htmlInput: { 'data-testid': 'notes-input' } }}
                        sx={{ mb: 2 }}
                    />
                    <Autocomplete
                        freeSolo
                        options={locationOptions}
                        inputValue={location}
                        onInputChange={(_e, value) => setLocation(value)}
                        onChange={(_e, value) => handleLocationSelection(value ?? null)}
                        filterOptions={(options, params) => {
                            const filtered = locationFilter(options, params)
                            const { inputValue } = params
                            const isExisting = options.some((opt) => inputValue === opt)
                            if (inputValue !== '' && !isExisting) {
                                filtered.push(buildCreateOptionValue(inputValue))
                            }
                            return filtered
                        }}
                        disabled={locationCreating}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Location"
                                fullWidth
                                sx={{ mb: 2 }}
                                helperText={locationError ?? ''}
                                error={Boolean(locationError)}
                            />
                        )}
                    />
                    <Typography variant="subtitle2" gutterBottom>
                        Thumbnail
                    </Typography>
                    <Grid container spacing={1}>
                        {CURATED_THUMBNAILS.map((url) => (
                            <Grid key={url} size={2}>
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
