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
    toggleFavoriteGlazeCombination,
    type GlazeCombinationEntry,
    type GlazeCombinationFilters,
    type GlazeTypeRef,
} from '@common/api'
import CloudinaryImage from './CloudinaryImage'

export interface GlazeCombinationPickerProps {
    open: boolean
    onClose: () => void
    /** Called when the user selects a combination. Receives the combination name. */
    onSelect: (name: string) => void
}

interface FilterState {
    glazeTypes: GlazeTypeRef[]
    isFoodSafe: boolean | null
    runs: boolean | null
    highlightsGrooves: boolean | null
    isDifferentOnWhiteAndBrownClay: boolean | null
    onlyFavorites: boolean
}

const EMPTY_FILTERS: FilterState = {
    glazeTypes: [],
    isFoodSafe: null,
    runs: null,
    highlightsGrooves: null,
    isDifferentOnWhiteAndBrownClay: null,
    onlyFavorites: false,
}

// TODO(#81): replace NullableBoolField and BOOL_FILTER_LABELS with filterable field
// metadata imported from getFilterableFields('glaze_combination') in workflow.ts once
// filter metadata is declared in workflow.yml.
// https://github.com/shaoster/glaze/issues/81
type NullableBoolField = 'isFoodSafe' | 'runs' | 'highlightsGrooves' | 'isDifferentOnWhiteAndBrownClay'

const BOOL_FILTER_LABELS: Record<NullableBoolField, string> = {
    isFoodSafe: 'Food safe',
    runs: 'Runs',
    highlightsGrooves: 'Highlights grooves',
    isDifferentOnWhiteAndBrownClay: 'Different on white/brown clay',
}

function filtersToApi(f: FilterState): GlazeCombinationFilters {
    const out: GlazeCombinationFilters = {}
    if (f.glazeTypes.length) out.glazeTypeIds = f.glazeTypes.map((gt) => gt.id)
    if (f.isFoodSafe !== null) out.isFoodSafe = f.isFoodSafe
    if (f.runs !== null) out.runs = f.runs
    if (f.highlightsGrooves !== null) out.highlightsGrooves = f.highlightsGrooves
    if (f.isDifferentOnWhiteAndBrownClay !== null)
        out.isDifferentOnWhiteAndBrownClay = f.isDifferentOnWhiteAndBrownClay
    return out
}

export default function GlazeCombinationPicker({ open, onClose, onSelect }: GlazeCombinationPickerProps) {
    const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
    const [allGlazeTypes, setAllGlazeTypes] = useState<GlazeTypeRef[]>([])
    const [combinations, setCombinations] = useState<GlazeCombinationEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [togglingId, setTogglingId] = useState<string | null>(null)

    // Load all available glaze types for the type filter autocomplete.
    useEffect(() => {
        if (!open) return
        fetchGlobalEntries('glaze_type')
            .then((entries) => setAllGlazeTypes(entries.map((e) => ({ id: e.name, name: e.name }))))
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

    function handleBoolFilter(field: NullableBoolField, checked: boolean, value: boolean) {
        setFilters((prev) => ({
            ...prev,
            [field]: checked ? value : prev[field] === value ? null : prev[field],
        }))
    }

    async function handleToggleFavorite(combo: GlazeCombinationEntry) {
        setTogglingId(combo.id)
        try {
            await toggleFavoriteGlazeCombination(combo.id, !combo.isFavorite)
            setCombinations((prev) =>
                prev.map((c) => (c.id === combo.id ? { ...c, isFavorite: !c.isFavorite } : c))
            )
        } finally {
            setTogglingId(null)
        }
    }

    function handleClose() {
        setFilters(EMPTY_FILTERS)
        onClose()
    }

    const visible = filters.onlyFavorites ? combinations.filter((c) => c.isFavorite) : combinations

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>Browse Glaze Combinations</DialogTitle>
            <DialogContent>
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

                    {/* Boolean property filters */}
                    <FormGroup row sx={{ gap: 1 }}>
                        {(Object.entries(BOOL_FILTER_LABELS) as [NullableBoolField, string][]).map(
                            ([field, label]) => (
                                <Box key={field} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <FormControlLabel
                                        label={`${label}: yes`}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={filters[field] === true}
                                                onChange={(e) => handleBoolFilter(field, e.target.checked, true)}
                                            />
                                        }
                                    />
                                    <FormControlLabel
                                        label="no"
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={filters[field] === false}
                                                onChange={(e) => handleBoolFilter(field, e.target.checked, false)}
                                            />
                                        }
                                    />
                                </Box>
                            )
                        )}
                    </FormGroup>

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

                    {/* Results */}
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
                                        onSelect(combo.name)
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
                                    {combo.testTileImage ? (
                                        <CloudinaryImage
                                            url={combo.testTileImage}
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
                                            {combo.glazeTypes.map((gt) => (
                                                <Chip key={gt.id} label={gt.name} size="small" />
                                            ))}
                                            {combo.isPublic && (
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
                                        aria-label={combo.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                    >
                                        {combo.isFavorite ? (
                                            <StarIcon fontSize="small" color="warning" />
                                        ) : (
                                            <StarBorderIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </Box>
                            ))}
                        </Stack>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}
