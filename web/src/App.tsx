import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useMatch,
  useNavigate,
} from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LogoutIcon from "@mui/icons-material/Logout";
import CropFreeIcon from "@mui/icons-material/CropFree";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import SettingsIcon from "@mui/icons-material/Settings";
import { alpha, ThemeProvider, createTheme } from "@mui/material/styles";

import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import {
  deleteAccount,
  downloadUserData,
  fetchAppInit,
  loginWithGoogle,
  logoutUser,
  updateUserPreferences,
  type UserPreferences,
} from "./util/api";
import { getPostLoginRedirectTarget } from "./util/postLoginRedirect";
import { useAsync } from "./util/useAsync";
import ErrorBoundary from "./components/ErrorBoundary";
import PublicPieceShell from "./components/PublicPieceShell";
import UserPreferencesDialog from "./components/UserPreferencesDialog";
import TutorialManager from "./components/TutorialManager";
import {
  CurrentUserProvider,
  PreferencesDialogProvider,
} from "./components/CurrentUserContext";
import type { AuthUser } from "./util/api";
import type { PreferencesSectionId } from "./components/CurrentUserContext";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const PieceListPage = lazy(() => import("./pages/PieceListPage"));
const PieceDetailPage = lazy(() => import("./pages/PieceDetailPage"));
const AnalyzePage = lazy(() => import("./pages/AnalyzePage"));
const GlazeImportToolPage = lazy(() => import("./pages/GlazeImportToolPage"));
const CloudinaryCleanupPage = lazy(
  () => import("./pages/CloudinaryCleanupPage"),
);
const AboutPage = lazy(() => import("./pages/AboutPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsOfServicePage = lazy(() => import("./pages/TermsOfServicePage"));
const InvitePage = lazy(() => import("./pages/InvitePage"));
const StaffInvitePage = lazy(() => import("./pages/StaffInvitePage"));


const DARK_THEME = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#c97a4d",
      light: "#d59a71",
      dark: "#8f5230",
    },
    secondary: {
      main: "#8ca6a3",
    },
    background: {
      default: "#211b19",
      paper: "#2a2321",
    },
    text: {
      primary: "#f3ebe1",
      secondary: "#bbaea1",
    },
    divider: "rgba(255, 245, 235, 0.09)",
    success: {
      main: "#8eb89a",
    },
    warning: {
      main: "#c97a4d",
    },
  },
  typography: {
    fontFamily: [
      "Manrope",
      "Avenir Next",
      "Segoe UI",
      "sans-serif",
    ].join(","),
    h1: { fontWeight: 650, letterSpacing: "-0.03em" },
    h2: { fontWeight: 650, letterSpacing: "-0.03em" },
    h3: { fontWeight: 620, letterSpacing: "-0.03em" },
    h4: { fontWeight: 620, letterSpacing: "-0.025em" },
    h5: { fontWeight: 610, letterSpacing: "-0.02em" },
    h6: { fontWeight: 600, letterSpacing: "-0.015em" },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
    caption: {
      letterSpacing: "0.08em",
    },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at top, rgba(201,122,77,0.14) 0%, rgba(33,27,25,0) 34%), #211b19",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: alpha("#0f0b0a", 0.22),
        },
      },
    },
    MuiButton: {
      variants: [
        {
          props: { variant: "contained" },
          style: ({ theme }) => ({
            boxShadow: `0 10px 24px ${alpha(theme.palette.common.black, 0.34)}`,
            border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
            "&:hover": {
              boxShadow: `0 14px 28px ${alpha(theme.palette.common.black, 0.4)}`,
            },
          }),
        },
      ],
    },
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiChip: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 999,
          backgroundColor: alpha(theme.palette.common.black, 0.18),
          border: `1px solid ${alpha(theme.palette.common.white, 0.08)}`,
        }),
      },
    },
  },
});
function GoogleSignInButton({
  onAuthenticated,
  redirectTo,
}: {
  onAuthenticated: (user: import("./util/api").AuthUser) => void;
  redirectTo: string | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useGoogleLogin({
    flow: "auth-code",
    scope: "openid",
    overrideScope: true,
    onSuccess: async ({ code }) => {
      setSubmitting(true);
      setError(null);
      try {
        const inviteCode = sessionStorage.getItem("pendingInviteCode") ?? undefined;
        const user = await loginWithGoogle(code, window.location.origin, inviteCode);
        if (inviteCode) sessionStorage.removeItem("pendingInviteCode");
        if (redirectTo) {
          window.location.replace(redirectTo);
        } else {
          onAuthenticated(user);
        }
      } catch {
        setError("Google sign-in failed. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    onError: () => setError("Google sign-in failed. Please try again."),
  });

  return (
    <Stack spacing={1} alignItems="center" width="100%">
      <Button
        variant="outlined"
        onClick={() => signIn()}
        disabled={submitting}
        startIcon={
          submitting ? <CircularProgress size={16} color="inherit" /> : undefined
        }
        fullWidth
      >
        {submitting ? "Signing in…" : "Sign in with Google"}
      </Button>
      {error && <Alert severity="error" sx={{ width: "100%" }}>{error}</Alert>}
    </Stack>
  );
}

function AuthLanding({
  onAuthenticated,
  redirectTo,
}: {
  onAuthenticated: (user: AuthUser) => void;
  redirectTo: string | null;
}) {
  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        px: { xs: 2, sm: 3 },
        py: {
          xs: "max(16px, env(safe-area-inset-top))",
          sm: 3,
        },
      }}
    >
      <Paper
        sx={{
          width: "100%",
          p: { xs: 2.5, sm: 4 },
          borderRadius: { xs: 3, sm: 4 },
        }}
      >
        <Stack spacing={3}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              component="img"
              src="/favicon.svg"
              alt="PotterDoc icon"
              sx={{
                width: { xs: 32, sm: 36 },
                height: { xs: 32, sm: 36 },
                flexShrink: 0,
                display: "block",
              }}
            />
            <Typography
              variant="h4"
              component="h1"
              sx={{ fontSize: { xs: "2rem", sm: "2.5rem" }, lineHeight: 1.1 }}
            >
              PotterDoc
            </Typography>
          </Stack>
          <Typography color="text.secondary">
            Track every pottery piece through your workflow.
          </Typography>

          <GoogleSignInButton
            onAuthenticated={onAuthenticated}
            redirectTo={redirectTo}
          />

          <Box component="footer" sx={{ pt: 1 }}>
            <Stack
              direction="row"
              spacing={1}
              justifyContent="center"
              alignItems="center"
              flexWrap="wrap"
            >
              <Button
                component={Link}
                to="/about"
                variant="text"
                size="small"
                sx={{ minWidth: 0, px: 0.5 }}
              >
                About Us
              </Button>
              <Typography variant="body2" color="text.secondary">
                •
              </Typography>
              <Button
                component={Link}
                to="/privacy-policy"
                variant="text"
                size="small"
                sx={{ minWidth: 0, px: 0.5 }}
              >
                Privacy Policy
              </Button>
              <Typography variant="body2" color="text.secondary">
                •
              </Typography>
              <Button
                component={Link}
                to="/terms-of-service"
                variant="text"
                size="small"
                sx={{ minWidth: 0, px: 0.5 }}
              >
                Terms of Service
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}

function AppShell({
  currentUser,
  adminBaseUrl,
  onLogout,
  onCurrentUserUpdated,
}: {
  currentUser: AuthUser;
  adminBaseUrl: string | null;
  onLogout: () => void;
  onCurrentUserUpdated: (user: AuthUser) => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const navigate = useNavigate();
  const preferencesRootMatch = useMatch("/preferences");
  const preferencesSectionMatch = useMatch("/preferences/:sectionId");
  const preferencesSectionId =
    (preferencesSectionMatch?.params.sectionId as PreferencesSectionId | undefined) ??
    null;
  const preferencesOpen =
    preferencesRootMatch !== null || preferencesSectionMatch !== null;

  const displayName = useMemo(() => {
    if (currentUser.alias) return currentUser.alias;
    return (currentUser.openid_subject?.slice(0, 8) ?? "…") + "…";
  }, [currentUser]);
  const saveUserPreferences = useCallback(
    async (preferences: UserPreferences, alias?: string) => {
      const response = await updateUserPreferences(preferences, alias);
      onCurrentUserUpdated({
        ...currentUser,
        alias: response.alias,
        preferences: response.preferences,
      });
      return response.preferences;
    },
    [currentUser, onCurrentUserUpdated],
  );
  const openPreferencesDialog = useCallback(
    (sectionId: PreferencesSectionId | null = null) => {
      navigate(sectionId ? `/preferences/${sectionId}` : "/preferences");
    },
    [navigate],
  );
  const switchPreferencesSection = useCallback(
    (sectionId: PreferencesSectionId | null) => {
      navigate(sectionId ? `/preferences/${sectionId}` : "/preferences", {
        replace: true,
      });
    },
    [navigate],
  );
  const closePreferencesDialog = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <CurrentUserProvider currentUser={currentUser}>
      <PreferencesDialogProvider
        openPreferencesDialog={openPreferencesDialog}
        saveUserPreferences={saveUserPreferences}
      >
        <Container
          maxWidth="lg"
          sx={{
            minHeight: "100dvh",
            pt: {
              xs: "max(12px, calc(env(safe-area-inset-top) + 8px))",
              sm: 2,
            },
            pb: 2,
            pl: {
              xs: "max(16px, env(safe-area-inset-left))",
              sm: 3,
            },
            pr: {
              xs: "max(16px, env(safe-area-inset-right))",
              sm: 3,
            },
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1.5,
              mb: 0,
              flexDirection: "row",
              flexWrap: "nowrap",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                component="img"
                src="/favicon.svg"
                alt="PotterDoc app icon"
                sx={{
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  display: "block",
                }}
              />
              <Typography
                variant="h6"
                component="p"
                color="text.primary"
                display="inline"
              >
                PotterDoc
              </Typography>
            </Box>
            <Chip
              id="user-chip"
              label={displayName}
              color="primary"
              variant="outlined"
              size="small"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              onDelete={(e) => setMenuAnchor(e.currentTarget)}
              deleteIcon={<ExpandMoreIcon />}
              sx={{
                cursor: "pointer",
                flexShrink: 0,
                maxWidth: "16ch",
              }}
            />
            <Menu
              anchorEl={menuAnchor}
              open={Boolean(menuAnchor)}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  openPreferencesDialog(null);
                }}
              >
                <ListItemIcon>
                  <SettingsIcon fontSize="small" />
                </ListItemIcon>
                Preferences
              </MenuItem>
              {currentUser.is_staff ? [
                  <MenuItem
                    key="invite"
                    component={Link}
                    to="/staff/invite"
                    onClick={() => setMenuAnchor(null)}
                  >
                    <ListItemIcon>
                      <AdminPanelSettingsIcon fontSize="small" />
                    </ListItemIcon>
                    Invite Code
                  </MenuItem>,
                  <MenuItem
                    key="glaze-import"
                    component={Link}
                    to="/tools/glaze-import"
                    onClick={() => setMenuAnchor(null)}
                  >
                    <ListItemIcon>
                      <CropFreeIcon fontSize="small" />
                    </ListItemIcon>
                    Glaze Import Tool
                  </MenuItem>,
                  <MenuItem
                    key="cloudinary-cleanup"
                    component={Link}
                    to="/tools/cloudinary-cleanup"
                    onClick={() => setMenuAnchor(null)}
                  >
                    <ListItemIcon>
                      <CleaningServicesIcon fontSize="small" />
                    </ListItemIcon>
                    Cloudinary Cleanup
                  </MenuItem>,
                  adminBaseUrl ? (
                    <MenuItem
                      key="admin-tool"
                      component="a"
                      href={`${adminBaseUrl}/admin/`}
                      onClick={() => setMenuAnchor(null)}
                    >
                      <ListItemIcon>
                        <AdminPanelSettingsIcon fontSize="small" />
                      </ListItemIcon>
                      Admin Tool
                    </MenuItem>
                  ) : null,
                ] : null}
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  downloadUserData();
                }}
              >
                <ListItemIcon>
                  <DownloadIcon fontSize="small" />
                </ListItemIcon>
                Download my data
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  setDeleteDialogOpen(true);
                }}
                sx={{ color: "error.main" }}
              >
                <ListItemIcon>
                  <DeleteForeverIcon fontSize="small" color="error" />
                </ListItemIcon>
                Delete account
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  onLogout();
                }}
              >
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Log out
              </MenuItem>
            </Menu>
            <Dialog
              open={deleteDialogOpen}
              onClose={() => {
                if (deleteInProgress) return;
                setDeleteDialogOpen(false);
                setDeleteConfirmText("");
              }}
            >
              <DialogTitle>Delete account?</DialogTitle>
              <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <DialogContentText>
                  This permanently deletes your account and all your pieces.
                  This cannot be undone. Download your data first if you want a
                  copy.
                </DialogContentText>
                <DialogContentText>
                  Type <strong>delete my account</strong> to confirm.
                </DialogContentText>
                <TextField
                  autoFocus
                  size="small"
                  placeholder="delete my account"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  disabled={deleteInProgress}
                />
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => {
                    setDeleteDialogOpen(false);
                    setDeleteConfirmText("");
                  }}
                  disabled={deleteInProgress}
                >
                  Cancel
                </Button>
                <Button
                  color="error"
                  disabled={deleteConfirmText !== "delete my account" || deleteInProgress}
                  onClick={async () => {
                    setDeleteInProgress(true);
                    try {
                      await deleteAccount();
                      window.location.replace("/");
                    } catch {
                      setDeleteInProgress(false);
                      setDeleteDialogOpen(false);
                      setDeleteConfirmText("");
                    }
                  }}
                >
                  {deleteInProgress ? "Deleting…" : "Delete my account"}
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
          <ErrorBoundary>
            <Suspense
              fallback={
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress />
                </Box>
              }
            >
              <Outlet />
            </Suspense>
          </ErrorBoundary>
          <TutorialManager />
          <UserPreferencesDialog
            open={preferencesOpen}
            activeSectionId={preferencesSectionId}
            onClose={closePreferencesDialog}
            onSectionChange={switchPreferencesSection}
          />
        </Container>
      </PreferencesDialogProvider>
    </CurrentUserProvider>
  );
}

function UnauthenticatedApp({
  onAuthenticated,
  redirectTo,
}: {
  onAuthenticated: (user: AuthUser) => void;
  redirectTo: string | null;
}) {
  const router = useMemo(
    () =>
      createBrowserRouter(
        createRoutesFromElements(
          <>
            <Route
              path="/"
              element={
                <AuthLanding
                  onAuthenticated={onAuthenticated}
                  redirectTo={redirectTo}
                />
              }
            />
            <Route
              path="/about"
              element={
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          py: 4,
                        }}
                      >
                        <CircularProgress />
                      </Box>
                    }
                  >
                    <AboutPage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/privacy-policy"
              element={
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          py: 4,
                        }}
                      >
                        <CircularProgress />
                      </Box>
                    }
                  >
                    <PrivacyPolicyPage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/terms-of-service"
              element={
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          py: 4,
                        }}
                      >
                        <CircularProgress />
                      </Box>
                    }
                  >
                    <TermsOfServicePage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/pieces/:id/*"
              element={<PublicPieceShell />}
            />
            <Route
              path="/invite"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>}>
                    <InvitePage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>,
        ),
      ),
    [onAuthenticated, redirectTo],
  );

  return <RouterProvider router={router} />;
}

function AuthenticatedApp({
  currentUser,
  adminBaseUrl,
  onLogout,
  onCurrentUserUpdated,
}: {
  currentUser: AuthUser;
  adminBaseUrl: string | null;
  onLogout: () => void;
  onCurrentUserUpdated: (user: AuthUser) => void;
}) {
  const router = useMemo(
    () =>
      createBrowserRouter(
        createRoutesFromElements(
          <Route
            element={
              <AppShell
                currentUser={currentUser}
                adminBaseUrl={adminBaseUrl}
                onLogout={onLogout}
                onCurrentUserUpdated={onCurrentUserUpdated}
              />
            }
          >
            <Route path="/" element={<LandingPage />}>
              <Route index element={<PieceListPage />} />
              <Route path="analyze/*" element={<AnalyzePage />} />
            </Route>
            <Route path="/pieces/:id/*" element={<PieceDetailPage />} />
            <Route
              path="/tools/glaze-import"
              element={
                currentUser.is_staff ? (
                  <GlazeImportToolPage adminBaseUrl={adminBaseUrl} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/tools/cloudinary-cleanup"
              element={
                currentUser.is_staff ? (
                  <CloudinaryCleanupPage />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/invite"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>}>
                    <InvitePage />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route
              path="/staff/invite"
              element={
                currentUser.is_staff ? (
                  <ErrorBoundary>
                    <Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>}>
                      <StaffInvitePage />
                    </Suspense>
                  </ErrorBoundary>
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/preferences"
              element={<Box sx={{ minHeight: "100dvh" }} />}
            />
            <Route path="/preferences/:sectionId" element={<Box sx={{ minHeight: "100dvh" }} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>,
        ),
      ),
    [adminBaseUrl, currentUser, onLogout, onCurrentUserUpdated],
  );

  return <RouterProvider router={router} />;
}

// Re-export Link for use in components that need it outside the router
export { Link };

function FullscreenCenter({ children }: { children: React.ReactNode }) {
  return (
    <Container
      maxWidth="sm"
      sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}
    >
      {children}
    </Container>
  );
}

export default function App() {
  const postLoginRedirect = useMemo(
    () =>
      getPostLoginRedirectTarget(
        window.location.hostname,
        window.location.protocol,
        new URLSearchParams(window.location.search).get("next"),
      ),
    [],
  );
  const {
    data: init,
    loading,
    error,
    setData: setInit,
  } = useAsync(fetchAppInit);

  const handleAuthenticated = useCallback(
    (user: AuthUser) => setInit((prev) => ({ ...prev!, user })),
    [setInit],
  );
  const handleCurrentUserUpdated = useCallback(
    (user: AuthUser) => setInit((prev) => ({ ...prev!, user })),
    [setInit],
  );
  const handleLogout = useCallback(async () => {
    await logoutUser();
    setInit((prev) => ({ ...prev!, user: null }));
  }, [setInit]);

  useEffect(() => {
    if (postLoginRedirect && init?.user) {
      window.location.replace(postLoginRedirect);
    }
  }, [init?.user, postLoginRedirect]);

  return (
    <GoogleOAuthProvider clientId={init?.googleOauthClientId ?? ""}>
      <ThemeProvider theme={DARK_THEME}>
        <CssBaseline />
        {loading ? (
          <FullscreenCenter>
            <CircularProgress />
          </FullscreenCenter>
        ) : error ? (
          <FullscreenCenter>
            <Alert severity="error">
              All identity providers are misconfigured. The developer has been
              notified. Please try again later.
            </Alert>
          </FullscreenCenter>
        ) : postLoginRedirect && init?.user ? (
          <FullscreenCenter>
            <CircularProgress />
          </FullscreenCenter>
        ) : init?.user ? (
          <AuthenticatedApp
            currentUser={init.user}
            adminBaseUrl={init.adminBaseUrl}
            onLogout={handleLogout}
            onCurrentUserUpdated={handleCurrentUserUpdated}
          />
        ) : (
          <UnauthenticatedApp
            onAuthenticated={handleAuthenticated}
            redirectTo={postLoginRedirect}
          />
        )}
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}
