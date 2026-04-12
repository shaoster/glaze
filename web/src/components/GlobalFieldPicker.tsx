import { useEffect, useMemo, useState } from 'react'
import Autocomplete, { createFilterOptions } from '@mui/material/Autocomplete'
import { CircularProgress, TextField } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { createGlobalEntry, fetchGlobalEntries, type GlobalEntry } from '@common/api'
import { getGlobalDisplayField } from '@common/workflow'

// Pre-built filter; module-level to avoid reconstruction on every render.
const FILTER = createFilterOptions<string>()

const PUBLIC_SUFFIX = ' (public)'

/**
 * Returns the display label for a global entry. When a public entry shares its
 * name with a private entry in the same list, the public entry is labelled with
 * a "(public)" suffix so users can distinguish the two.
 */
function buildDisplayOptions(entries: GlobalEntry[]): string[] {
    const privateNames = new Set(entries.filter((e) => !e.isPublic).map((e) => e.name))
    return entries.map((e) => (e.isPublic && privateNames.has(e.name) ? e.name + PUBLIC_SUFFIX : e.name))
}

/** Strips the "(public)" suffix added for display disambiguation, returning the raw name. */
export function stripPublicSuffix(displayName: string): string {
    return displayName.endsWith(PUBLIC_SUFFIX)
        ? displayName.slice(0, -PUBLIC_SUFFIX.length)
        : displayName
}

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
    options?: GlobalEntry[]
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
    const [internalEntries, setInternalEntries] = useState<GlobalEntry[]>([])
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const entries = optionsProp ?? internalEntries

    // Display strings: public entries whose name also appears as a private entry
    // get a "(public)" suffix so users can distinguish the two.
    const displayOptions = useMemo(() => buildDisplayOptions(entries), [entries])

    useEffect(() => {
        if (optionsProp !== undefined) return
        fetchGlobalEntries(globalName)
            .then(setInternalEntries)
            .catch(() => {})
    }, [globalName, optionsProp])

    async function handleChange(displayOption: string | null) {
        if (!displayOption) {
            onChange('')
            return
        }
        const createValue = parseCreateOption(displayOption)
        if (createValue) {
            setCreating(true)
            setError(null)
            try {
                const createdName = await createGlobalEntry(globalName, fieldName, createValue)
                if (optionsProp === undefined) {
                    // Caller owns the list when optionsProp is provided; only
                    // update internal state when managing the list ourselves.
                    setInternalEntries((prev) => {
                        const merged = [...prev, { name: createdName, isPublic: false }]
                        merged.sort((a, b) => a.name.localeCompare(b.name))
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
        // Strip display suffix before emitting the raw name.
        onChange(stripPublicSuffix(displayOption))
    }

    return (
        <Autocomplete
            freeSolo={canCreate}
            options={displayOptions}
            inputValue={value}
            onInputChange={(_e, val) => onChange(val)}
            onChange={(_e, val) => handleChange(val ?? null)}
            filterOptions={(opts, params) => {
                const filtered = FILTER(opts, params)
                const { inputValue } = params
                // Check against raw names (strip suffix) so typing "Stoneware"
                // is treated as an existing entry even when displayed as "Stoneware (public)".
                const isExisting = entries.some((e) => inputValue === e.name)
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
