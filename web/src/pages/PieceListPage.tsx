import { useState } from 'react'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { fetchPieces } from '@common/api'
import { useAsync } from '../util/useAsync'
import NewPieceDialog from '../components/NewPieceDialog'
import PieceList from '../components/PieceList'
import type { PieceDetail, PieceSummary } from '@common/types'

export default function PieceListPage() {
  const { data: pieces, loading, error, setData: setPieces } = useAsync<PieceSummary[]>(fetchPieces)
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleCreated(piece: PieceDetail) {
    setPieces(prev => [piece, ...(prev ?? [])])
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          + New Piece
        </Button>
      </Box>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Typography color="error">Failed to load pieces.</Typography>}
      {!loading && !error && <PieceList pieces={pieces ?? []} />}
      <NewPieceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  )
}
