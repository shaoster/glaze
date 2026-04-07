import { useState } from 'react'
import {
    Alert,
    Box,
    Button,
    Chip,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Divider,
    List,
    ListItem,
    ListItemText,
    Typography,
} from '@mui/material'
import { useBlocker } from 'react-router-dom'
import type { PieceDetail as PieceDetailType } from '@common/types'
import { formatState, SUCCESSORS } from '@common/types'
import { addPieceState } from '@common/api'
import WorkflowState from './WorkflowState'

type PieceDetailProps = {
    piece: PieceDetailType
    onPieceUpdated: (updated: PieceDetailType) => void
}

export default function PieceDetail({ piece, onPieceUpdated }: PieceDetailProps) {
    const [isDirty, setIsDirty] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [transitionDialogOpen, setTransitionDialogOpen] = useState(false)
    const [pendingTransition, setPendingTransition] = useState<string | null>(null)
    const [transitioning, setTransitioning] = useState(false)
    const [transitionError, setTransitionError] = useState<string | null>(null)
    const currentState = piece.current_state
    const successors = SUCCESSORS[currentState.state] ?? []
    const isTerminal = successors.length === 0
    const pastHistory = piece.history.slice(0, -1) // all except current (last)

    // Block navigation when there are unsaved changes
    const blocker = useBlocker(isDirty)

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

    return (
        <Box sx={{ textAlign: 'left' }}>
            {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            {piece.thumbnail && (
                <img
                    src={piece.thumbnail}
                    alt={piece.name}
                    style={{ height: 64, width: 64, objectFit: 'cover', borderRadius: 4 }}
                />
            )}
            <Box>
                <Typography variant="h5" component="h2">
                    {piece.name}
                </Typography>
                    <Chip
                        label={formatState(currentState.state)}
                        size="small"
                        sx={{ mt: 0.5 }}
                        color={isTerminal ? 'default' : 'primary'}
                    />
            </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

            {/* Current state form */}
            <WorkflowState
                key={currentState.state + currentState.created.toISOString()}
                pieceState={currentState}
                pieceId={piece.id}
                onSaved={onPieceUpdated}
                onDirtyChange={setIsDirty}
                currentLocation={piece.current_location ?? ''}
            />

            <Divider sx={{ my: 3 }} />

            {/* State transitions */}
            {isTerminal ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    This piece is in a terminal state (<strong>{formatState(currentState.state)}</strong>). No further transitions are possible.
                </Alert>
            ) : (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" gutterBottom>
                        Transition to next state:
                    </Typography>
                    {transitionError && (
                        <Typography color="error" variant="body2" sx={{ mb: 1 }}>
                            {transitionError}
                        </Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {successors.map((next) => (
                            <Button
                                key={next}
                                variant="outlined"
                                onClick={() => openTransitionDialog(next)}
                                disabled={isDirty || transitioning}
                                color={next === 'recycled' ? 'error' : 'primary'}
                            >
                                {formatState(next)}
                            </Button>
                        ))}
                    </Box>
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
                            {pastHistory.map((ps, i) => (
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
                                                <Box key={j} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 80 }}>
                                                    <img
                                                        src={img.url}
                                                        alt={img.caption || ''}
                                                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4 }}
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
                            ))}
                        </List>
                    </Collapse>
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
        </Box>
    )
}
