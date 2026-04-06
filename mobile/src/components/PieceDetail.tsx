import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { addPieceState } from '../../../frontend_common/src/api'
import type { PieceDetail as PieceDetailType } from '../../../frontend_common/src/types'
import { formatState, SUCCESSORS } from '../../../frontend_common/src/types'
import WorkflowState from './WorkflowState'

type PieceDetailProps = {
  piece: PieceDetailType
  onBack: () => void
  onPieceUpdated: (updated: PieceDetailType) => void
}

export default function PieceDetail({ piece, onBack, onPieceUpdated }: PieceDetailProps) {
  const [isDirty, setIsDirty] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionError, setTransitionError] = useState<string | null>(null)

  const currentState = piece.current_state
  const successors = SUCCESSORS[currentState.state] ?? []
  const pastHistory = useMemo(() => piece.history.slice(0, -1), [piece.history])
  const isTerminal = successors.length === 0

  async function handleTransition(nextState: string) {
    if (isDirty || transitioning) return
    Alert.alert(
      'Confirm transition',
      `Transition ${formatState(currentState.state)} to ${formatState(nextState)}? This seals the current state.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: nextState === 'recycled' ? 'destructive' : 'default',
          onPress: async () => {
            setTransitioning(true)
            setTransitionError(null)
            try {
              const updated = await addPieceState(piece.id, { state: nextState })
              onPieceUpdated(updated)
            } catch {
              setTransitionError('Failed to transition state. Please try again.')
            } finally {
              setTransitioning(false)
            }
          },
        },
      ]
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Pressable onPress={onBack}>
        <Text style={styles.backText}>Back to pieces</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>{piece.name}</Text>
        <Text style={styles.statePill}>{formatState(currentState.state)}</Text>
      </View>

      <WorkflowState
        key={`${currentState.state}-${currentState.created.toISOString()}`}
        pieceState={currentState}
        pieceId={piece.id}
        onSaved={onPieceUpdated}
        onDirtyChange={setIsDirty}
        currentLocation={piece.current_location ?? ''}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transition to next state</Text>
        {transitionError ? <Text style={styles.errorText}>{transitionError}</Text> : null}
        {isTerminal ? (
          <Text style={styles.infoText}>This piece is in a terminal state.</Text>
        ) : (
          <View style={styles.buttonWrap}>
            {successors.map((next) => (
              <Pressable
                key={next}
                style={[styles.transitionButton, isDirty || transitioning ? styles.buttonDisabled : undefined]}
                onPress={() => handleTransition(next)}
                disabled={isDirty || transitioning}
              >
                <Text style={styles.transitionText}>{formatState(next)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {isDirty ? <Text style={styles.infoText}>Save before transitioning.</Text> : null}
      </View>

      {pastHistory.length > 0 && (
        <View style={styles.section}>
          <Pressable onPress={() => setHistoryOpen((prev) => !prev)}>
            <Text style={styles.sectionAction}>{historyOpen ? 'Hide' : 'Show'} history ({pastHistory.length})</Text>
          </Pressable>
          {historyOpen &&
            pastHistory.map((state, index) => (
              <View key={`${state.state}-${index}`} style={styles.historyItem}>
                <Text style={styles.historyTitle}>{formatState(state.state)}</Text>
                <Text style={styles.historyMeta}>
                  {state.created.toLocaleString()}
                  {state.notes ? ` - ${state.notes}` : ''}
                </Text>
              </View>
            ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    padding: 16,
    gap: 16,
  },
  backText: {
    color: '#9bb0ff',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    gap: 6,
  },
  title: {
    color: '#f5f5f7',
    fontSize: 24,
    fontWeight: '700',
  },
  statePill: {
    alignSelf: 'flex-start',
    color: '#d6daff',
    borderWidth: 1,
    borderColor: '#4e5698',
    backgroundColor: '#2a2e5e',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#31313d',
    paddingTop: 12,
  },
  sectionTitle: {
    color: '#f5f5f7',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  transitionButton: {
    backgroundColor: '#2b2f5a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4f5dff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  transitionText: {
    color: '#f5f5f7',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoText: {
    color: '#9ea0a8',
    fontSize: 13,
  },
  errorText: {
    color: '#ff8c8c',
    fontSize: 13,
  },
  sectionAction: {
    color: '#9bb0ff',
    fontWeight: '600',
  },
  historyItem: {
    borderWidth: 1,
    borderColor: '#353542',
    borderRadius: 8,
    backgroundColor: '#23232d',
    padding: 10,
    gap: 4,
  },
  historyTitle: {
    color: '#f5f5f7',
    fontWeight: '600',
  },
  historyMeta: {
    color: '#9ea0a8',
    fontSize: 12,
  },
})
