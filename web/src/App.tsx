import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Link,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useNavigate,
  useParams,
} from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  CssBaseline,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { ThemeProvider, createTheme } from '@mui/material/styles'

import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { fetchPiece, fetchPieces, fetchCurrentUser, loginWithEmail, loginWithGoogle, logoutUser, registerWithEmail } from '@common/api'
import NewPieceDialog from './components/NewPieceDialog'
import PieceList from './components/PieceList'
import PieceDetailComponent from './components/PieceDetail'
import type { AuthUser } from '@common/api'
import type { PieceDetail, PieceSummary } from '@common/types'

const DARK_THEME = createTheme({ palette: { mode: 'dark' } })
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

type AuthViewMode = 'login' | 'register'
const SIGN_UP_ENABLED = false

function AuthLanding({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthUser) => void
}) {
  const [mode, setMode] = useState<AuthViewMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'login') {
        const user = await loginWithEmail(email.trim(), password)
        onAuthenticated(user)
      } else {
        if (!SIGN_UP_ENABLED) {
          throw new Error('Sign up is disabled.')
        }
        const user = await registerWithEmail({
          email: email.trim(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        })
        onAuthenticated(user)
      }
    } catch {
      setError(mode === 'login' ? 'Login failed. Please check your credentials.' : 'Sign up failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Paper sx={{ width: '100%', p: 4 }}>
        <Stack spacing={2}>
          <Typography variant="h4" component="h1">
            Glaze
          </Typography>
          <Typography color="text.secondary">
            Track every pottery piece through your workflow.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant={mode === 'login' ? 'contained' : 'outlined'}
              onClick={() => setMode('login')}
              disabled={submitting}
            >
              Log In
            </Button>
            <Button
              variant={mode === 'register' ? 'contained' : 'outlined'}
              onClick={() => setMode('register')}
              disabled={submitting || !SIGN_UP_ENABLED}
            >
              Sign Up
            </Button>
          </Box>
          {!SIGN_UP_ENABLED && (
            <Typography variant="body2" color="text.secondary">
              Sign up is temporarily disabled. Ask an admin to create your account.
            </Typography>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                fullWidth
                slotProps={{ htmlInput: { autoComplete: 'email' } }}
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                fullWidth
                slotProps={{ htmlInput: { autoComplete: mode === 'login' ? 'current-password' : 'new-password' } }}
              />
              {mode === 'register' && (
                <>
                  <TextField
                    label="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    fullWidth
                  />
                </>
              )}
              {error && <Alert severity="error">{error}</Alert>}
              <Button type="submit" variant="contained" disabled={submitting || !email.trim() || !password}>
                {mode === 'login' ? 'Log In' : 'Create Account'}
              </Button>
            </Stack>
          </Box>

          {GOOGLE_CLIENT_ID && (
            <>
              <Divider>or</Divider>
              <GoogleLogin
                onSuccess={async ({ credential }) => {
                  if (!credential) return
                  setSubmitting(true)
                  setError(null)
                  try {
                    const user = await loginWithGoogle(credential)
                    onAuthenticated(user)
                  } catch {
                    setError('Google sign-in failed. Please try again.')
                  } finally {
                    setSubmitting(false)
                  }
                }}
                onError={() => setError('Google sign-in failed. Please try again.')}
                useOneTap
              />
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  )
}

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
      <Box sx={{ mb: 2, textAlign: 'left' }}>
        <Button variant="text" onClick={() => navigate('/')} sx={{ px: 0 }}>
          Back to Pottery Pieces
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

function AppShell({
  currentUser,
  onLogout,
}: {
  currentUser: AuthUser
  onLogout: () => void
}) {
  const displayName = useMemo(() => {
    const fullName = `${currentUser.first_name} ${currentUser.last_name}`.trim()
    return fullName || currentUser.email
  }, [currentUser])

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" component="p" color="text.secondary">
          Glaze Workspace
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip label={`Current user: ${displayName}`} color="primary" variant="outlined" />
          <Button size="small" onClick={onLogout}>Log out</Button>
        </Box>
      </Box>
      <Outlet />
    </Container>
  )
}

function AuthenticatedApp({
  currentUser,
  onLogout,
}: {
  currentUser: AuthUser
  onLogout: () => void
}) {
  const router = useMemo(
    () =>
      createBrowserRouter(
        createRoutesFromElements(
          <Route element={<AppShell currentUser={currentUser} onLogout={onLogout} />}>
            <Route path="/" element={<PieceListPage />} />
            <Route path="/pieces/:id" element={<PieceDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>,
        ),
      ),
    [currentUser, onLogout],
  )

  return <RouterProvider router={router} />
}

// Re-export Link for use in components that need it outside the router
export { Link }

export default function App() {
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    fetchCurrentUser()
      .then(setCurrentUser)
      .finally(() => setLoading(false))
  }, [])

  async function handleLogout() {
    await logoutUser()
    setCurrentUser(null)
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID ?? ''}>
      <ThemeProvider theme={DARK_THEME}>
        <CssBaseline />
        {loading ? (
          <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Container>
        ) : currentUser ? (
          <AuthenticatedApp currentUser={currentUser} onLogout={handleLogout} />
        ) : (
          <AuthLanding onAuthenticated={setCurrentUser} />
        )}
      </ThemeProvider>
    </GoogleOAuthProvider>
  )
}
