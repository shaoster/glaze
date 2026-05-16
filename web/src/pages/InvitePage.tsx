import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { acceptInvite } from "../util/api";

export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [state, setState] = useState<"loading" | "ready" | "error">(
    token ? "loading" : "error"
  );
  const [invitedEmail, setInvitedEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "No invitation token found in the URL."
  );

  useEffect(() => {
    if (!token) return;
    acceptInvite(token)
      .then(({ email }) => {
        setInvitedEmail(email);
        setState("ready");
      })
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail ?? "Invalid or expired invitation link.";
        setErrorMessage(msg);
        setState("error");
      });
  }, [token]);

  return (
    <Container
      maxWidth="sm"
      sx={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        px: { xs: 2, sm: 3 },
        py: 3,
      }}
    >
      <Paper sx={{ width: "100%", p: { xs: 2.5, sm: 4 }, borderRadius: { xs: 3, sm: 4 } }}>
        <Stack spacing={2} alignItems="center">
          {state === "loading" && <CircularProgress aria-label="Validating invitation" />}

          {state === "ready" && (
            <>
              <Alert severity="success" sx={{ width: "100%" }}>
                You've been invited! Sign in below to finish setup.
              </Alert>
              <Typography variant="body1" textAlign="center">
                Your invitation email: <strong>{invitedEmail}</strong>
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/", { state: { prefillEmail: invitedEmail } })}
                fullWidth
              >
                Continue to sign in
              </Button>
            </>
          )}

          {state === "error" && (
            <>
              <Alert severity="error" sx={{ width: "100%" }}>
                {errorMessage}
              </Alert>
              <Button variant="outlined" onClick={() => navigate("/")}>
                Go to sign in
              </Button>
            </>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
