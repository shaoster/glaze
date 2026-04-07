import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { updateCurrentState, updatePiece } from '@common/api'
import type { PieceDetail, PieceState } from '@common/types'
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

function stateImages(pieceState: PieceState): ImageEntry[] {
  return pieceState.images.map((img) => ({ url: img.url, caption: img.caption }))
}

function formatAdditionalFieldValue(value: unknown, type: ResolvedAdditionalField['type']): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  if (type === 'boolean') return value ? 'true' : 'false'
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
    if (raw === undefined) return
    const trimmed = raw.trim()
    if (trimmed === '') return
    if (def.type === 'integer') {
      const parsed = parseInt(trimmed, 10)
      if (!Number.isNaN(parsed)) payload[def.name] = parsed
      return
    }
    if (def.type === 'number') {
      const parsed = Number(trimmed)
      if (!Number.isNaN(parsed)) payload[def.name] = parsed
      return
    }
    if (def.type === 'boolean') {
      const normalized = trimmed.toLowerCase()
      if (normalized === 'true') payload[def.name] = true
      if (normalized === 'false') payload[def.name] = false
      return
    }
    payload[def.name] = raw
  })
  return payload
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
  const originalImages = stateImages(pieceState)
  const isDirty =
    notes !== pieceState.notes ||
    JSON.stringify(images) !== JSON.stringify(originalImages) ||
    additionalFieldsDirty ||
    locationDirty

  useEffect(() => {
    setNotes(pieceState.notes)
    setImages(stateImages(pieceState))
    setAdditionalFieldInputs(baseAdditionalFieldInputs)
    setCurrentLocation(currentLocationProp)
  }, [pieceState, baseAdditionalFieldInputs, currentLocationProp])

  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await updateCurrentState(pieceId, {
        notes,
        images,
        additional_fields: normalizedAdditionalFields,
      })
      let finalResult = result
      if (locationDirty) {
        finalResult = await updatePiece(pieceId, {
          current_location: currentLocation.trim() || undefined,
        })
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
    setImages((prev) => [...prev, { url: newImageUrl.trim(), caption: newImageCaption.trim() }])
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
    <View style={styles.root}>
      <View style={styles.field}>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          placeholderTextColor="#7a7a80"
          multiline
          style={[styles.input, styles.multiInput]}
        />
      </View>

      <GlobalFieldPicker
        globalName="location"
        label="Current location"
        value={currentLocation}
        onChange={setCurrentLocation}
        canCreate
      />

      {additionalFieldDefs.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.sectionTitle}>State details</Text>
          {additionalFieldDefs.map((field) => {
            const value = additionalFieldInputs[field.name] ?? ''
            const label = formatWorkflowFieldLabel(field.name)

            if (field.isGlobalRef && field.globalName) {
              return (
                <View key={field.name} style={styles.inlineField}>
                  <GlobalFieldPicker
                    globalName={field.globalName}
                    label={label}
                    value={value}
                    onChange={(nextValue) => handleAdditionalFieldChange(field.name, nextValue)}
                    canCreate={Boolean(field.canCreate)}
                    helperText={field.description}
                    required={field.required}
                  />
                </View>
              )
            }

            if (field.enum?.length) {
              return (
                <View key={field.name} style={styles.inlineField}>
                  <Text style={styles.label}>{label}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.enumRow}>
                    {field.enum.map((option) => (
                      <Pressable
                        key={`${field.name}-${option}`}
                        style={[styles.optionButton, value === option ? styles.optionButtonActive : undefined]}
                        onPress={() => handleAdditionalFieldChange(field.name, option)}
                        disabled={field.isStateRef}
                      >
                        <Text style={styles.optionButtonText}>{option}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {field.description ? <Text style={styles.helper}>{field.description}</Text> : null}
                </View>
              )
            }

            return (
              <View key={field.name} style={styles.inlineField}>
                <Text style={styles.label}>
                  {label}
                  {field.required ? ' *' : ''}
                </Text>
                <TextInput
                  value={value}
                  onChangeText={(nextValue) => handleAdditionalFieldChange(field.name, nextValue)}
                  placeholder={label}
                  placeholderTextColor="#7a7a80"
                  editable={!field.isStateRef}
                  keyboardType={field.type === 'number' || field.type === 'integer' ? 'numeric' : 'default'}
                  style={[styles.input, field.isStateRef ? styles.disabledInput : undefined]}
                />
                {field.description ? <Text style={styles.helper}>{field.description}</Text> : null}
              </View>
            )
          })}
        </View>
      )}

      <View style={styles.field}>
        <Text style={styles.sectionTitle}>Images</Text>
        {images.map((img, index) => (
          <View key={`${img.url}-${index}`} style={styles.imageRow}>
            <View style={styles.imageText}>
              <Text style={styles.imageTitle}>{img.caption || '(no caption)'}</Text>
              <Text style={styles.imageSub}>{img.url}</Text>
            </View>
            <Pressable style={styles.removeButton} onPress={() => removeImage(index)}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}
        <TextInput
          value={newImageUrl}
          onChangeText={setNewImageUrl}
          placeholder="Image URL"
          placeholderTextColor="#7a7a80"
          style={styles.input}
        />
        <TextInput
          value={newImageCaption}
          onChangeText={setNewImageCaption}
          placeholder="Caption"
          placeholderTextColor="#7a7a80"
          style={styles.input}
        />
        <Pressable
          style={[styles.button, !newImageUrl.trim() ? styles.buttonDisabled : undefined]}
          onPress={addImage}
          disabled={!newImageUrl.trim()}
        >
          <Text style={styles.buttonText}>Add image</Text>
        </Pressable>
      </View>

      {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

      <Pressable
        style={[styles.buttonPrimary, (!isDirty || saving) ? styles.buttonDisabled : undefined]}
        onPress={handleSave}
        disabled={!isDirty || saving}
      >
        {saving ? <ActivityIndicator size="small" color="#f5f5f7" /> : <Text style={styles.buttonText}>Save</Text>}
      </Pressable>

      {isDirty ? <Text style={styles.warningText}>Unsaved changes</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  inlineField: {
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#f5f5f7',
    fontSize: 16,
    fontWeight: '700',
  },
  label: {
    color: '#f5f5f7',
    fontSize: 14,
    fontWeight: '600',
  },
  helper: {
    color: '#9ea0a8',
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    backgroundColor: '#1f1f27',
    color: '#f5f5f7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multiInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  disabledInput: {
    opacity: 0.7,
  },
  enumRow: {
    gap: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#252531',
  },
  optionButtonActive: {
    borderColor: '#7b8cff',
    backgroundColor: '#2f355f',
  },
  optionButtonText: {
    color: '#f5f5f7',
    fontSize: 12,
  },
  imageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    borderWidth: 1,
    borderColor: '#353542',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#23232d',
  },
  imageText: {
    flex: 1,
    gap: 2,
  },
  imageTitle: {
    color: '#f5f5f7',
    fontWeight: '600',
  },
  imageSub: {
    color: '#9ea0a8',
    fontSize: 12,
  },
  removeButton: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#5a2a2a',
  },
  removeText: {
    color: '#ffb8b8',
    fontSize: 12,
  },
  button: {
    borderWidth: 1,
    borderColor: '#4f5dff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#2b2f5a',
  },
  buttonPrimary: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#5a64ff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#f5f5f7',
    fontWeight: '700',
  },
  errorText: {
    color: '#ff8c8c',
    fontSize: 13,
  },
  warningText: {
    color: '#ffcf70',
    fontSize: 13,
  },
})
