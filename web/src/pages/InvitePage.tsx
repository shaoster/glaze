import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";

export default function InvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const code = searchParams.get("code") ?? "";

  // There is intentionally no pre-flight validity check: a read-only "is this
  // code valid" endpoint would be a redemption oracle (see docs/security.md).
  // We stash the code and let sign-in validate it at redemption, where the
  // check is authenticated and consumes the code.
  const [state] = useState<"ready" | "error">(code ? "ready" : "error");

  useEffect(() => {
    if (code) sessionStorage.setItem("pendingInviteCode", code);
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
          {state === "ready" && (
            <>
              <Alert severity="success" sx={{ width: "100%" }}>
                You&apos;ve been invited to PotterDoc. Sign in with Google to
                create your account.
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
                No invite code found in the URL.
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
