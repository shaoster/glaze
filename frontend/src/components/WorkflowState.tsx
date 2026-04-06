import { useEffect, useMemo, useState } from 'react'
import {
    Box,
    Button,
    CircularProgress,
    IconButton,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    TextField,
    Typography,
} from '@mui/material'
import type { PieceDetail, PieceState } from '../types'
import {
    updateCurrentState,
    updatePiece,
} from '../api'
import {
    type ResolvedAdditionalField,
    formatWorkflowFieldLabel,
    getAdditionalFieldDefinitions,
} from '../workflow'
import GlobalFieldPicker from './GlobalFieldPicker'

type WorkflowStateProps = {
    pieceState: PieceState
    pieceId: string
    onSaved: (updated: PieceDetail) => void
    onDirtyChange?: (dirty: boolean) => void
    currentLocation?: string
}

type ImageEntry = { url: string; caption: string }

type AdditionalFieldInputMap = Record<string, string>

function formatAdditionalFieldValue(
    value: unknown,
    type: ResolvedAdditionalField['type']
): string {
    if (value === null || value === undefined) {
        return ''
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value)
        } catch {
            return String(value)
        }
    }
    if (type === 'boolean') {
        return value ? 'true' : 'false'
    }
    return String(value)
}

function buildAdditionalFieldInputMap(
    defs: ResolvedAdditionalField[],
    values: Record<string, unknown>
): AdditionalFieldInputMap {
    const map: AdditionalFieldInputMap = {}
    defs.forEach((def) => {
        map[def.name] = formatAdditionalFieldValue(values[def.name], def.type)
    })
    return map
}

function normalizeAdditionalFieldPayload(
    defs: ResolvedAdditionalField[],
    inputs: AdditionalFieldInputMap
): Record<string, string | number | boolean> {
    const payload: Record<string, string | number | boolean> = {}
    defs.forEach((def) => {
        const raw = inputs[def.name]
        if (raw === undefined) {
            return
        }
        const trimmed = raw.trim()
        if (trimmed === '') {
            return
        }
        if (def.type === 'integer') {
            const parsed = parseInt(trimmed, 10)
            if (!Number.isNaN(parsed)) {
                payload[def.name] = parsed
            }
            return
        }
        if (def.type === 'number') {
            const parsed = Number(trimmed)
            if (!Number.isNaN(parsed)) {
                payload[def.name] = parsed
            }
            return
        }
        if (def.type === 'boolean') {
            const normalized = trimmed.toLowerCase()
            if (normalized === 'true') {
                payload[def.name] = true
            } else if (normalized === 'false') {
                payload[def.name] = false
            }
            return
        }
        payload[def.name] = raw
    })
    return payload
}

function stateImages(pieceState: PieceState): ImageEntry[] {
    return pieceState.images.map((img) => ({
        url: img.url,
        caption: img.caption,
    }))
}

export default function WorkflowState({
    pieceState,
    pieceId,
    onSaved,
    onDirtyChange,
    currentLocation: currentLocationProp = '',
}: WorkflowStateProps) {
    const [notes, setNotes] = useState(pieceState.notes)
    const [images, setImages] = useState<ImageEntry[]>(stateImages(pieceState))
    const [newImageUrl, setNewImageUrl] = useState('')
    const [newImageCaption, setNewImageCaption] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [currentLocation, setCurrentLocation] = useState(currentLocationProp)
    const additionalFieldDefs = useMemo(() => getAdditionalFieldDefinitions(pieceState.state), [pieceState.state])
    const baseAdditionalFieldInputs = useMemo(
        () => buildAdditionalFieldInputMap(additionalFieldDefs, pieceState.additional_fields ?? {}),
        [additionalFieldDefs, pieceState.additional_fields]
    )
    const [additionalFieldInputs, setAdditionalFieldInputs] = useState(baseAdditionalFieldInputs)
    const normalizedAdditionalFields = useMemo(
        () => normalizeAdditionalFieldPayload(additionalFieldDefs, additionalFieldInputs),
        [additionalFieldDefs, additionalFieldInputs]
    )
    const normalizedBaseAdditionalFields = useMemo(
        () => normalizeAdditionalFieldPayload(additionalFieldDefs, baseAdditionalFieldInputs),
        [additionalFieldDefs, baseAdditionalFieldInputs]
    )
    const additionalFieldsDirty =
        JSON.stringify(normalizedAdditionalFields) !== JSON.stringify(normalizedBaseAdditionalFields)
    const locationDirty = currentLocation.trim() !== currentLocationProp.trim()

    // Reset form when pieceState changes (e.g. after a state transition)
    useEffect(() => {
        setNotes(pieceState.notes)
        setImages(stateImages(pieceState))
        setAdditionalFieldInputs(baseAdditionalFieldInputs)
        setCurrentLocation(currentLocationProp)
    }, [pieceState, baseAdditionalFieldInputs, currentLocationProp])

    const originalImages = stateImages(pieceState)
    const isDirty =
        notes !== pieceState.notes ||
        JSON.stringify(images) !== JSON.stringify(originalImages) ||
        additionalFieldsDirty ||
        locationDirty

    useEffect(() => {
        onDirtyChange?.(isDirty)
    }, [isDirty, onDirtyChange])

    async function handleSave() {
        setSaving(true)
        setSaveError(null)
        try {
            const payload = {
                notes,
                images,
                additional_fields: normalizedAdditionalFields,
            }
            const result = await updateCurrentState(pieceId, payload)
            let finalResult = result
            if (locationDirty) {
                const updated = await updatePiece(pieceId, {
                    current_location: currentLocation.trim() || undefined,
                })
                finalResult = updated
            }
            onSaved(finalResult)
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

    function handleAdditionalFieldChange(name: string, value: string) {
        setAdditionalFieldInputs((prev) => ({ ...prev, [name]: value }))
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

            <GlobalFieldPicker
                globalName="location"
                label="Current location"
                value={currentLocation}
                onChange={setCurrentLocation}
                canCreate
            />

            {additionalFieldDefs.length > 0 && (
                <Box>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                        State details
                    </Typography>
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 2,
                            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        }}
                    >
                        {additionalFieldDefs.map((field) => {
                            const value = additionalFieldInputs[field.name] ?? ''
                            const helperText = field.description
                            const label = formatWorkflowFieldLabel(field.name)
                            if (field.isGlobalRef && field.globalName) {
                                return (
                                    <GlobalFieldPicker
                                        key={field.name}
                                        globalName={field.globalName}
                                        label={label}
                                        value={value}
                                        onChange={(val) => handleAdditionalFieldChange(field.name, val)}
                                        canCreate={Boolean(field.canCreate)}
                                        helperText={helperText}
                                        required={field.required}
                                    />
                                )
                            }
                            if (field.enum?.length) {
                                return (
                                    <TextField
                                        key={field.name}
                                        label={label}
                                        select
                                        value={value}
                                        onChange={(e) => handleAdditionalFieldChange(field.name, e.target.value)}
                                        helperText={helperText}
                                        required={field.required}
                                        fullWidth
                                    >
                                        {field.enum.map((option) => (
                                            <MenuItem key={option} value={option}>
                                                {option}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                )
                            }
                            if (field.type === 'number' || field.type === 'integer') {
                                return (
                                    <TextField
                                        key={field.name}
                                        label={label}
                                        type="number"
                                        value={value}
                                        onChange={(e) => handleAdditionalFieldChange(field.name, e.target.value)}
                                        slotProps={{
                                            htmlInput: {
                                                inputMode: field.type === 'integer' ? 'numeric' : 'decimal',
                                                step: field.type === 'integer' ? 1 : 'any',
                                            },
                                        }}
                                        helperText={helperText}
                                        required={field.required}
                                        fullWidth
                                    />
                                )
                            }
                            if (field.type === 'boolean') {
                                return (
                                    <TextField
                                        key={field.name}
                                        label={label}
                                        select
                                        value={value}
                                        onChange={(e) => handleAdditionalFieldChange(field.name, e.target.value)}
                                        helperText={helperText}
                                        required={field.required}
                                        fullWidth
                                    >
                                        <MenuItem value="true">True</MenuItem>
                                        <MenuItem value="false">False</MenuItem>
                                    </TextField>
                                )
                            }
                            return (
                                <TextField
                                    key={field.name}
                                    label={label}
                                    value={value}
                                    onChange={(e) => handleAdditionalFieldChange(field.name, e.target.value)}
                                    helperText={helperText}
                                    required={field.required}
                                    fullWidth
                                />
                            )
                        })}
                    </Box>
                </Box>
            )}

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
