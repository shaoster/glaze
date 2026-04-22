import type { FormEvent } from 'react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Link,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
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
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import LogoutIcon from '@mui/icons-material/Logout'
import { alpha, ThemeProvider, createTheme } from '@mui/material/styles'

import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google'
import { fetchCurrentUser, loginWithEmail, loginWithGoogle, logoutUser, registerWithEmail } from '@common/api'
import { useAsync } from './util/useAsync'
import ErrorBoundary from './components/ErrorBoundary'
import type { AuthUser } from '@common/api'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const PieceListPage = lazy(() => import('./pages/PieceListPage'))
const PieceDetailPage = lazy(() => import('./pages/PieceDetailPage'))
const AnalyzePage = lazy(() => import('./pages/AnalyzePage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage'))

// Extend window type for Google OAuth
declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          cancel: () => void
        }
      }
    }
  }
}

const DARK_THEME = createTheme({
  palette: { mode: 'dark' },
  components: {
    MuiButton: {
      variants: [
        {
          props: { variant: 'contained' },
          style: ({ theme }) => ({
            boxShadow: `0 8px 18px ${alpha(theme.palette.common.black, 0.35)}`,
            border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
            '&:hover': {
              boxShadow: `0 10px 22px ${alpha(theme.palette.common.black, 0.42)}`,
            },
          }),
        },
      ],
    },
  },
})
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
    <Container
      maxWidth="sm"
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        px: { xs: 2, sm: 3 },
        py: {
          xs: 'max(16px, env(safe-area-inset-top))',
          sm: 3,
        },
      }}
    >
      <Paper
        sx={{
          width: '100%',
          p: { xs: 2.5, sm: 4 },
          borderRadius: { xs: 3, sm: 4 },
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              component="img"
              src="/favicon.svg"
              alt="PotterDoc icon"
              sx={{
                width: { xs: 32, sm: 36 },
                height: { xs: 32, sm: 36 },
                flexShrink: 0,
                display: 'block',
              }}
            />
            <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '2rem', sm: '2.5rem' }, lineHeight: 1.1 }}>
              PotterDoc
            </Typography>
          </Stack>
          <Typography color="text.secondary">
            Track every pottery piece through your workflow.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button
              variant={mode === 'login' ? 'contained' : 'outlined'}
              onClick={() => setMode('login')}
              disabled={submitting}
              fullWidth
            >
              Log In
            </Button>
            <Button
              variant={mode === 'register' ? 'contained' : 'outlined'}
              onClick={() => setMode('register')}
              disabled={submitting || !SIGN_UP_ENABLED}
              fullWidth
            >
              Sign Up
            </Button>
          </Stack>
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
              <Box sx={{ display: 'flex', justifyContent: 'center', overflowX: 'auto' }}>
                <GoogleLogin
                  theme="outline"
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
                />
              </Box>
            </>
          )}

          <Box component="footer" sx={{ pt: 1 }}>
            <Stack direction="row" spacing={1} justifyContent="center" alignItems="center" flexWrap="wrap">
              <Button component={Link} to="/about" variant="text" size="small" sx={{ minWidth: 0, px: 0.5 }}>
                About Us
              </Button>
              <Typography variant="body2" color="text.secondary">
                •
              </Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                <Button component={Link} to="/privacy-policy" variant="text" size="small" sx={{ minWidth: 0, px: 0.5 }}>
                  Privacy Policy
                </Button>
                .
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Container>
  )
}

function UnauthenticatedApp({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthUser) => void
}) {
  const router = useMemo(
    () =>
      createBrowserRouter(
        createRoutesFromElements(
          <>
            <Route path="/" element={<AuthLanding onAuthenticated={onAuthenticated} />} />
            <Route
              path="/about"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}>
                    <AboutPage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/privacy-policy"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}>
                    <PrivacyPolicyPage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>,
        ),
      ),
    [onAuthenticated],
  )

  return <RouterProvider router={router} />
}

function AppShell({
  currentUser,
  onLogout,
}: {
  currentUser: AuthUser
  onLogout: () => void
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const displayName = useMemo(() => {
    const fullName = `${currentUser.first_name} ${currentUser.last_name}`.trim()
    return fullName || currentUser.email
  }, [currentUser])

  return (
    <Container
      maxWidth="lg"
      sx={{
        minHeight: '100dvh',
        py: 2,
        px: {
          xs: 'max(16px, env(safe-area-inset-left))',
          sm: 3,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1.5,
          mb: 0,
          flexDirection: 'row',
          flexWrap: 'nowrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1}}>
          <Box
            component="img"
            src="/favicon.svg"
            alt="PotterDoc app icon"
            sx={{
              width: 22,
              height: 22,
              flexShrink: 0,
              display: 'block',
            }}
          />
          <Typography variant="h6" component="p" color="text.primary" display="inline">
            PotterDoc
          </Typography>
        </Box>
        <Chip
          label={displayName}
          color="primary"
          variant="outlined"
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          onDelete={(e) => setMenuAnchor(e.currentTarget)}
          deleteIcon={<ExpandMoreIcon />}
          sx={{ cursor: 'pointer', flexShrink: 0 }}
        />
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={() => { setMenuAnchor(null); onLogout() }}>
            <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
            Log out
          </MenuItem>
        </Menu>
      </Box>
      <ErrorBoundary>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
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
            <Route path="/" element={<LandingPage />}>
              <Route index element={<PieceListPage />} />
              <Route path="analyze" element={<AnalyzePage />} />
            </Route>
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
  const { data: currentUser, loading, setData: setCurrentUser } = useAsync<AuthUser | null>(
    fetchCurrentUser,
  )
  const handleAuthenticated = useCallback((user: AuthUser) => {
    setCurrentUser(user)
  }, [setCurrentUser])

  // Disable Google one-tap prompt
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel()
      }
    }, 1000) // Wait for Google script to load

    return () => clearTimeout(timer)
  }, [])

  const handleLogout = useCallback(async () => {
    await logoutUser()
    setCurrentUser(null)
  }, [setCurrentUser])

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID ?? ''}>
      <ThemeProvider theme={DARK_THEME}>
        <CssBaseline />
        {loading ? (
          <Container maxWidth="sm" sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
            <CircularProgress />
          </Container>
        ) : currentUser ? (
          <AuthenticatedApp currentUser={currentUser} onLogout={handleLogout} />
        ) : (
          <UnauthenticatedApp onAuthenticated={handleAuthenticated} />
        )}
      </ThemeProvider>
    </GoogleOAuthProvider>
  )
}
