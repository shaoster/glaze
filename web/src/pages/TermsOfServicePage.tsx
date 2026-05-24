import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";

export default function TermsOfServicePage() {
  return (
    <Container
      maxWidth="md"
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
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h4" component="h1" gutterBottom>
              Terms of Service
            </Typography>
            <Typography color="text.secondary">
              Effective May 21, 2026
            </Typography>
          </Box>

          <Typography variant="body1" sx={{ fontStyle: "italic" }}>
            By using PotterDoc, you agree to these terms. If you do not agree,
            do not use the app.
          </Typography>

          <Typography variant="body1">
            PotterDoc is provided on an &quot;as is&quot; and &quot;as
            available&quot; basis. By using the app, you acknowledge that no
            software service is perfectly secure or error-free, and you accept
            the ordinary risks that come with storing information online.
          </Typography>

          <Typography variant="body1">
            You are responsible for deciding what information you choose to
            upload. We do our best to operate the service responsibly, but we
            are not liable for data loss, unauthorized access, leakage,
            corruption, downtime, or other harms arising from your use of the
            app.
          </Typography>

          <Typography variant="body1">
            As the service grows, we may add paid or volunteer administrators.
            A rogue or careless administrator could accidentally or deliberately
            delete or expose your data, and the owner of the site cannot be
            held liable for that. We take hourly backups to Dropbox. If a
            malicious administrator deletes all the backups and disables the
            backup job before other administrators notice, we may have
            substantial data loss &mdash; though if we catch it quickly enough
            we can revoke their access and attempt a restore using
            Dropbox&apos;s own file-retention history. It is also possible,
            though unlikely, that a rogue administrator could steal or sell
            your data. We have no capacity to compensate you for that loss.
          </Typography>

          <Typography variant="body1">
            You may not use PotterDoc for any unlawful purpose or in any way
            that violates these terms. We reserve the right to suspend or
            terminate access for any user who violates these terms or whose
            use of the service we deem harmful to others or to the service
            itself.
          </Typography>

          <Typography variant="body1">
            We reserve the right to modify these terms at any time. Continued
            use of the app after changes are posted constitutes acceptance of
            the revised terms.
          </Typography>

          <Box sx={{ pt: 1 }}>
            <Button component={Link} to="/" variant="outlined">
              Back to Login
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}
