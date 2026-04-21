import { useCallback, useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import {
    fetchGlobalEntries,
    fetchGlobalEntriesWithFilters,
    toggleGlobalEntryFavorite,
} from '@common/api'
import { formatWorkflowFieldLabel, getFilterableFields, getGlobalPickerFilters, getGlobalThumbnailField, isFavoritableGlobal, type GlobalPickerFilter } from '@common/workflow'
import CloudinaryImage from './CloudinaryImage'

export interface GlobalEntryPickerProps {
    globalName: string
    open: boolean
    onClose: () => void
    /** Called when the user selects an entry. Receives the entry id and name. */
    onSelect: (entry: { id: string; name: string }) => void
}

interface NamedRef {
    id: string
    name: string
}

// ---------------------------------------------------------------------------
// Generic entry shape: the minimal fields every global entry exposes plus
// an index signature so we can read related-filter chip data by string key.
// ---------------------------------------------------------------------------
interface GenericGlobalEntry {
    id: string
    name?: string
    is_favorite?: boolean
    is_public?: boolean
    [key: string]: unknown
}

interface FilterState {
    boolFilters: Record<string, boolean | null>
    onlyFavorites: boolean
    /** Keyed by GlobalPickerFilter.paramKey; value is NamedRef[] (multi) or NamedRef|null (single). */
    relatedFilters: Record<string, NamedRef[] | NamedRef | null>
}

function makeEmptyFilters(
    boolFieldNames: string[],
    relatedFilters: GlobalPickerFilter[]
): FilterState {
    return {
        boolFilters: Object.fromEntries(boolFieldNames.map((name) => [name, null])),
        onlyFavorites: false,
        relatedFilters: Object.fromEntries(
            relatedFilters.map((f) => [f.paramKey, f.multiple ? [] : null])
        ),
    }
}

function buildParams(
    f: FilterState,
    boolFieldNames: string[],
    relatedFilters: GlobalPickerFilter[]
): Record<string, string> {
    const params: Record<string, string> = {}
    for (const name of boolFieldNames) {
        if (f.boolFilters[name] !== null) {
            params[name] = String(f.boolFilters[name])
        }
    }
    for (const rf of relatedFilters) {
        const val = f.relatedFilters[rf.paramKey]
        if (rf.multiple) {
            const arr = val as NamedRef[]
            if (arr.length) params[rf.paramKey] = arr.map((r) => r.id).join(',')
        } else {
            const single = val as NamedRef | null
            if (single !== null) params[rf.paramKey] = single.id
        }
    }
    return params
}

export default function GlobalEntryPicker({ globalName, open, onClose, onSelect }: GlobalEntryPickerProps) {
    const boolFilterableFields = getFilterableFields(globalName)
    const boolFieldNames = boolFilterableFields.map((f) => f.name)
    const favoritable = isFavoritableGlobal(globalName)
    const thumbnailField = getGlobalThumbnailField(globalName)
    const relatedFilterDefs = getGlobalPickerFilters(globalName)

    const [filters, setFilters] = useState<FilterState>(() =>
        makeEmptyFilters(boolFieldNames, relatedFilterDefs)
    )
    const [relatedOptions, setRelatedOptions] = useState<Record<string, NamedRef[]>>({})
    const [entries, setEntries] = useState<GenericGlobalEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [entriesError, setEntriesError] = useState<string | null>(null)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    // Fetch autocomplete options for each related-filter global when the dialog opens.
    useEffect(() => {
        if (!open || relatedFilterDefs.length === 0) return
        for (const rf of relatedFilterDefs) {
            fetchGlobalEntries(rf.optionsGlobalName)
                .then((es) =>
                    setRelatedOptions((prev) => ({
                        ...prev,
                        [rf.paramKey]: es.map((e) => ({ id: e.id, name: e.name })),
                    }))
                )
                .catch(() => {})
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, globalName])

    const loadEntries = useCallback(
        (f: FilterState) => {
            setLoading(true)
            setEntriesError(null)
            const params = buildParams(f, boolFieldNames, relatedFilterDefs)
            fetchGlobalEntriesWithFilters<GenericGlobalEntry>(globalName, params)
                .then((results) => {
                    setEntries(results)
                    setEntriesError(null)
                })
                .catch(() => {
                    setEntriesError('Failed to load entries. Please try again.')
                })
                .finally(() => setLoading(false))
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [globalName]
    )

    useEffect(() => {
        if (!open) return
        loadEntries(filters)
    }, [open, filters, loadEntries])

    function handleBoolFilter(field: string, checked: boolean, value: boolean) {
        setFilters((prev) => ({
            ...prev,
            boolFilters: {
                ...prev.boolFilters,
                [field]: checked ? value : prev.boolFilters[field] === value ? null : prev.boolFilters[field],
            },
        }))
    }

    function handleGlobalPickerFilter(paramKey: string, val: NamedRef[] | NamedRef | null) {
        setFilters((prev) => ({
            ...prev,
            relatedFilters: { ...prev.relatedFilters, [paramKey]: val },
        }))
    }

    async function handleToggleFavorite(entry: GenericGlobalEntry) {
        setTogglingId(entry.id)
        try {
            await toggleGlobalEntryFavorite(globalName, entry.id, !entry.is_favorite)
            setEntries((prev) =>
                prev.map((e) => (e.id === entry.id ? { ...e, is_favorite: !e.is_favorite } : e))
            )
        } finally {
            setTogglingId(null)
        }
    }

    function handleClose() {
        setFilters(makeEmptyFilters(boolFieldNames, relatedFilterDefs))
        onClose()
    }

    const visible = filters.onlyFavorites ? entries.filter((e) => e.is_favorite) : entries

    const dialogTitle = `Browse ${formatWorkflowFieldLabel(globalName)}s`

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { height: '85vh', display: 'flex', flexDirection: 'column' } }}
        >
            <DialogTitle>{dialogTitle}</DialogTitle>
            {/* Filters — sticky, never scroll away */}
            <Box sx={{ px: 3, pt: 1, pb: 2, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
                <Stack spacing={2}>
                    {/* Related-object filters (from registry) */}
                    {relatedFilterDefs.map((rf) =>
                        rf.multiple ? (
                            <Autocomplete
                                key={rf.paramKey}
                                multiple
                                options={relatedOptions[rf.paramKey] ?? []}
                                getOptionLabel={(o) => o.name}
                                value={(filters.relatedFilters[rf.paramKey] as NamedRef[]) ?? []}
                                onChange={(_e, val) => handleGlobalPickerFilter(rf.paramKey, val)}
                                renderInput={(params) => (
                                    <TextField {...params} label={rf.label} size="small" />
                                )}
                                size="small"
                            />
                        ) : (
                            <Autocomplete
                                key={rf.paramKey}
                                options={relatedOptions[rf.paramKey] ?? []}
                                getOptionLabel={(o) => o.name}
                                value={(filters.relatedFilters[rf.paramKey] as NamedRef | null) ?? null}
                                onChange={(_e, val) => handleGlobalPickerFilter(rf.paramKey, val)}
                                renderInput={(params) => (
                                    <TextField {...params} label={rf.label} size="small" />
                                )}
                                size="small"
                            />
                        )
                    )}

                    {/* Boolean property filters — derived from workflow.yml filterable fields */}
                    {boolFilterableFields.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                            {boolFilterableFields.map(({ name, label }) => (
                                <Box key={name}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
                                        {label}
                                    </Typography>
                                    <FormGroup row>
                                        <FormControlLabel
                                            label="Yes"
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={filters.boolFilters[name] === true}
                                                    onChange={(e) => handleBoolFilter(name, e.target.checked, true)}
                                                />
                                            }
                                        />
                                        <FormControlLabel
                                            label="No"
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={filters.boolFilters[name] === false}
                                                    onChange={(e) => handleBoolFilter(name, e.target.checked, false)}
                                                />
                                            }
                                        />
                                    </FormGroup>
                                </Box>
                            ))}
                        </Box>
                    )}

                    {/* Only favorites toggle — shown only for favoritable globals */}
                    {favoritable && (
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={filters.onlyFavorites}
                                    onChange={(e) =>
                                        setFilters((prev) => ({ ...prev, onlyFavorites: e.target.checked }))
                                    }
                                />
                            }
                            label="Only favorites"
                        />
                    )}
                </Stack>
            </Box>

            {/* Scrollable results */}
            <DialogContent sx={{ flex: 1, overflowY: 'auto', pt: 2 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : entriesError ? (
                    <Alert severity="error" sx={{ my: 2 }}>{entriesError}</Alert>
                ) : visible.length === 0 ? (
                    <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No entries match the current filters.
                    </Typography>
                ) : (
                    <Stack spacing={1}>
                        {visible.map((entry) => {
                            const thumbnailUrl = thumbnailField ? (entry[thumbnailField] as string | undefined) : undefined
                            return (
                                <Box
                                    key={entry.id}
                                    onClick={() => {
                                        onSelect({ id: entry.id, name: entry.name ?? '' })
                                        handleClose()
                                    }}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 2,
                                        p: 1.5,
                                        borderRadius: 1,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        cursor: 'pointer',
                                        '&:hover': { bgcolor: 'action.hover' },
                                    }}
                                >
                                    {/* Thumbnail — rendered when a thumbnail field is declared in workflow.yml */}
                                    {thumbnailField && (
                                        thumbnailUrl ? (
                                            <CloudinaryImage
                                                url={thumbnailUrl}
                                                alt={entry.name ?? ''}
                                                context="thumbnail"
                                            />
                                        ) : (
                                            <Box
                                                sx={{
                                                    width: 64,
                                                    height: 64,
                                                    flexShrink: 0,
                                                    bgcolor: 'action.disabledBackground',
                                                    borderRadius: 1,
                                                }}
                                            />
                                        )
                                    )}

                                    {/* Name and related-filter chips */}
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body1" fontWeight="medium" noWrap>
                                            {entry.name}
                                        </Typography>
                                        {/* Chips for related-filter fields */}
                                        {relatedFilterDefs.some((rf) => entry[rf.entryKey]) && (
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                                {relatedFilterDefs.map((rf) => {
                                                    const val = entry[rf.entryKey]
                                                    if (!val) return null
                                                    if (rf.multiple) {
                                                        return (val as NamedRef[]).map((ref) => (
                                                            <Chip key={ref.id} label={ref.name} size="small" />
                                                        ))
                                                    }
                                                    const ref = val as NamedRef
                                                    return (
                                                        <Chip
                                                            key={rf.paramKey}
                                                            label={ref.name}
                                                            size="small"
                                                            variant="outlined"
                                                            color="secondary"
                                                        />
                                                    )
                                                })}
                                                {entry.is_public && (
                                                    <Chip label="public" size="small" variant="outlined" />
                                                )}
                                            </Box>
                                        )}
                                    </Box>

                                    {/* Favorite button — shown only for favoritable globals */}
                                    {favoritable && (
                                        <IconButton
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleToggleFavorite(entry)
                                            }}
                                            disabled={togglingId === entry.id}
                                            size="small"
                                            aria-label={entry.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                                        >
                                            {entry.is_favorite ? (
                                                <StarIcon fontSize="small" color="warning" />
                                            ) : (
                                                <StarBorderIcon fontSize="small" />
                                            )}
                                        </IconButton>
                                    )}
                                </Box>
                            )
                        })}
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}
