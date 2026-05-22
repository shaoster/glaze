import {
  Box,
  Button,
  Container,
  Divider,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { Link } from "react-router-dom";

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="h6" component="h2" sx={{ mt: 0.5 }}>
      {children}
    </Typography>
  );
}

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
        <Stack spacing={3}>
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

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>No warranty</SectionHeader>
            <Typography variant="body1">
              PotterDoc is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis. By using the app, you acknowledge that no
              software service is perfectly secure or error-free, and you accept
              the ordinary risks that come with storing information online.
            </Typography>
            <Typography variant="body1">
              We do our best to operate the service responsibly, but we are not
              liable for data loss, unauthorized access, leakage, corruption,
              downtime, or other harms arising from your use of the app.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Acceptable use</SectionHeader>
            <Typography variant="body1">
              You may use PotterDoc only for lawful purposes and in accordance
              with these terms. You may not:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              <Typography component="li" variant="body1">
                Use the service to store, transmit, or distribute illegal content
              </Typography>
              <Typography component="li" variant="body1" sx={{ mt: 0.5 }}>
                Attempt to scrape, reverse-engineer, or abuse the service in ways
                that degrade it for others
              </Typography>
              <Typography component="li" variant="body1" sx={{ mt: 0.5 }}>
                Impersonate another person or entity
              </Typography>
            </Box>
            <Typography variant="body1">
              We reserve the right to suspend or terminate access for any user
              who violates these terms or whose use of the service we deem
              harmful to others or to the service itself.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Your content</SectionHeader>
            <Typography variant="body1">
              You retain full ownership of everything you upload — your glazing
              recipes, firing notes, techniques, and photos are yours. We claim
              no rights to your pottery secrets.
            </Typography>
            <Typography variant="body1">
              By uploading content, you grant PotterDoc a limited, non-exclusive,
              royalty-free license to store, display, and process that content
              as necessary to operate the service — for example, showing you
              your own photos in the app — and to improve it, for example by
              training machine learning models that help with auto-cropping or
              workflow classification. This license exists solely to run and
              improve PotterDoc and the backing open source project; we will
              not use your content for any other purpose. See our{" "}
              <Box component={Link} to="/privacy-policy" sx={{ color: "inherit" }}>
                Privacy Policy
              </Box>{" "}
              for details on how we handle your data.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Age requirement</SectionHeader>
            <Typography variant="body1">
              PotterDoc is not intended for use by anyone under the age of 13.
              By using the app, you represent that you are at least 13 years
              old. If we become aware that a user is under 13, we will
              terminate their account.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Governing law</SectionHeader>
            <Typography variant="body1">
              These terms are governed by the laws of the State of New York,
              without regard to its conflict of law provisions. Any disputes
              arising under these terms will be subject to the exclusive
              jurisdiction of the courts located in New York County, New York.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Changes to these terms</SectionHeader>
            <Typography variant="body1">
              We reserve the right to modify these terms at any time. Continued
              use of the app after changes are posted constitutes acceptance of
              the revised terms.
            </Typography>
          </Stack>

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
