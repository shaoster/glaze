import { useEffect, useState } from 'react'
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import { CircularProgress, TextField } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { createGlobalEntry, fetchGlobalEntries } from '../api'
import { getGlobalDisplayField } from '../workflow'

// Pre-built filter; module-level to avoid reconstruction on every render.
const FILTER = createFilterOptions<string>()

// Sentinel prefix/suffix injected into the Autocomplete option list to signal
// "create this as a new entry" vs selecting an existing one.
const CREATE_OPTION_PREFIX = 'Create "'
const CREATE_OPTION_SUFFIX = '"'

/** Wraps a user-typed label in the create sentinel so it can be injected into the option list. */
export function buildCreateOption(label: string): string {
    return `${CREATE_OPTION_PREFIX}${label}${CREATE_OPTION_SUFFIX}`
}

/**
 * Returns the raw label if `option` is a create sentinel, or `null` if it is a
 * real existing value. Use this to distinguish the two in `onChange` handlers.
 */
export function parseCreateOption(option: string): string | null {
    if (option.startsWith(CREATE_OPTION_PREFIX) && option.endsWith(CREATE_OPTION_SUFFIX)) {
        return option.slice(CREATE_OPTION_PREFIX.length, -CREATE_OPTION_SUFFIX.length)
    }
    return null
}

export interface GlobalFieldPickerProps {
    /** Name of the globals entry in workflow.yml (e.g. `'location'`). */
    globalName: string
    /** Label shown on the TextField. */
    label: string
    /** Controlled input value. */
    value: string
    /** Called with the new value whenever the user selects, types, or clears. */
    onChange: (value: string) => void
    /** Descriptive helper text shown below the field when there is no error. */
    helperText?: string
    /** Marks the field as required. */
    required?: boolean
    /**
     * Whether to allow inline creation of new entries via the "Create '...'"
     * sentinel option. Also controls `freeSolo` on the underlying Autocomplete.
     * Defaults to `true`.
     */
    canCreate?: boolean
    /**
     * Option list to display. When omitted, the component fetches entries for
     * `globalName` on mount and manages the list internally — including
     * optimistic insertion after a successful create. When provided, the caller
     * owns the list and is responsible for refreshing it after a create.
     */
    options?: string[]
    sx?: SxProps<Theme>
}

/**
 * Autocomplete picker for a workflow.yml global type (e.g. locations, kilns).
 *
 * When `canCreate` is true (the default), the user can type a new value and
 * select the injected "Create '...'" sentinel option to create it inline via
 * `createGlobalEntry`. When `canCreate` is false the picker is a strict
 * selector with no create option.
 *
 * When `options` is omitted the component fetches and manages its own list;
 * when provided the caller owns the list.
 */
export default function GlobalFieldPicker({
    globalName,
    label,
    value,
    onChange,
    helperText,
    required,
    canCreate = false,
    options: optionsProp,
    sx,
}: GlobalFieldPickerProps) {
    const fieldName = getGlobalDisplayField(globalName)
    const [internalOptions, setInternalOptions] = useState<string[]>([])
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const options = optionsProp ?? internalOptions

    useEffect(() => {
        if (optionsProp !== undefined) return
        fetchGlobalEntries(globalName)
            .then(setInternalOptions)
            .catch(() => {})
    }, [globalName, optionsProp])

    async function handleChange(option: string | null) {
        if (!option) {
            onChange('')
            return
        }
        const createValue = parseCreateOption(option)
        if (createValue) {
            setCreating(true)
            setError(null)
            try {
                const createdName = await createGlobalEntry(globalName, fieldName, createValue)
                if (optionsProp === undefined) {
                    // Caller owns the list when optionsProp is provided; only
                    // update internal state when managing the list ourselves.
                    setInternalOptions((prev) => {
                        const merged = Array.from(new Set([...prev, createdName]))
                        merged.sort()
                        return merged
                    })
                }
                onChange(createdName)
            } catch {
                setError(`Failed to create ${label.toLowerCase()}. Please try again.`)
            } finally {
                setCreating(false)
            }
            return
        }
        onChange(option)
    }

    return (
        <Autocomplete
            freeSolo={canCreate}
            options={options}
            inputValue={value}
            onInputChange={(_e, val) => onChange(val)}
            onChange={(_e, val) => handleChange(val ?? null)}
            filterOptions={(opts, params) => {
                const filtered = FILTER(opts, params)
                const { inputValue } = params
                const isExisting = opts.some((opt) => inputValue === opt)
                if (canCreate && inputValue !== '' && !isExisting) {
                    filtered.push(buildCreateOption(inputValue))
                }
                return filtered
            }}
            disabled={creating}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    fullWidth
                    sx={sx}
                    helperText={error ?? helperText ?? ''}
                    error={Boolean(error)}
                    required={required}
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            endAdornment: (
                                <>
                                    {creating && <CircularProgress size={16} sx={{ mr: 1 }} />}
                                    {params.InputProps.endAdornment}
                                </>
                            ),
                        },
                    }}
                />
            )}
        />
    )
}
