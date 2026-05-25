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
import { validateInviteCode } from "../util/api";

export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get("code") ?? "";

  const [state, setState] = useState<"loading" | "ready" | "error">(
    code ? "loading" : "error",
  );
  const [errorMessage, setErrorMessage] = useState(
    code ? "" : "No invite code found in the URL.",
  );

  useEffect(() => {
    if (!code) return;
    validateInviteCode(code)
      .then(() => {
        sessionStorage.setItem("pendingInviteCode", code);
        setState("ready");
      })
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail ?? "Invalid or expired invitation link.";
        setErrorMessage(msg);
        setState("error");
      });
  }, [code]);

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
      <Paper
        sx={{
          width: "100%",
          p: { xs: 2.5, sm: 4 },
          borderRadius: { xs: 3, sm: 4 },
        }}
      >
        <Stack spacing={2} alignItems="center">
          {state === "loading" && (
            <CircularProgress aria-label="Validating invite code" />
          )}

          {state === "ready" && (
            <>
              <Alert severity="success" sx={{ width: "100%" }}>
                Your invite code is valid! Sign in with Google to create your
                account.
              </Alert>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                No personal information is stored. Only a secure hash of your
                Google identity is saved.
              </Typography>
              <Button
                variant="contained"
                onClick={() => navigate("/")}
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
