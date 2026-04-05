import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Box, Button, CircularProgress, Container, Typography } from '@mui/material'
import { fetchPieces } from './api'
import NewPieceDialog from './components/NewPieceDialog'
import PieceList from './components/PieceList'
import type { PieceDetail, PieceSummary } from './types'

function PieceListPage() {
  const [pieces, setPieces] = useState<PieceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    fetchPieces()
      .then(setPieces)
      .catch(() => setError('Failed to load pieces.'))
      .finally(() => setLoading(false))
  }, [])

  function handleCreated(piece: PieceDetail) {
    setPieces((prev) => [piece, ...prev])
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Pottery Pieces
        </Typography>
        <Button variant="contained" onClick={() => setDialogOpen(true)}>
          + New Piece
        </Button>
      </Box>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Typography color="error">{error}</Typography>}
      {!loading && !error && <PieceList pieces={pieces} />}
      <NewPieceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </>
  )
}

function PieceDetailPage() {
  return <Typography>Piece detail — not yet implemented.</Typography>
}

export default function App() {
  return (
    <BrowserRouter>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Routes>
          <Route path="/" element={<PieceListPage />} />
          <Route path="/pieces/:id" element={<PieceDetailPage />} />
        </Routes>
      </Container>
    </BrowserRouter>
  )
}
