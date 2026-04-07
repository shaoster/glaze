import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { fetchPiece, fetchPieces } from '@common/api'
import PieceDetail from './src/components/PieceDetail'
import PieceList from './src/components/PieceList'
import NewPieceModal from './src/components/NewPieceModal'
import type { PieceDetail as PieceDetailType, PieceSummary } from '@common/types'

export default function App() {
  const [pieces, setPieces] = useState<PieceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPiece, setSelectedPiece] = useState<PieceDetailType | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [newPieceOpen, setNewPieceOpen] = useState(false)

  const selectedPieceId = selectedPiece?.id ?? null

  useEffect(() => {
    fetchPieces()
      .then(setPieces)
      .catch(() => setError('Failed to load pieces. Check API base URL and backend status.'))
      .finally(() => setLoading(false))
  }, [])

  const title = useMemo(() => {
    if (!selectedPiece) return 'Pottery Pieces'
    return selectedPiece.name
  }, [selectedPiece])

  async function openPiece(pieceId: string) {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const detail = await fetchPiece(pieceId)
      setSelectedPiece(detail)
    } catch {
      setDetailError('Failed to load piece.')
    } finally {
      setDetailLoading(false)
    }
  }

  function handleCreated(piece: PieceDetailType) {
    setPieces((prev) => [piece, ...prev])
  }

  function handlePieceUpdated(updated: PieceDetailType) {
    setSelectedPiece(updated)
    setPieces((prev) =>
      prev.map((piece) =>
        piece.id === updated.id
          ? {
              ...piece,
              ...updated,
              current_state: { state: updated.current_state.state },
            }
          : piece
      )
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {!selectedPieceId && (
            <Pressable style={styles.newButton} onPress={() => setNewPieceOpen(true)}>
              <Text style={styles.newButtonText}>New Piece</Text>
            </Pressable>
          )}
        </View>

        {loading ? <ActivityIndicator size="large" color="#f5f5f7" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && !selectedPiece && !error && (
          <PieceList pieces={pieces} onSelectPiece={openPiece} />
        )}

        {detailLoading ? <ActivityIndicator size="large" color="#f5f5f7" /> : null}
        {detailError ? <Text style={styles.error}>{detailError}</Text> : null}

        {selectedPiece && !detailLoading && (
          <PieceDetail
            piece={selectedPiece}
            onBack={() => setSelectedPiece(null)}
            onPieceUpdated={handlePieceUpdated}
          />
        )}
      </View>

      <NewPieceModal open={newPieceOpen} onClose={() => setNewPieceOpen(false)} onCreated={handleCreated} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#111118',
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#111118',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    color: '#f5f5f7',
    fontSize: 24,
    fontWeight: '700',
    flexShrink: 1,
    paddingRight: 12,
  },
  newButton: {
    backgroundColor: '#5a64ff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newButtonText: {
    color: '#f5f5f7',
    fontWeight: '700',
    fontSize: 13,
  },
  error: {
    color: '#ff8c8c',
    marginBottom: 8,
  },
})
