import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { createPiece } from '../../../frontend_common/src/api'
import type { PieceDetail } from '../../../frontend_common/src/types'
import GlobalFieldPicker from './GlobalFieldPicker'

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

type NewPieceModalProps = {
  open: boolean
  onClose: () => void
  onCreated: (piece: PieceDetail) => void
}

export default function NewPieceModal({ open, onClose, onCreated }: NewPieceModalProps) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedThumbnail, setSelectedThumbnail] = useState(DEFAULT_THUMBNAIL)
  const [location, setLocation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetState() {
    setName('')
    setNotes('')
    setSelectedThumbnail(DEFAULT_THUMBNAIL)
    setLocation('')
    setSaving(false)
    setError(null)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const piece = await createPiece({
        name: name.trim(),
        notes: notes || undefined,
        thumbnail: selectedThumbnail,
        current_location: location.trim() || undefined,
      })
      resetState()
      onClose()
      onCreated(piece)
    } catch {
      setError('Failed to create piece. Please try again.')
      setSaving(false)
    }
  }

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>New Piece</Text>

          <Text style={styles.label}>Name *</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor="#7a7a80"
            style={styles.input}
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={(nextValue) => setNotes(nextValue.slice(0, MAX_NOTES_LENGTH))}
            placeholder="Notes"
            placeholderTextColor="#7a7a80"
            multiline
            style={[styles.input, styles.multiInput]}
          />
          <Text style={styles.helper}>{notes.length} / {MAX_NOTES_LENGTH}</Text>

          <GlobalFieldPicker
            globalName="location"
            label="Location"
            value={location}
            onChange={setLocation}
            canCreate
          />

          <Text style={styles.label}>Thumbnail</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {CURATED_THUMBNAILS.map((thumb) => (
              <Pressable
                key={thumb}
                onPress={() => setSelectedThumbnail(thumb)}
                style={[styles.thumbChip, selectedThumbnail === thumb ? styles.thumbActive : undefined]}
              >
                <Text style={styles.thumbText}>{thumb.split('/').pop()?.replace('.svg', '') ?? thumb}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, (!name.trim() || saving) ? styles.buttonDisabled : undefined]}
              onPress={handleSave}
              disabled={!name.trim() || saving}
            >
              <Text style={styles.primaryText}>{saving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#17171f',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    gap: 10,
    maxHeight: '85%',
  },
  title: {
    color: '#f5f5f7',
    fontSize: 20,
    fontWeight: '700',
  },
  label: {
    color: '#f5f5f7',
    fontWeight: '600',
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helper: {
    color: '#9ea0a8',
    fontSize: 12,
  },
  thumbRow: {
    gap: 8,
  },
  thumbChip: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    backgroundColor: '#252531',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thumbActive: {
    borderColor: '#7b8cff',
    backgroundColor: '#313970',
  },
  thumbText: {
    color: '#f5f5f7',
    fontSize: 12,
  },
  errorText: {
    color: '#ff8c8c',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: {
    color: '#f5f5f7',
    fontWeight: '600',
  },
  primaryButton: {
    borderRadius: 8,
    backgroundColor: '#5a64ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryText: {
    color: '#f5f5f7',
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
