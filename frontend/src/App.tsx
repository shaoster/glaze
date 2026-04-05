import { useEffect, useState } from 'react'
import { createBrowserRouter, Link, RouterProvider, useNavigate, useParams } from 'react-router-dom'
import { Box, Button, CircularProgress, Container, CssBaseline, Link as MuiLink, Typography } from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'

const darkTheme = createTheme({ palette: { mode: 'dark' } })
import { fetchPiece, fetchPieces } from './api'
import NewPieceDialog from './components/NewPieceDialog'
import PieceList from './components/PieceList'
import PieceDetailComponent from './components/PieceDetail'
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
      <Box sx={{ mb: 2 }}>
        <MuiLink
          component="button"
          variant="body2"
          onClick={() => navigate('/')}
          sx={{ cursor: 'pointer' }}
        >
          ← Back to Pottery Pieces
        </MuiLink>
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

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {children}
      </Container>
    </ThemeProvider>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell><PieceListPage /></AppShell>,
  },
  {
    path: '/pieces/:id',
    element: <AppShell><PieceDetailPage /></AppShell>,
  },
])

// Re-export Link for use in components that need it outside the router
export { Link }

export default function App() {
  return <RouterProvider router={router} />
}
