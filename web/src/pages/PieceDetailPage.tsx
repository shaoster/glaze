import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { fetchPiece } from '@common/api'
import PieceDetailComponent from '../components/PieceDetail'
import type { PieceDetail } from '@common/types'

export default function PieceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [piece, setPiece] = useState<PieceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetchPiece(id)
      .then(setPiece)
      .catch(() => setError('Failed to load piece.'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <>
      <Box sx={{ mb: 2, textAlign: 'left' }}>
        <Button variant="text" onClick={() => navigate('/')} sx={{ px: 0 }}>
          ← Back to Pottery Pieces
        </Button>
      </Box>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Typography color="error">{error}</Typography>}
      {piece && (
        <PieceDetailComponent
          piece={piece}
          onPieceUpdated={setPiece}
        />
      )}
    </>
  )
}
