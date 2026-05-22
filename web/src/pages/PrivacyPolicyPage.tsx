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
        <Stack spacing={3}>
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

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>What we collect</SectionHeader>
            <Typography variant="body1">
              We intentionally store a single pseudonymized identifier: a hashed
              version of your OpenID from your identity provider. This is the
              only account credential we keep. It lets you log in — and
              that&apos;s it.
            </Typography>
            <Typography variant="body1">
              We do not see your email address, display name, or avatar. We
              deliberately request only your OpenID from Google, which we hash
              before storing, and nothing else.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>What we don&apos;t collect — and why</SectionHeader>
            <Typography variant="body1">
              We make a deliberate effort to store no direct personally
              identifiable information. We don&apos;t know who you are, we
              don&apos;t want to know who you are, and you shouldn&apos;t tell
              us who you are. Don&apos;t write notes like &quot;my email is
              blahblahblah@example.com&quot;. Don&apos;t set piece showcase text
              to &quot;DM me at @potteryraptorlolz&quot;.
            </Typography>
            <Typography variant="body1">
              We will do what is reasonable as part-time maintainers to protect
              your data from leakage, but given our limited resources and team
              size it&apos;s more important that we make sure your data
              doesn&apos;t evaporate than to maintain rotating encryption keys
              that require operational overhead we can&apos;t reliably sustain
              at our scale.
            </Typography>
            <Typography variant="body1">
              Don&apos;t believe us? That&apos;s fair. Our code is open source —
              look at it and host it yourself. If you want additional separation
              when signing in with Google, consider using a throwaway Google
              account.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>How we use your data</SectionHeader>
            <Typography variant="body1">
              We reserve the right to access, review, and use user-submitted
              data as reasonably necessary to operate, maintain, secure, debug,
              support, and improve PotterDoc. We do not sell your data or sell
              third-party access to your data.
            </Typography>
            <Typography variant="body1">
              Media and data you upload may be used to improve the product. For
              example, we may use your pottery photos to help train a machine
              learning algorithm to better auto-crop pottery media or
              automatically identify which workflow state a piece should be in,
              or we may use state data to help automatically identify which clay
              body was used. This use is also described in our{" "}
              <Box component={Link} to="/terms-of-service" sx={{ color: "inherit" }}>
                Terms of Service
              </Box>
              .
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Media and external hosting</SectionHeader>
            <Typography variant="body1">
              Media is hosted by a third-party media hosting service (currently{" "}
              <Box
                component="a"
                href="https://cloudinary.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "inherit" }}
              >
                Cloudinary
              </Box>
              ). When you remove a media file from a piece or delete your
              account, the link between your account and the media file is
              immediately severed. The media file itself is deleted from the
              external host asynchronously, typically within a few days.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>A note on EXIF data</SectionHeader>
            <Typography variant="body1">
              Photos taken on a phone or camera typically embed metadata
              including the camera model, timestamp, and in some cases GPS
              coordinates. We automatically strip EXIF metadata from uploaded
              media before it is stored or served.
            </Typography>
            <Typography variant="body1">
              In the future we may want to preserve specific camera information
              and timestamps to help improve our image processing — for example,
              automatically selecting the correct workflow state based on
              timestamp, or using the camera model to better auto-crop images.
              If and when we do so, we will provide an in-app notification of
              this intent with explicit opt-in procedures.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Sharing</SectionHeader>
            <Typography variant="body1">
              PotterDoc lets you share individual pieces with others. Sharing is
              opt-in and fine-grained — you control exactly which pieces are
              shared and when. Nothing is public by default.
            </Typography>
            <Typography variant="body1">
              When you choose to share a piece, any information you have added
              to it may be visible to anyone with the link. You are responsible
              for what you share and with whom. We bear no responsibility for
              content you choose to make accessible to others.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Deleting your account</SectionHeader>
            <Typography variant="body1">
              When you delete your account, all your user data is deleted and
              cannot be easily recovered. If you delete your account in error,
              email us at{" "}
              <Box
                component="a"
                href="mailto:admin@potterdoc.com"
                sx={{ color: "inherit" }}
              >
                admin@potterdoc.com
              </Box>{" "}
              and we&apos;ll do our best to pull data from a backup if you make
              the request quickly enough. That process will be ad hoc and best
              effort — we don&apos;t store anything that identifies you and have
              no automated way to validate your identity once your account is
              gone.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Third-party services and data location</SectionHeader>
            <Typography variant="body1">
              The maintainers are based in New York City. Your code, media, and
              backups are stored by hosting providers that operate in the United
              States. If you are located outside the US, be aware that your data
              will be transferred to and processed there.
            </Typography>
            <Typography variant="body1">
              PotterDoc uses a small number of third-party services to operate.
              Your data may pass through or be stored by:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              <Typography component="li" variant="body1">
                <strong>Google OAuth</strong> — for sign-in. We request only
                your OpenID; Google&apos;s handling of that request is governed
                by{" "}
                <Box
                  component="a"
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: "inherit" }}
                >
                  Google&apos;s Privacy Policy
                </Box>
                .
              </Typography>
              <Typography component="li" variant="body1" sx={{ mt: 1 }}>
                <strong>Cloudinary</strong> — for media storage and delivery.
                Their handling is governed by{" "}
                <Box
                  component="a"
                  href="https://cloudinary.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{ color: "inherit" }}
                >
                  Cloudinary&apos;s Privacy Policy
                </Box>
                .
              </Typography>
            </Box>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Cookies and session storage</SectionHeader>
            <Typography variant="body1">
              We use session cookies solely for authentication — to keep you
              logged in. We also use{" "}
              <Box
                component="code"
                sx={{ fontFamily: "monospace", fontSize: "0.9em" }}
              >
                sessionStorage
              </Box>{" "}
              transiently to carry invite codes through the sign-in flow. We do
              not use cookies or local storage for tracking or advertising.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Changes to this policy</SectionHeader>
            <Typography variant="body1">
              We may update this policy from time to time. When we do, we will
              update the effective date at the top of this page. For significant
              changes, we will provide an in-app notification. Continued use of
              the app after changes are posted constitutes acceptance of the
              revised policy.
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <SectionHeader>Your data rights and contact</SectionHeader>
            <Typography variant="body1">
              You can delete your account and all associated data at any time
              from within the app. If you have questions about what data we hold,
              want to request a copy, or want to raise any other concern about
              how your data is handled, email us at{" "}
              <Box
                component="a"
                href="mailto:admin@potterdoc.com"
                sx={{ color: "inherit" }}
              >
                admin@potterdoc.com
              </Box>
              . We&apos;ll do our best to respond promptly given our limited
              capacity as a small team.
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
