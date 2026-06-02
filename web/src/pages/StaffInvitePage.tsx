import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import {
  generateInviteBatch,
  generateStaffInviteCode,
  getStaffInviteCode,
  sendEmailInvite,
  type StaffInviteCodeResponse,
} from "../util/api";

type Feedback = { severity: "success" | "error"; message: string };

export default function StaffInvitePage() {
  const [inviteCode, setInviteCode] = useState<StaffInviteCodeResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<Feedback | null>(null);

  const [batchCount, setBatchCount] = useState("25");
  const [batching, setBatching] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState<Feedback | null>(null);

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

  const handleSendInvite = async () => {
    setSending(true);
    setSendFeedback(null);
    try {
      await sendEmailInvite(email.trim());
      // Never echo the address back; just confirm it went out.
      setSendFeedback({ severity: "success", message: "Invite sent." });
      setEmail("");
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      const message =
        status === 409
          ? "No invite codes available. Generate a batch first."
          : status === 400
            ? "Enter a valid email address."
            : "Failed to send the invite.";
      setSendFeedback({ severity: "error", message });
    } finally {
      setSending(false);
    }
  };

  const handleGenerateBatch = async () => {
    const count = Number.parseInt(batchCount, 10);
    if (!Number.isInteger(count) || count < 1) {
      setBatchFeedback({
        severity: "error",
        message: "Enter a positive number of codes.",
      });
      return;
    }
    setBatching(true);
    setBatchFeedback(null);
    try {
      const { created } = await generateInviteBatch(count);
      setBatchFeedback({
        severity: "success",
        message: `Generated ${created} invite code${created === 1 ? "" : "s"}.`,
      });
    } catch {
      setBatchFeedback({ severity: "error", message: "Failed to generate codes." });
    } finally {
      setBatching(false);
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

          <Divider flexItem />

          <Stack spacing={1.5} sx={{ width: "100%" }}>
            <Typography variant="h6" component="h2">
              Invite by email
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sends an invite link from the pre-generated pool. The address is
              used only to send the email and is never stored.
            </Typography>
            {sendFeedback && (
              <Alert severity={sendFeedback.severity}>
                {sendFeedback.message}
              </Alert>
            )}
            <TextField
              label="Recipient email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              size="small"
            />
            <Button
              variant="contained"
              onClick={handleSendInvite}
              disabled={sending || email.trim() === ""}
              fullWidth
            >
              {sending ? "Sending…" : "Send invite"}
            </Button>
          </Stack>

          <Divider flexItem />

          <Stack spacing={1.5} sx={{ width: "100%" }}>
            <Typography variant="h6" component="h2">
              Generate code batch
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pre-generate codes so emailed invites can&apos;t be correlated to
              a send by creation time.
            </Typography>
            {batchFeedback && (
              <Alert severity={batchFeedback.severity}>
                {batchFeedback.message}
              </Alert>
            )}
            <TextField
              label="How many"
              type="number"
              value={batchCount}
              onChange={(e) => setBatchCount(e.target.value)}
              fullWidth
              size="small"
              slotProps={{ htmlInput: { min: 1, max: 500 } }}
            />
            <Button
              variant="outlined"
              onClick={handleGenerateBatch}
              disabled={batching}
              fullWidth
            >
              {batching ? "Generating…" : "Generate batch"}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
