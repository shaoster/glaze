import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import {
  generateStaffInviteCode,
  getStaffInviteCode,
  type StaffInviteCodeResponse,
} from "../util/api";

export default function StaffInvitePage() {
  const [inviteCode, setInviteCode] = useState<StaffInviteCodeResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getStaffInviteCode()
      .then(setInviteCode)
      .catch(() => setError("Failed to load invite code."))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const newCode = await generateStaffInviteCode();
      setInviteCode(newCode);
    } catch {
      setError("Failed to generate a new code.");
    } finally {
      setGenerating(false);
    }
  };

  const inviteUrl = inviteCode
    ? `https://potterdoc.com/invite?code=${inviteCode.code}`
    : null;

  const expiryLabel = inviteCode
    ? new Date(inviteCode.expires_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: { xs: 3, sm: 4 } }}>
        <Stack spacing={3} alignItems="center">
          <Typography variant="h5" component="h1">
            Invite Code
          </Typography>

          {loading && <CircularProgress aria-label="Loading invite code" />}

          {error && (
            <Alert severity="error" sx={{ width: "100%" }}>
              {error}
            </Alert>
          )}

          {inviteUrl && (
            <>
              <Box
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <QRCodeSVG value={inviteUrl} size={220} />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                Expires: {expiryLabel}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  textAlign: "center",
                }}
              >
                {inviteCode?.code}
              </Typography>
            </>
          )}

          <Button
            variant="outlined"
            onClick={handleGenerate}
            disabled={generating || loading}
            fullWidth
          >
            {generating ? "Generating…" : "Generate New Code"}
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
