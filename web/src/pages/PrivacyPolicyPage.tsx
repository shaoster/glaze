import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";

export default function PrivacyPolicyPage() {
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
              Privacy Policy
            </Typography>
            <Typography color="text.secondary">
              Effective April 22, 2026
            </Typography>
          </Box>

          <Typography variant="body1" sx={{ fontStyle: "italic" }}>
            By using PotterDoc, you agree to our privacy policy as described
            below. If you do not agree with our policies and practices, do not
            use the app.
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
            We reserve the right to access, review, and use user-submitted data
            as reasonably necessary to operate, maintain, secure, debug,
            support, and improve PotterDoc. We do not sell your data or sell
            third-party access to your data.
          </Typography>

          <Typography variant="body1">
            We encourage users to avoid storing personally identifiable
            information in PotterDoc whenever possible. If you need to use
            Google sign-in and want additional separation, consider using a
            throwaway Google account.
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
