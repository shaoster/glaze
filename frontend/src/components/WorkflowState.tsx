import { useEffect, useMemo, useState } from 'react'
import {
    Autocomplete,
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
import { createFilterOptions } from '@mui/material/Autocomplete'
import type { PieceDetail, PieceState } from '../types'
import {
    createGlobalEntry,
    fetchGlobalEntries,
    updateCurrentState,
} from '../api'
import {
    type ResolvedAdditionalField,
    formatWorkflowFieldLabel,
    getAdditionalFieldDefinitions,
} from '../workflow'

type WorkflowStateProps = {
    pieceState: PieceState
    pieceId: string
    onSaved: (updated: PieceDetail) => void
    onDirtyChange?: (dirty: boolean) => void
}

type ImageEntry = { url: string; caption: string }

type AdditionalFieldInputMap = Record<string, string>

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

const globalFilter = createFilterOptions<string>()

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
}: WorkflowStateProps) {
    const [notes, setNotes] = useState(pieceState.notes)
    const [images, setImages] = useState<ImageEntry[]>(stateImages(pieceState))
    const [newImageUrl, setNewImageUrl] = useState('')
    const [newImageCaption, setNewImageCaption] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [globalOptions, setGlobalOptions] = useState<Record<string, string[]>>({})
    const [globalCreationError, setGlobalCreationError] = useState<string | null>(null)
    const [creatingGlobalFields, setCreatingGlobalFields] = useState<Record<string, boolean>>({})
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
    const createableGlobalNames = useMemo(() => {
        const names = new Set<string>()
        additionalFieldDefs.forEach((def) => {
            if (def.isGlobalRef && def.canCreate && def.globalName) {
                names.add(def.globalName)
            }
        })
        return Array.from(names)
    }, [additionalFieldDefs])

    // Reset form when pieceState changes (e.g. after a state transition)
    useEffect(() => {
        setNotes(pieceState.notes)
        setImages(stateImages(pieceState))
        setAdditionalFieldInputs(baseAdditionalFieldInputs)
    }, [pieceState, baseAdditionalFieldInputs])

    useEffect(() => {
        setGlobalCreationError(null)
    }, [pieceState.state])

    useEffect(() => {
        createableGlobalNames.forEach((globalName) => {
            fetchGlobalEntries(globalName)
                .then((entries) =>
                    setGlobalOptions((prev) => ({ ...prev, [globalName]: entries }))
                )
                .catch(() => {})
        })
    }, [createableGlobalNames])

    const originalImages = stateImages(pieceState)
    const isDirty =
        notes !== pieceState.notes ||
        JSON.stringify(images) !== JSON.stringify(originalImages) ||
        additionalFieldsDirty

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

    function handleAdditionalFieldChange(name: string, value: string) {
        setAdditionalFieldInputs((prev) => ({ ...prev, [name]: value }))
    }

    async function handleCreateGlobalOption(field: ResolvedAdditionalField, value: string) {
        if (!field.globalName || !field.globalField) return
        setGlobalCreationError(null)
        setCreatingGlobalFields((prev) => ({ ...prev, [field.name]: true }))
        try {
            const createdName = await createGlobalEntry(field.globalName, field.globalField, value)
            setGlobalOptions((prev) => {
                const current = prev[field.globalName!] ?? []
                const merged = Array.from(new Set([...current, createdName])).sort()
                return { ...prev, [field.globalName!]: merged }
            })
            handleAdditionalFieldChange(field.name, createdName)
        } catch {
            setGlobalCreationError(`Failed to create ${formatWorkflowFieldLabel(field.name)}.`)
        } finally {
            setCreatingGlobalFields((prev) => {
                const next = { ...prev }
                delete next[field.name]
                return next
            })
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

            {additionalFieldDefs.length > 0 && (
                <Box>
                    <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                        State details
                    </Typography>
                    {globalCreationError && (
                        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
                            {globalCreationError}
                        </Typography>
                    )}
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
                                const options = globalOptions[field.globalName] ?? []
                                const freeSolo = Boolean(field.canCreate)
                                const creating = Boolean(creatingGlobalFields[field.name])
                                const globalValue = creating ? '' : value
                                return (
                                    <Autocomplete
                                        key={field.name}
                                        freeSolo={freeSolo}
                                        options={options}
                                        value={globalValue}
                                        disabled={creating}
                                        onInputChange={(_e, inputValue, reason) => {
                                            if (reason === 'clear') {
                                                handleAdditionalFieldChange(field.name, '')
                                            } else if (reason === 'input') {
                                                handleAdditionalFieldChange(field.name, inputValue)
                                            }
                                        }}
                                        onChange={(_e, option) => {
                                            if (typeof option === 'string') {
                                                const createValue = parseCreateOptionValue(option)
                                                if (createValue !== null && freeSolo) {
                                                    void handleCreateGlobalOption(field, createValue)
                                                    return
                                                }
                                                handleAdditionalFieldChange(field.name, option)
                                            } else {
                                                handleAdditionalFieldChange(field.name, '')
                                            }
                                        }}
                                        filterOptions={(options, params) => {
                                            const filtered = globalFilter(options, params)
                                            const { inputValue } = params
                                            const isExisting = options.some((opt) => inputValue === opt)
                                            if (freeSolo && inputValue !== '' && !isExisting) {
                                                filtered.push(buildCreateOptionValue(inputValue))
                                            }
                                            return filtered
                                        }}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label={label}
                                                helperText={helperText}
                                                required={field.required}
                                                fullWidth
                                            />
                                        )}
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
