import { useCallback, useEffect, useState } from 'react'
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
    fetchGlazeCombinations,
    fetchGlobalEntries,
    toggleGlobalEntryFavorite,
    type GlazeCombinationEntry,
    type GlazeCombinationFilters,
    type GlazeTypeRef,
} from '@common/api'
import { getFilterableFields } from '@common/workflow'
import CloudinaryImage from './CloudinaryImage'

const BOOL_FILTERABLE_FIELDS = getFilterableFields('glaze_combination')

export interface GlazeCombinationPickerProps {
    open: boolean
    onClose: () => void
    /** Called when the user selects a combination. Receives the combination name. */
    onSelect: (name: string) => void
}

interface FiringTemperatureOption {
    id: string
    name: string
}

// TODO(#83): make this component generic (GlobalEntryPicker) accepting a globalName prop.
// The filter UI, API calls, and favorites support should all be derived from workflow
// metadata and generic API functions rather than being hardcoded to glaze_combination.
// Depends on #82 (generic favorite toggle). https://github.com/shaoster/glaze/issues/83

interface FilterState {
    glazeTypes: GlazeTypeRef[]
    firingTemperature: FiringTemperatureOption | null
    // Boolean filters keyed by snake_case field name from workflow.yml.
    boolFilters: Record<string, boolean | null>
    onlyFavorites: boolean
}

const EMPTY_FILTERS: FilterState = {
    glazeTypes: [],
    firingTemperature: null,
    boolFilters: Object.fromEntries(BOOL_FILTERABLE_FIELDS.map((f) => [f.name, null])),
    onlyFavorites: false,
}

function snakeToCamel(s: string): string {
    return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

function filtersToApi(f: FilterState): GlazeCombinationFilters {
    const out: GlazeCombinationFilters = {}
    if (f.glazeTypes.length) out.glazeTypeIds = f.glazeTypes.map((gt) => gt.id)
    if (f.firingTemperature !== null) out.firingTemperatureId = f.firingTemperature.id
    for (const [field, value] of Object.entries(f.boolFilters)) {
        if (value !== null) {
            // GlazeCombinationFilters uses camelCase keys matching the snake_case field names.
            (out as Record<string, unknown>)[snakeToCamel(field)] = value
        }
    }
    return out
}

export default function GlazeCombinationPicker({ open, onClose, onSelect }: GlazeCombinationPickerProps) {
    const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
    const [allGlazeTypes, setAllGlazeTypes] = useState<GlazeTypeRef[]>([])
    const [allFiringTemperatures, setAllFiringTemperatures] = useState<FiringTemperatureOption[]>([])
    const [combinations, setCombinations] = useState<GlazeCombinationEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    // Load all available glaze types and firing temperatures for filter autocompletes.
    useEffect(() => {
        if (!open) return
        fetchGlobalEntries('glaze_type')
            .then((entries) => setAllGlazeTypes(entries.map((e) => ({ id: e.id, name: e.name }))))
            .catch(() => {})
        fetchGlobalEntries('firing_temperature')
            .then((entries) => setAllFiringTemperatures(entries.map((e) => ({ id: e.id, name: e.name }))))
            .catch(() => {})
    }, [open])

    const loadCombinations = useCallback((f: FilterState) => {
        setLoading(true)
        fetchGlazeCombinations(filtersToApi(f))
            .then(setCombinations)
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    // Reload whenever the dialog opens or filters change.
    useEffect(() => {
        if (!open) return
        loadCombinations(filters)
    }, [open, filters, loadCombinations])

    function handleBoolFilter(field: string, checked: boolean, value: boolean) {
        setFilters((prev) => ({
            ...prev,
            boolFilters: {
                ...prev.boolFilters,
                [field]: checked ? value : prev.boolFilters[field] === value ? null : prev.boolFilters[field],
            },
        }))
    }

    async function handleToggleFavorite(combo: GlazeCombinationEntry) {
        setTogglingId(combo.id)
        try {
            await toggleGlobalEntryFavorite('glaze_combination', combo.id, !combo.is_favorite)
            setCombinations((prev) =>
                prev.map((c) => (c.id === combo.id ? { ...c, is_favorite: !c.is_favorite } : c))
            )
        } finally {
            setTogglingId(null)
        }
    }

    function handleClose() {
        setFilters(EMPTY_FILTERS)
        onClose()
    }

    const visible = filters.onlyFavorites ? combinations.filter((c) => c.is_favorite) : combinations

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { height: '85vh', display: 'flex', flexDirection: 'column' } }}
        >
            <DialogTitle>Browse Glaze Combinations</DialogTitle>
            {/* Filters — sticky, never scroll away */}
            <Box sx={{ px: 3, pt: 1, pb: 2, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
                <Stack spacing={2}>
                    {/* Glaze type filter */}
                    <Autocomplete
                        multiple
                        options={allGlazeTypes}
                        getOptionLabel={(o) => o.name}
                        value={filters.glazeTypes}
                        onChange={(_e, val) => setFilters((prev) => ({ ...prev, glazeTypes: val }))}
                        renderInput={(params) => (
                            <TextField {...params} label="Contains glaze types (all must match)" size="small" />
                        )}
                        size="small"
                    />

                    {/* Firing temperature filter */}
                    <Autocomplete
                        options={allFiringTemperatures}
                        getOptionLabel={(o) => o.name}
                        value={filters.firingTemperature}
                        onChange={(_e, val) => setFilters((prev) => ({ ...prev, firingTemperature: val }))}
                        renderInput={(params) => (
                            <TextField {...params} label="Firing temperature" size="small" />
                        )}
                        size="small"
                    />

                    {/* Boolean property filters — derived from workflow.yml filterable fields */}
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                        {BOOL_FILTERABLE_FIELDS.map(({ name, label }) => (
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

                    {/* Only favorites toggle */}
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
                </Stack>
            </Box>

            {/* Scrollable results */}
            <DialogContent sx={{ flex: 1, overflowY: 'auto', pt: 2 }}>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : visible.length === 0 ? (
                    <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                        No combinations match the current filters.
                    </Typography>
                ) : (
                    <Stack spacing={1}>
                        {visible.map((combo) => (
                                <Box
                                    key={combo.id}
                                    onClick={() => {
                                        onSelect(combo.name ?? '')
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
                                    {/* Test tile thumbnail */}
                                    {combo.test_tile_image ? (
                                        <CloudinaryImage
                                            url={combo.test_tile_image}
                                            alt={combo.name}
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
                                    )}

                                    {/* Name and glaze type chips */}
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body1" fontWeight="medium" noWrap>
                                            {combo.name}
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                            {combo.glaze_types.map((gt) => (
                                                <Chip key={gt.id} label={gt.name} size="small" />
                                            ))}
                                            {combo.firing_temperature && (
                                                <Chip
                                                    label={combo.firing_temperature.name}
                                                    size="small"
                                                    variant="outlined"
                                                    color="secondary"
                                                />
                                            )}
                                            {combo.is_public && (
                                                <Chip label="public" size="small" variant="outlined" />
                                            )}
                                        </Box>
                                    </Box>

                                    {/* Favorite button */}
                                    <IconButton
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleToggleFavorite(combo)
                                        }}
                                        disabled={togglingId === combo.id}
                                        size="small"
                                        aria-label={combo.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                                    >
                                        {combo.is_favorite ? (
                                            <StarIcon fontSize="small" color="warning" />
                                        ) : (
                                            <StarBorderIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </Box>
                            ))}
                        </Stack>
                    )}
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}
