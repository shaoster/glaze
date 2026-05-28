import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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
              Effective May 28, 2026
            </Typography>
          </Box>

          <Typography variant="body1" sx={{ fontStyle: "italic" }}>
            By using PotterDoc, you agree to our privacy policy as described
            below. If you do not agree with our policies and practices, do not
            use the app.
          </Typography>

          <Typography variant="body1">
            We make a deliberate effort to store no direct personally
            identifiable information (PII). The only piece of information we
            intentionally store is a single pseudonymized identifier: a hashed
            version of your OpenID from your identity provider. This lets you
            log in and that&apos;s it. We don&apos;t see your email, name, or
            avatar — we deliberately request only your OpenID, which we hash
            before storing, and nothing else. Don&apos;t believe us? That&apos;s
            fine. Look at our code and host it yourself.
          </Typography>

          <Typography variant="body1">
            We don&apos;t know who you are, we don&apos;t want to know who you
            are, and you shouldn&apos;t tell us who you are. Don&apos;t write
            notes saying &quot;my email is blahblahblah@example.com&quot;.
            Don&apos;t set piece showcase text to &quot;DM me at
            @potteryraptorlolz&quot;. We will do what is reasonable as part-time
            maintainers to protect your data from leakage, but given our
            extremely limited resources it&apos;s more important that we make
            sure your data doesn&apos;t evaporate than to encrypt everything
            with keys in a keyring we get locked out of when a phone dies or a
            computer breaks during an apartment move.
          </Typography>

          <Typography variant="body1">
            You are responsible for deciding what information you choose to
            upload. We do our best to operate the service responsibly, but we
            are not liable for data loss, unauthorized access, leakage,
            corruption, downtime, or other harms arising from your use of the
            app.
          </Typography>

          <Typography variant="body1">
            As the service grows, we may grant administrative access to paid or
            volunteer contributors. Administrators can see your data as part of
            operating and maintaining the service. A rogue or careless
            administrator could accidentally or deliberately expose or delete
            it. We take hourly backups to Dropbox. These backups are
            intentionally not encrypted: encrypting them would mean a rogue
            administrator could destroy the key and make recovery impossible,
            which is a worse outcome than the backups being readable. We will
            revoke access as quickly as we become aware of any misuse, but we
            cannot guarantee we will catch it in time. If you are concerned
            about this, the source code is public and you are welcome to
            self-host.
          </Typography>

          <Typography variant="body1">
            We reserve the right to access, review, and use user-submitted data
            as reasonably necessary to operate, maintain, secure, debug,
            support, and improve PotterDoc. We do not sell your data or sell
            third-party access to your data.
          </Typography>

          <Typography variant="body1">
            We also collect frontend usage traces from the browser to help us
            fix bugs, reproduce UI issues, and reduce friction points in the
            product experience. These traces can include page navigation,
            user interactions, request timing, and related performance metadata
            needed to understand what happened in the app. We use them to
            diagnose problems and improve the UI, not for advertising.
          </Typography>

          <Typography variant="body1">
            Images and data you upload may be used to improve the product. For
            example, we may use your pottery photo to help train a machine
            learning algorithm to better auto-crop pottery images or
            automatically identify which workflow state a piece should be added
            to, or we may use the data entered for various states to help us
            automatically figure out which clay body was used.
          </Typography>

          <Typography variant="body1">
            Images are externally hosted. The moment you delete your account or
            remove an image from a piece, the link from your account to the
            image is immediately severed. Removal of the image from the external
            host is best-effort and may not happen immediately. If you need a
            specific image deleted promptly, email us at{" "}
            <Box
              component="a"
              href="mailto:admin@potterdoc.com"
              sx={{ color: "inherit" }}
            >
              admin@potterdoc.com
            </Box>{" "}
            and we will prioritize it. EXIF data is automatically stripped from
            your uploaded images before they are stored. What remains after
            stripping is limited to image structure and color profile data
            needed to display the image correctly — for example:
          </Typography>

          <Accordion disableGutters elevation={0} sx={{ bgcolor: "action.hover", borderRadius: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">Example: retained image metadata</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Box
                component="pre"
                sx={{
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  overflowX: "auto",
                  m: 0,
                  lineHeight: 1.6,
                }}
              >{`BitsPerSample           8
BlueMatrixColumn        0.1571 0.06657 0.78407
BlueTRC                 Binary data 32 bytes
CMMFlags                Not Embedded, Independent
ChromaticAdaptation     1.04788 0.02292 -0.0502 0.02959 0.99048 -0.01706 -0.00923 0.01508 0.75168
ColorComponents         3
ColorSpaceData          RGB
ConnectionSpaceIlluminant 0.9642 1 0.82491
DeviceAttributes        Reflective, Glossy, Positive, Color
DeviceManufacturer      Apple Computer Inc.
EncodingProcess         Progressive DCT, Huffman coding
FileType                JPEG
GreenMatrixColumn       0.29198 0.69225 0.04189
GreenTRC                Binary data 32 bytes
ImageHeight             1032
ImageSize               774x1032
ImageWidth              774
JFIFVersion             1.01
MIMEType                image/jpeg
MediaWhitePoint         0.96419 1 0.82489
Megapixels              0.799
PrimaryPlatform         Apple Computer Inc.
ProfileClass            Display Device Profile
ProfileConnectionSpace  XYZ
ProfileCopyright        Copyright Apple Inc., 2022
ProfileDescription      Display P3
ProfileVersion          4.0.0
RedMatrixColumn         0.51512 0.2412 -0.00105
RedTRC                  Binary data 32 bytes
RenderingIntent         Perceptual
ResolutionUnit          None
XResolution             1
YCbCrSubSampling        YCbCr4:2:0 (2 2)
YResolution             1`}</Box>
            </AccordionDetails>
          </Accordion>

          <Typography variant="body1">
            No GPS coordinates, camera make or model, capture timestamp, or
            other identifying metadata is retained.
          </Typography>

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
            the request fast enough. That process will be mostly ad hoc and best
            effort, since we don&apos;t store anything about you and don&apos;t
            have an automated way to validate your identity once your account is
            gone.
          </Typography>

          <Typography variant="body1">
            We encourage users to avoid storing personally identifiable
            information in PotterDoc whenever possible. If you need to use
            Google sign-in and want additional separation, consider using a
            throwaway Google account.
          </Typography>

          <Typography variant="body1">
            We may update this privacy policy in the future. We will announce
            any changes clearly and give you a reasonable window to review them.
            For changes that materially affect how your data is handled, we will
            provide an explicit opt-out before the new policy applies to you. In
            extreme cases, the opt-out may take the form of a data export tool
            so you can take your pottery records elsewhere &mdash; a self-hosted
            instance, another service, or a local file. We will not hold your
            data hostage to a policy you do not accept.
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
