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
import { createGlobalEntry, fetchGlobalEntries } from '@common/api'
import { getGlobalDisplayField } from '@common/workflow'

export type GlobalFieldPickerProps = {
  globalName: string
  label: string
  value: string
  onChange: (value: string) => void
  canCreate?: boolean
  helperText?: string
  required?: boolean
}

export default function GlobalFieldPicker({
  globalName,
  label,
  value,
  onChange,
  canCreate = false,
  helperText,
  required,
}: GlobalFieldPickerProps) {
  const [options, setOptions] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fieldName = getGlobalDisplayField(globalName)

  useEffect(() => {
    fetchGlobalEntries(globalName)
      .then(setOptions)
      .catch(() => {})
  }, [globalName])

  const filteredOptions = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options.slice(0, 8)
    return options.filter((opt) => opt.toLowerCase().includes(q)).slice(0, 8)
  }, [options, value])

  const canOfferCreate =
    canCreate &&
    value.trim().length > 0 &&
    !options.some((opt) => opt.toLowerCase() === value.trim().toLowerCase())

  async function handleCreate() {
    const nextValue = value.trim()
    if (!nextValue) return
    setCreating(true)
    setError(null)
    try {
      const created = await createGlobalEntry(globalName, fieldName, nextValue)
      setOptions((prev) => Array.from(new Set([...prev, created])).sort())
      onChange(created)
    } catch {
      setError(`Failed to create ${label.toLowerCase()}.`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor="#7a7a80"
        style={styles.input}
        editable={!creating}
      />
      {creating && <ActivityIndicator size="small" color="#f5f5f7" />}
      {(error ?? helperText) && (
        <Text style={[styles.helperText, error ? styles.errorText : undefined]}>{error ?? helperText}</Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
        {filteredOptions.map((option) => (
          <Pressable
            key={`${globalName}-${option}`}
            onPress={() => onChange(option)}
            style={[styles.optionChip, value === option ? styles.optionChipActive : undefined]}
          >
            <Text style={styles.optionText}>{option}</Text>
          </Pressable>
        ))}
        {canOfferCreate && (
          <Pressable onPress={handleCreate} style={[styles.optionChip, styles.createChip]}>
            <Text style={styles.optionText}>Create "{value.trim()}"</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  label: {
    color: '#f5f5f7',
    fontWeight: '600',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    color: '#f5f5f7',
    backgroundColor: '#1f1f27',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helperText: {
    color: '#9ea0a8',
    fontSize: 12,
  },
  errorText: {
    color: '#ff8c8c',
  },
  optionRow: {
    gap: 8,
    paddingVertical: 2,
  },
  optionChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3a3a44',
    backgroundColor: '#252531',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionChipActive: {
    borderColor: '#7b8cff',
  },
  createChip: {
    borderColor: '#4f8e63',
    backgroundColor: '#1e3529',
  },
  optionText: {
    color: '#f5f5f7',
    fontSize: 12,
  },
})
