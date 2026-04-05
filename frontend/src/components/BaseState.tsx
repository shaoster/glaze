import { useEffect, useState } from 'react'
import {
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    IconButton,
    List,
    ListItem,
    ListItemText,
    TextField,
    Typography,
} from '@mui/material'
import { createFilterOptions } from '@mui/material/Autocomplete'
import type { PieceDetail, PieceState } from '../types'
import { createLocation, fetchLocations, updateCurrentState } from '../api'

type BaseStateProps = {
    pieceState: PieceState
    pieceId: string
    onSaved: (updated: PieceDetail) => void
    onDirtyChange?: (dirty: boolean) => void
}

type ImageEntry = { url: string; caption: string }

const locationFilter = createFilterOptions<string>()

function stateImages(pieceState: PieceState): ImageEntry[] {
    return pieceState.images.map((img) => ({
        url: img.url,
        caption: img.caption,
    }))
}

export default function BaseState({ pieceState, pieceId, onSaved, onDirtyChange }: BaseStateProps) {
    const [notes, setNotes] = useState(pieceState.notes)
    const [location, setLocation] = useState(pieceState.location ?? '')
    const [images, setImages] = useState<ImageEntry[]>(stateImages(pieceState))
    const [newImageUrl, setNewImageUrl] = useState('')
    const [newImageCaption, setNewImageCaption] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [locationOptions, setLocationOptions] = useState<string[]>([])

    // Reset form when pieceState changes (e.g. after a state transition)
    useEffect(() => {
        setNotes(pieceState.notes)
        setLocation(pieceState.location ?? '')
        setImages(stateImages(pieceState))
    }, [pieceState])

    // Load location options for the dropdown
    useEffect(() => {
        fetchLocations().then(setLocationOptions).catch(() => {})
    }, [])

    const originalImages = stateImages(pieceState)
    const isDirty =
        notes !== pieceState.notes ||
        (location ?? '') !== (pieceState.location ?? '') ||
        JSON.stringify(images) !== JSON.stringify(originalImages)

    useEffect(() => {
        onDirtyChange?.(isDirty)
    }, [isDirty, onDirtyChange])

    async function handleSave() {
        setSaving(true)
        setSaveError(null)
        try {
            const result = await updateCurrentState(pieceId, { notes, location, images })
            onSaved(result)
        } catch {
            setSaveError('Failed to save. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    function addImage() {
        if (!newImageUrl.trim()) return
        setImages((prev) => [
            ...prev,
            {
                url: newImageUrl.trim(),
                caption: newImageCaption.trim(),
            },
        ])
        setNewImageUrl('')
        setNewImageCaption('')
    }

    function removeImage(index: number) {
        setImages((prev) => prev.filter((_, i) => i !== index))
    }

    async function handleLocationChange(val: string | null) {
        const raw = val ?? ''
        const createPrefix = 'Create "'
        if (raw.startsWith(createPrefix) && raw.endsWith('"')) {
            const newName = raw.slice(createPrefix.length, -1)
            try {
                await createLocation(newName)
                setLocationOptions((prev) => [...prev, newName].sort())
            } catch {
                // Silently continue — the name will still be saved with the state
            }
            setLocation(newName)
        } else {
            setLocation(raw)
        }
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
            {/* Notes */}
            <TextField
                label="Notes"
                multiline
                minRows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
                fullWidth
            />

            {/* Location */}
            <Autocomplete
                freeSolo
                options={locationOptions}
                value={location}
                onInputChange={(_e, val) => setLocation(val)}
                onChange={(_e, val) => { handleLocationChange(val) }}
                filterOptions={(options, params) => {
                    const filtered = locationFilter(options, params)
                    const { inputValue } = params
                    const isExisting = options.some((opt) => inputValue === opt)
                    if (inputValue !== '' && !isExisting) {
                        filtered.push(`Create "${inputValue}"`)
                    }
                    return filtered
                }}
                renderInput={(params) => (
                    <TextField {...params} label="Location" fullWidth />
                )}
            />

            {/* Images */}
            <Box>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Images
                </Typography>
                {images.length > 0 && (
                    <List dense disablePadding>
                        {images.map((img, i) => (
                            <ListItem
                                key={i}
                                disableGutters
                                secondaryAction={
                                    <IconButton
                                        edge="end"
                                        aria-label="remove image"
                                        onClick={() => removeImage(i)}
                                        size="small"
                                    >
                                        ✕
                                    </IconButton>
                                }
                            >
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', pr: 6 }}>
                                    <img
                                        src={img.url}
                                        alt={img.caption || 'Pottery image'}
                                        style={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 4 }}
                                    />
                                    <ListItemText
                                        primary={img.caption || '(no caption)'}
                                        slotProps={{
                                            primary: { sx: { color: 'text.primary' } },
                                        }}
                                    />
                                </Box>
                            </ListItem>
                        ))}
                    </List>
                )}
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    <TextField
                        label="Image URL"
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        size="small"
                        sx={{ flex: 2, minWidth: 200 }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addImage() }
                        }}
                    />
                    <TextField
                        label="Caption"
                        value={newImageCaption}
                        onChange={(e) => setNewImageCaption(e.target.value)}
                        size="small"
                        sx={{ flex: 1, minWidth: 120 }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); addImage() }
                        }}
                    />
                    <Button
                        variant="outlined"
                        onClick={addImage}
                        disabled={!newImageUrl.trim()}
                        size="small"
                    >
                        + Add Image
                    </Button>
                </Box>
            </Box>

            {/* Save controls */}
            {saveError && (
                <Typography color="error" variant="body2">
                    {saveError}
                </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                    data-testid="save-button"
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                    Save
                </Button>
                {isDirty && (
                    <Typography variant="body2" sx={{ color: 'warning.main' }} data-testid="unsaved-indicator">
                        Unsaved changes
                    </Typography>
                )}
            </Box>
        </Box>
    )
}
