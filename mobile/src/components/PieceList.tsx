import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import type { PieceSummary } from '@common/types'
import { formatState } from '@common/types'

type PieceListProps = {
  pieces: PieceSummary[]
  onSelectPiece: (pieceId: string) => void
}

export default function PieceList({ pieces, onSelectPiece }: PieceListProps) {
  return (
    <FlatList
      data={pieces}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => onSelectPiece(item.id)}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>State: {formatState(item.current_state.state)}</Text>
          <Text style={styles.meta}>Created: {item.created.toLocaleDateString()}</Text>
          <Text style={styles.meta}>Updated: {item.last_modified.toLocaleDateString()}</Text>
        </Pressable>
      )}
      ListEmptyComponent={<Text style={styles.empty}>No pieces yet.</Text>}
    />
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
    paddingBottom: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: '#343441',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#22222c',
    gap: 2,
  },
  name: {
    color: '#f5f5f7',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  meta: {
    color: '#b7b8c0',
    fontSize: 13,
  },
  empty: {
    color: '#9ea0a8',
    textAlign: 'center',
    paddingVertical: 24,
  },
})
