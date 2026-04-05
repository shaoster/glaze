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
import type { PieceDetail as PieceDetailType } from '../types'
import { SUCCESSORS } from '../types'
import { addPieceState } from '../api'
import BaseState from './BaseState'

type PieceDetailProps = {
    piece: PieceDetailType
    onPieceUpdated: (updated: PieceDetailType) => void
}

export default function PieceDetail({ piece, onPieceUpdated }: PieceDetailProps) {
    const [isDirty, setIsDirty] = useState(false)
    const [historyOpen, setHistoryOpen] = useState(false)
    const [transitionConfirm, setTransitionConfirm] = useState<string | null>(null)
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
            setTransitionConfirm(null)
        }
    }

    return (
        <Box>
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
                        label={currentState.state}
                        size="small"
                        sx={{ mt: 0.5 }}
                        color={isTerminal ? 'default' : 'primary'}
                    />
                </Box>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Current state form */}
            <Typography variant="h6" gutterBottom>
                Current State: {currentState.state}
            </Typography>
            <BaseState
                key={currentState.state + currentState.created.toISOString()}
                pieceState={currentState}
                pieceId={piece.id}
                onSaved={onPieceUpdated}
                onDirtyChange={setIsDirty}
            />

            <Divider sx={{ my: 3 }} />

            {/* State transitions */}
            {isTerminal ? (
                <Alert severity="info" sx={{ mb: 2 }}>
                    This piece is in a terminal state (<strong>{currentState.state}</strong>). No further transitions are possible.
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
                                onClick={() => setTransitionConfirm(next)}
                                disabled={isDirty || transitioning}
                                color={next === 'recycled' ? 'error' : 'primary'}
                            >
                                {next}
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
                                <ListItem key={i} disableGutters>
                                    <ListItemText
                                        primary={ps.state}
                                        secondary={`${ps.created.toLocaleString()}${ps.notes ? ' — ' + ps.notes : ''}`}
                                        slotProps={{
                                            primary: { sx: { color: 'text.primary' } },
                                            secondary: { sx: { color: 'text.secondary' } },
                                        }}
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Collapse>
                </Box>
            )}

            {/* Transition confirmation dialog */}
            <Dialog open={transitionConfirm !== null} onClose={() => setTransitionConfirm(null)}>
                <DialogTitle>Confirm State Transition</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Transition <strong>{currentState.state}</strong> → <strong>{transitionConfirm}</strong>?
                        <br /><br />
                        Once transitioned, the current state will be sealed and can no longer be edited.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTransitionConfirm(null)}>Cancel</Button>
                    <Button
                        onClick={() => transitionConfirm && handleTransition(transitionConfirm)}
                        variant="contained"
                        color={transitionConfirm === 'recycled' ? 'error' : 'primary'}
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
