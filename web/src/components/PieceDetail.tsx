import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
    Alert,
    Box,
    Button,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    IconButton,
    List,
    ListItem,
    ListItemText,
    Snackbar,
    TextField,
    Typography,
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import { useBlocker } from 'react-router-dom'
import type { CaptionedImage, PieceDetail as PieceDetailType, TagEntry } from '@common/types'
import { formatState, SUCCESSORS } from '@common/types'
import { addPieceState, createTagEntry, fetchGlobalEntries, updatePiece } from '@common/api'
import ImageLightbox from './ImageLightbox'
import CloudinaryImage from './CloudinaryImage'
import WorkflowState from './WorkflowState'
import { pickDefaultTagColor } from './tagPalette'
import TagAutocomplete from './TagAutocomplete'
import CreateTagDialog from './CreateTagDialog'
import TagChipList from './TagChipList'

const DUPLICATE_TAG_ERROR = 'A tag with that name already exists. Choose the existing tag or enter a different name.'
const TAG_ATTACH_SNACKBAR_ERROR = 'Failed to attach the selected tag. Please check your connection and try again.'
const DEFAULT_STATE_COLOR = 'oklch(0.66 0.17 35)'
const COMPLETED_STATE_COLOR = 'oklch(0.72 0.17 145)'
const RECYCLED_STATE_COLOR = 'oklch(0.63 0.23 25)'

type PieceDetailProps = {
    piece: PieceDetailType
    onPieceUpdated: (updated: PieceDetailType) => void
}

type StateChipProps = {
    state: string
    label: string
    current?: boolean
    muted?: boolean
    onClick?: () => void
    disabled?: boolean
    onHoverStart?: () => void
    onHoverEnd?: () => void
}

function getStateColor(state: string): string {
    if (state === 'completed') {
        return COMPLETED_STATE_COLOR
    }
    if (state === 'recycled') {
        return RECYCLED_STATE_COLOR
    }
    return DEFAULT_STATE_COLOR
}

function StateChip({
    state,
    label,
    current = false,
    muted = false,
    onClick,
    disabled = false,
    onHoverStart,
    onHoverEnd,
}: StateChipProps) {
    const color = getStateColor(state)
    const mutedColor = 'oklch(0.62 0 0)'
    const outlineColor = current && muted ? `color-mix(in oklab, ${mutedColor} 55%, transparent)` : color
    const backgroundColor = current
        ? muted
            ? `color-mix(in oklab, ${mutedColor} 14%, transparent)`
            : `color-mix(in oklab, ${color} 18%, transparent)`
        : 'transparent'
    const dotFillColor = current ? (muted ? `color-mix(in oklab, ${mutedColor} 45%, white)` : color) : 'transparent'
    const stateChipSx = {
        borderRadius: 999,
        border: '1px solid',
        borderColor: outlineColor,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        fontWeight: 500,
        lineHeight: 1,
        minHeight: current ? 28 : 24,
        px: current ? 1.25 : 1,
        py: current ? 0.5 : 0.25,
        textTransform: 'none',
        whiteSpace: 'nowrap',
        width: 'fit-content',
        color: current && muted ? `color-mix(in oklab, ${mutedColor} 80%, black)` : color,
        backgroundColor,
        borderStyle: current ? 'solid' : 'dashed',
        fontSize: current ? '0.85rem' : '0.8125rem',
        boxShadow: 'none',
    }
    const dot = (
        <Box
            component="span"
            className="state-chip-dot"
            sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                border: `1.5px solid ${outlineColor}`,
                backgroundColor: dotFillColor,
                flexShrink: 0,
            }}
        />
    )
    const content = (
        <>
            {dot}
            <Box component="span">{label}</Box>
        </>
    )

    if (onClick) {
        return (
            <Button
                onClick={onClick}
                disabled={disabled}
                variant="text"
                sx={{
                    ...stateChipSx,
                    justifyContent: 'flex-start',
                    minWidth: 0,
                    '&:hover': {
                        borderStyle: 'solid',
                        borderColor: color,
                        backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                        '& .state-chip-dot': {
                            backgroundColor: color,
                        },
                    },
                    '&.Mui-disabled': {
                        color: `color-mix(in oklab, ${color} 55%, white)`,
                        borderColor: `color-mix(in oklab, ${color} 55%, white)`,
                    },
                }}
                onMouseEnter={onHoverStart}
                onMouseLeave={onHoverEnd}
                onFocus={onHoverStart}
                onBlur={onHoverEnd}
            >
                {content}
            </Button>
        )
    }

    return (
        <Box component="span" sx={stateChipSx}>
            {content}
        </Box>
    )
}

type StateBranchConnectorProps = {
    count: number
}

function StateBranchConnector({ count }: StateBranchConnectorProps) {
    const connectorCount = Math.max(count, 1)
    const height = connectorCount === 1 ? 24 : connectorCount * 28 - 4
    const centerY = height / 2
    const targetYs = connectorCount === 1
        ? [centerY]
        : Array.from({ length: connectorCount }, (_, index) => {
            const start = 10
            const end = height - 10
            return start + ((end - start) * index) / (connectorCount - 1)
        })

    return (
        <Box
            component="svg"
            aria-hidden="true"
            sx={(theme) => ({
                width: 24,
                height,
                flexShrink: 0,
                overflow: 'visible',
                '--line': theme.palette.divider,
            })}
            viewBox={`0 0 24 ${height}`}
        >
            {targetYs.map((targetY) => (
                <path
                    key={targetY}
                    d={`M 0 ${centerY} Q 12 ${centerY} 24 ${targetY}`}
                    stroke="var(--line)"
                    fill="none"
                    strokeWidth="1"
                />
            ))}
        </Box>
    )
}

export default function PieceDetail({ piece, onPieceUpdated }: PieceDetailProps) {
    const [isDirty, setIsDirty] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
    const [transitionDialogOpen, setTransitionDialogOpen] = useState(false)
    const [pendingTransition, setPendingTransition] = useState<string | null>(null)
    const [transitioning, setTransitioning] = useState(false)
    const [transitionError, setTransitionError] = useState<string | null>(null)
    const [editingName, setEditingName] = useState(false)
    const [nameValue, setNameValue] = useState(piece.name)
    const [nameSaving, setNameSaving] = useState(false)
    const [nameError, setNameError] = useState<string | null>(null)
    const [availableTags, setAvailableTags] = useState<TagEntry[]>([])
    const [selectedTags, setSelectedTags] = useState<TagEntry[]>(piece.tags ?? [])
    const [editingTags, setEditingTags] = useState(false)
    const [draftTags, setDraftTags] = useState<TagEntry[]>(piece.tags ?? [])
    const [tagDialogOpen, setTagDialogOpen] = useState(false)
    const [newTagName, setNewTagName] = useState('')
    const [newTagColor, setNewTagColor] = useState(pickDefaultTagColor(piece.tags.length))
    const [tagSaving, setTagSaving] = useState(false)
    const [tagError, setTagError] = useState<string | null>(null)
    const [tagAttachSnackbarOpen, setTagAttachSnackbarOpen] = useState(false)
    const [hoveredSuccessor, setHoveredSuccessor] = useState<string | null>(null)
    const nameInputRef = useRef<HTMLInputElement>(null)
    const currentState = piece.current_state
    const successors = SUCCESSORS[currentState.state] ?? []
    const isTerminal = successors.length === 0
    const pastHistory = piece.history.slice(0, -1) // all except current (last)
    // Flat list of all images across all past states, in history order.
    const allHistoryImages = useMemo<CaptionedImage[]>(
        () => pastHistory.flatMap((ps) => ps.images),
        [pastHistory]
    )

    // Block navigation when there are unsaved changes
    const blocker = useBlocker(isDirty)

    useEffect(() => {
        setSelectedTags(piece.tags ?? [])
        setDraftTags(piece.tags ?? [])
        setEditingTags(false)
    }, [piece.tags])

    useEffect(() => {
        let cancelled = false
        void fetchGlobalEntries('tag').then((entries) => {
            if (cancelled) return
            setAvailableTags(entries.map((entry) => ({
                id: entry.id,
                name: entry.name,
                color: entry.color ?? '',
                is_public: entry.isPublic,
            })))
        }).catch(() => {
            if (!cancelled) setTagError('Failed to load tags.')
        })
        return () => {
            cancelled = true
        }
    }, [])

    async function handleTransition(nextState: string) {
        setTransitioning(true)
        setTransitionError(null)
        try {
            const updated = await addPieceState(piece.id, { state: nextState as PieceDetailType['current_state']['state'] })
            onPieceUpdated(updated)
            setIsDirty(false)
        } catch {
            setTransitionError('Failed to transition state. Please try again.')
        } finally {
            setTransitioning(false)
            setTransitionDialogOpen(false)
        }
    }

    function openTransitionDialog(next: string) {
        setPendingTransition(next)
        setTransitionDialogOpen(true)
    }

    function closeTransitionDialog() {
        setTransitionDialogOpen(false)
        // pendingTransition is cleared in TransitionProps.onExited to avoid
        // content changing during the dialog close animation.
    }

    function startEditingName() {
        setNameValue(piece.name)
        setNameError(null)
        setEditingName(true)
        // Focus the input on the next tick after it mounts
        setTimeout(() => nameInputRef.current?.focus(), 0)
    }

    function cancelEditingName() {
        setEditingName(false)
        setNameError(null)
        setNameValue(piece.name)
    }

    async function saveName() {
        const trimmed = nameValue.trim()
        if (!trimmed) {
            setNameError('Name cannot be empty.')
            return
        }
        if (trimmed === piece.name) {
            setEditingName(false)
            return
        }
        setNameSaving(true)
        setNameError(null)
        try {
            const updated = await updatePiece(piece.id, { name: trimmed })
            onPieceUpdated(updated)
            setEditingName(false)
        } catch {
            setNameError('Failed to save name. Please try again.')
        } finally {
            setNameSaving(false)
        }
    }

    function startEditingTags() {
        setDraftTags(selectedTags)
        setTagError(null)
        setEditingTags(true)
    }

    async function saveTags(nextTags: TagEntry[]) {
        setTagSaving(true)
        try {
            const updated = await updatePiece(piece.id, { tags: nextTags.map((tag) => tag.id) })
            setSelectedTags(nextTags)
            onPieceUpdated(updated)
            setEditingTags(false)
            return true
        } catch {
            setDraftTags(selectedTags)
            setTagAttachSnackbarOpen(true)
            return false
        } finally {
            setTagSaving(false)
        }
    }

    async function createTag() {
        const trimmed = newTagName.trim()
        if (!trimmed) {
            setTagError('Tag name cannot be empty.')
            return
        }
        const normalizedName = trimmed.toLocaleLowerCase()
        if (availableTags.some((tag) => tag.name.trim().toLocaleLowerCase() === normalizedName)) {
            setTagError(DUPLICATE_TAG_ERROR)
            return
        }
        setTagSaving(true)
        setTagError(null)
        try {
            const created = await createTagEntry({ name: trimmed, color: newTagColor })
            const createdTag = { id: created.id, name: created.name, color: created.color }
            setAvailableTags((prev) => [...prev, createdTag].sort((a, b) => a.name.localeCompare(b.name)))
            setDraftTags((prev) => [...prev, createdTag])
            setTagDialogOpen(false)
            setNewTagName('')
            setNewTagColor(pickDefaultTagColor(trimmed.length))
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 400) {
                setTagError(DUPLICATE_TAG_ERROR)
                return
            }
            setTagError('Failed to create tag. Please try again.')
        } finally {
            setTagSaving(false)
        }
    }

    return (
        <Box sx={{ textAlign: 'left' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                {piece.thumbnail && (
                    <CloudinaryImage
                        url={piece.thumbnail.url}
                        cloudinary_public_id={piece.thumbnail.cloudinary_public_id}
                        alt={piece.name}
                        context="thumbnail"
                        style={{ objectFit: 'cover', borderRadius: 4 }}
                    />
                )}
                <Box sx={{ minWidth: 0 }}>
                    {editingName ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TextField
                                inputRef={nameInputRef}
                                value={nameValue}
                                onChange={(e) => setNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveName()
                                    if (e.key === 'Escape') cancelEditingName()
                                }}
                                size="small"
                                error={!!nameError}
                                helperText={nameError}
                                disabled={nameSaving}
                                slotProps={{ htmlInput: { 'aria-label': 'Piece name', maxLength: 255 } }}
                                sx={{ minWidth: 200 }}
                            />
                            <IconButton
                                aria-label="Save name"
                                onClick={saveName}
                                disabled={nameSaving}
                                size="small"
                                color="primary"
                            >
                                <CheckIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                                aria-label="Cancel name edit"
                                onClick={cancelEditingName}
                                disabled={nameSaving}
                                size="small"
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="h5" component="h2">
                                {piece.name}
                            </Typography>
                            <IconButton
                                aria-label="Edit piece name"
                                onClick={startEditingName}
                                size="small"
                                sx={{ color: 'text.secondary' }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    )}
                    <Box
                        aria-label="State flow"
                        role="group"
                        sx={{
                            mt: 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                        }}
                    >
                        <StateChip
                            state={currentState.state}
                            label={formatState(currentState.state)}
                            current
                            muted={hoveredSuccessor !== null}
                        />
                        {!isTerminal && <StateBranchConnector count={successors.length} />}
                        {!isTerminal && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.75 }}>
                                {successors.map((next) => (
                                    <StateChip
                                        key={next}
                                        state={next}
                                        label={formatState(next)}
                                        onClick={() => openTransitionDialog(next)}
                                        disabled={isDirty || transitioning}
                                        onHoverStart={() => setHoveredSuccessor(next)}
                                        onHoverEnd={() => setHoveredSuccessor((value) => (value === next ? null : value))}
                                    />
                                ))}
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>
            {editingTags ? (
                <Box sx={{ mb: 2 }}>
                <Box
                    sx={{
                        display: 'grid',
                        gap: 1,
                        gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' },
                        alignItems: 'start',
                    }}
                >
                    <TagAutocomplete
                        label="Tags"
                        options={availableTags}
                        value={draftTags}
                        onChange={setDraftTags}
                        disabled={tagSaving}
                        sx={{ minWidth: 0 }}
                    />
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => setTagDialogOpen(true)}
                        disabled={tagSaving}
                        sx={{ width: { xs: '100%', sm: 'auto' }, minWidth: { sm: 88 } }}
                    >
                      New
                    </Button>
                </Box>
                <Button
                    variant="contained"
                    size="small"
                    onClick={() => void saveTags(draftTags)}
                    disabled={tagSaving}
                    aria-label="Save tags"
                    sx={{ mt: 1 }}
                >
                    Save
                </Button>
                </Box>
            ) : (
                <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <TagChipList tags={selectedTags} />
                    <IconButton
                        aria-label="Edit tags"
                        onClick={startEditingTags}
                        disabled={tagSaving}
                        size="small"
                        sx={{ color: 'text.secondary' }}
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>
                </Box>
            )}
            <Divider sx={{ mb: 3 }} />

            {/* Current state form */}
            <WorkflowState
                key={currentState.state + currentState.created.toISOString()}
                pieceState={currentState}
                pieceId={piece.id}
                onSaved={onPieceUpdated}
                onDirtyChange={setIsDirty}
                currentLocation={piece.current_location ?? ''}
                currentThumbnail={piece.thumbnail}
            />

            <Divider sx={{ my: 3 }} />

            {/* State transitions */}
            {isTerminal ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    This piece is in a terminal state (<strong>{formatState(currentState.state)}</strong>). No further transitions are possible.
                </Alert>
            ) : (
                <Box sx={{ mb: 2 }}>
                    {transitionError && (
                        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
                            {transitionError}
                        </Typography>
                    )}
                    {isDirty && (
                        <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                            Save your changes before transitioning to a new state.
                        </Typography>
                    )}
                </Box>
            )}

            {/* History */}
            {pastHistory.length > 0 && (
                <Box>
                    <Button
                        variant="text"
                        onClick={() => setHistoryOpen((o) => !o)}
                        sx={{ mb: 1 }}
                    >
                        {historyOpen ? 'Hide' : 'Show'} history ({pastHistory.length} past state{pastHistory.length !== 1 ? 's' : ''})
                    </Button>
                    <Collapse in={historyOpen}>
                        <List dense>
                            {pastHistory.reduce<{ offset: number; items: React.ReactNode[] }>(
                                ({ offset, items }, ps, i) => {
                                    const stateOffset = offset
                                    items.push(
                                        <ListItem key={i} disableGutters sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                                            <ListItemText
                                                primary={formatState(ps.state)}
                                                secondary={`${ps.created.toLocaleString()}${ps.notes ? ' — ' + ps.notes : ''}`}
                                                slotProps={{
                                                    primary: { sx: { color: 'text.primary' } },
                                                    secondary: { sx: { color: 'text.secondary' } },
                                                }}
                                            />
                                            {ps.images.length > 0 && (
                                                <Box sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 1, mt: 0.5 }}>
                                                    {ps.images.map((img, j) => (
                                                        <Box
                                                            key={j}
                                                            component="button"
                                                            onClick={() => setLightboxIndex(stateOffset + j)}
                                                            aria-label={`View image ${stateOffset + j + 1}`}
                                                            sx={{ p: 0, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 80 }}
                                                        >
                                                            <CloudinaryImage
                                                                url={img.url}
                                                                cloudinary_public_id={img.cloudinary_public_id}
                                                                alt={img.caption || ''}
                                                                context="thumbnail"
                                                                style={{ objectFit: 'cover', borderRadius: 4 }}
                                                            />
                                                            {img.caption && (
                                                                <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'center', wordBreak: 'break-word' }}>
                                                                    {img.caption}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    ))}
                                                </Box>
                                            )}
                                        </ListItem>
                                    )
                                    return { offset: offset + ps.images.length, items }
                                },
                                { offset: 0, items: [] }
                            ).items}
                        </List>
                    </Collapse>
                    {lightboxIndex !== null && (
                        <ImageLightbox
                            images={allHistoryImages}
                            initialIndex={lightboxIndex}
                            onClose={() => setLightboxIndex(null)}
                            currentThumbnailUrl={piece.thumbnail?.url}
                            onSetAsThumbnail={async (image) => {
                                const updated = await updatePiece(piece.id, {
                                    thumbnail: { url: image.url, cloudinary_public_id: image.cloudinary_public_id ?? null },
                                })
                                onPieceUpdated(updated)
                            }}
                        />
                    )}
                </Box>
            )}

            {/* Transition confirmation dialog */}
            <Dialog
                open={transitionDialogOpen}
                onClose={closeTransitionDialog}
                TransitionProps={{ onExited: () => setPendingTransition(null) }}
            >
                <DialogTitle>Confirm State Transition</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Transition <strong>{formatState(currentState.state)}</strong> → <strong>{pendingTransition ? formatState(pendingTransition) : ''}</strong>?
                        <br /><br />
                        Once transitioned, the current state will be sealed and can no longer be edited.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeTransitionDialog}>Cancel</Button>
                    <Button
                        onClick={() => pendingTransition && handleTransition(pendingTransition)}
                        variant="contained"
                        color={pendingTransition === 'recycled' ? 'error' : 'primary'}
                        disabled={transitioning}
                    >
                        Confirm
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Navigation blocker dialog */}
            <Dialog open={blocker.state === 'blocked'}>
                <DialogTitle>Unsaved Changes</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You have unsaved changes. Are you sure you want to leave?
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => blocker.reset?.()}>Stay</Button>
                    <Button onClick={() => blocker.proceed?.()} color="error">
                        Leave without saving
                    </Button>
                </DialogActions>
            </Dialog>

            <CreateTagDialog
                open={tagDialogOpen}
                name={newTagName}
                color={newTagColor}
                error={tagError}
                saving={tagSaving}
                onClose={() => setTagDialogOpen(false)}
                onNameChange={setNewTagName}
                onColorChange={setNewTagColor}
                onCreate={() => void createTag()}
            />
            <Snackbar
                open={tagAttachSnackbarOpen}
                autoHideDuration={4000}
                onClose={(_event, reason) => {
                    if (reason === 'clickaway') return
                    setTagAttachSnackbarOpen(false)
                }}
                message={TAG_ATTACH_SNACKBAR_ERROR}
            />
        </Box>
    )
}
