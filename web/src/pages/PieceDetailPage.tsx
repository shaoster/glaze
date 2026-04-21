import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { fetchPiece } from '@common/api'
import { useAsync } from '../util/useAsync'
import PieceDetailComponent from '../components/PieceDetail'
import type { PieceDetail } from '@common/types'

export default function PieceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // id is always defined — this component is only rendered via the /pieces/:id route
  const { data: piece, loading, error, setData: setPiece } = useAsync<PieceDetail>(
    () => fetchPiece(id!),
    [id],
  )

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
      {error && <Typography color="error">Failed to load piece.</Typography>}
      {piece && (
        <PieceDetailComponent
          piece={piece}
          onPieceUpdated={(updated) => setPiece(updated)}
        />
      )}
    </>
  )
}
