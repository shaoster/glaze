import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import {
    Box,
    Button,
    CircularProgress,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemText,
    MenuItem,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material'
import ImageLightbox from './ImageLightbox'
import type { PieceDetail, PieceState } from '@common/types'
import {
    hasCloudinaryUploadConfig,
    uploadImageToCloudinary,
    updateCurrentState,
    updatePiece,
} from '@common/api'
import {
    type ResolvedAdditionalField,
    formatWorkflowFieldLabel,
    getAdditionalFieldDefinitions,
} from '@common/workflow'
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
    const [uploadingImage, setUploadingImage] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [imageInputMode, setImageInputMode] = useState<'url' | 'upload'>(
        () => hasCloudinaryUploadConfig() ? 'upload' : 'url'
    )
    const [editingCaptionIndex, setEditingCaptionIndex] = useState<number | null>(null)
    const [editingCaptionValue, setEditingCaptionValue] = useState('')
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

    // Upload preview load state
    const [uploadPreviewLoaded, setUploadPreviewLoaded] = useState(false)
    useEffect(() => { setUploadPreviewLoaded(false) }, [newImageUrl])

    // Lightbox state
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
    const canUploadToCloudinary = hasCloudinaryUploadConfig()

    // Reset form when pieceState changes (e.g. after a state transition)
    useEffect(() => {
        setNotes(pieceState.notes)
        setImages(stateImages(pieceState))
        setAdditionalFieldInputs(baseAdditionalFieldInputs)
        setCurrentLocation(currentLocationProp)
    }, [pieceState, baseAdditionalFieldInputs, currentLocationProp])

    const [savingImage, setSavingImage] = useState(false)
    const [imageError, setImageError] = useState<string | null>(null)

    const isDirty =
        notes !== pieceState.notes ||
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
                images,  // always in sync with server after each image operation
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

    async function addImage() {
        if (!newImageUrl.trim()) return
        const updatedImages = [...images, { url: newImageUrl.trim(), caption: newImageCaption.trim() }]
        setSavingImage(true)
        setImageError(null)
        try {
            const result = await updateCurrentState(pieceId, {
                notes,
                images: updatedImages,
                additional_fields: normalizedAdditionalFields,
            })
            onSaved(result)
            setNewImageUrl('')
            setNewImageCaption('')
        } catch {
            setImageError('Failed to save image. Please try again.')
        } finally {
            setSavingImage(false)
        }
    }

    async function removeImage(index: number) {
        if (!window.confirm('Remove this image?')) return
        const updatedImages = images.filter((_, i) => i !== index)
        setSavingImage(true)
        setImageError(null)
        try {
            const result = await updateCurrentState(pieceId, {
                notes,
                images: updatedImages,
                additional_fields: normalizedAdditionalFields,
            })
            onSaved(result)
        } catch {
            setImageError('Failed to remove image. Please try again.')
        } finally {
            setSavingImage(false)
        }
    }

    function startEditingCaption(index: number) {
        setEditingCaptionIndex(index)
        setEditingCaptionValue(images[index].caption)
    }

    async function commitCaptionEdit(index: number, value: string) {
        setEditingCaptionIndex(null)
        const newCaption = value.trim()
        if (newCaption === images[index].caption) return
        const updatedImages = images.map((img, i) => i === index ? { ...img, caption: newCaption } : img)
        setSavingImage(true)
        setImageError(null)
        try {
            const result = await updateCurrentState(pieceId, {
                notes,
                images: updatedImages,
                additional_fields: normalizedAdditionalFields,
            })
            onSaved(result)
        } catch {
            setImageError('Failed to save caption. Please try again.')
        } finally {
            setSavingImage(false)
        }
    }

    async function handleCloudinaryUpload(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        if (!file) {
            return
        }
        setUploadingImage(true)
        setUploadError(null)
        try {
            const uploadedUrl = await uploadImageToCloudinary(file)
            setNewImageUrl(uploadedUrl)
        } catch {
            setUploadError('Failed to upload image. Check Cloudinary config and try again.')
        } finally {
            setUploadingImage(false)
            event.target.value = ''
        }
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
                            if (field.isStateRef) {
                                // State ref fields carry a value forward from an ancestor
                                // state and must not be edited.
                                return (
                                    <TextField
                                        key={field.name}
                                        label={label}
                                        type={field.type === 'number' || field.type === 'integer' ? 'number' : 'text'}
                                        value={value}
                                        disabled
                                        helperText={helperText}
                                        fullWidth
                                    />
                                )
                            }
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

            {/* Images */}
            <Box>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 1 }}>
                    Images
                </Typography>
                {images.length > 0 && (
                    <List dense disablePadding>
                        {images.map((img, i) => (
                            <ListItem key={i} disableGutters>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', width: '100%' }}>
                                    <IconButton
                                        aria-label="remove image"
                                        onClick={() => removeImage(i)}
                                        size="small"
                                    >
                                        ✕
                                    </IconButton>
                                    <Box
                                        component="button"
                                        onClick={() => setLightboxIndex(i)}
                                        aria-label={`View image ${i + 1}`}
                                        sx={{
                                            p: 0, border: 'none', background: 'none', cursor: 'pointer',
                                            borderRadius: 0.5, display: 'block', flexShrink: 0,
                                        }}
                                    >
                                        <img
                                            src={img.url}
                                            alt={img.caption || 'Pottery image'}
                                            style={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                                        />
                                    </Box>
                                    {editingCaptionIndex === i ? (
                                        <TextField
                                            value={editingCaptionValue}
                                            onChange={(e) => setEditingCaptionValue(e.target.value)}
                                            onBlur={() => commitCaptionEdit(i, editingCaptionValue)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); commitCaptionEdit(i, editingCaptionValue) }
                                                if (e.key === 'Escape') { e.preventDefault(); setEditingCaptionIndex(null) }
                                            }}
                                            size="small"
                                            autoFocus
                                            sx={{ flex: 1 }}
                                            slotProps={{ htmlInput: { 'aria-label': 'Edit caption' } }}
                                        />
                                    ) : (
                                        <>
                                            <ListItemText
                                                primary={img.caption || '(no caption)'}
                                                slotProps={{ primary: { sx: { color: 'text.primary' } } }}
                                            />
                                            <IconButton
                                                aria-label="edit caption"
                                                onClick={() => startEditingCaption(i)}
                                                size="small"
                                                sx={{ ml: 'auto', flexShrink: 0 }}
                                            >
                                                ✏
                                            </IconButton>
                                        </>
                                    )}
                                </Box>
                            </ListItem>
                        ))}
                    </List>
                )}
                <Divider sx={{ my: 1 }} />
                <Box>
                  {canUploadToCloudinary && (
                      <ToggleButtonGroup
                          value={imageInputMode}
                          exclusive
                          onChange={(_, val) => { if (val) { setImageInputMode(val); setNewImageUrl('') } }}
                          size="small"
                          sx={{ mb: 1 }}
                      >
                          <ToggleButton value="url">Paste URL</ToggleButton>
                          <ToggleButton value="upload">Upload</ToggleButton>
                      </ToggleButtonGroup>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                      {imageInputMode === 'upload' ? (
                          newImageUrl ? (
                              <>
                                  {!uploadPreviewLoaded && <CircularProgress size={40} />}
                                  <img
                                      src={newImageUrl}
                                      alt="Uploaded preview"
                                      data-testid="upload-preview"
                                      style={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 4, flexShrink: 0, display: uploadPreviewLoaded ? 'block' : 'none' }}
                                      onLoad={() => setUploadPreviewLoaded(true)}
                                  />
                              </>
                          ) : (
                              <Button
                                  component="label"
                                  variant="outlined"
                                  size="small"
                                  disabled={uploadingImage}
                              >
                                  {uploadingImage ? 'Uploading...' : 'Upload Image'}
                                  <input
                                      hidden
                                      type="file"
                                      accept="image/*"
                                      onChange={handleCloudinaryUpload}
                                  />
                              </Button>
                          )
                      ) : (
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
                      )}
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
                          disabled={!newImageUrl.trim() || savingImage}
                          size="small"
                          startIcon={savingImage ? <CircularProgress size={14} color="inherit" /> : undefined}
                      >
                          + Add Image
                      </Button>
                  </Box>
                  {(uploadError || imageError) && (
                      <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                          {uploadError ?? imageError}
                      </Typography>
                  )}
              </Box>
            </Box>
            {/* Lightbox */}
            {lightboxIndex !== null && (
                <ImageLightbox
                    images={images}
                    initialIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}

        </Box>
    )
}
