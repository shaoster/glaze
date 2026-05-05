import { useState } from "react";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import IosShareIcon from "@mui/icons-material/IosShare";
import PublicIcon from "@mui/icons-material/Public";
import PublicOffIcon from "@mui/icons-material/PublicOff";
import { alpha, Box, Button, Stack, Typography } from "@mui/material";
import { Cloudinary } from "@cloudinary/url-gen";
import { fill } from "@cloudinary/url-gen/actions/resize";
import { format, quality } from "@cloudinary/url-gen/actions/delivery";
import { jpg } from "@cloudinary/url-gen/qualifiers/format";
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality";
import { autoGravity } from "@cloudinary/url-gen/qualifiers/gravity";
import type { PieceDetail, Thumbnail } from "../util/types";
import { updatePiece } from "../util/api";

const SHARE_IMAGE_SIZE = 600;

function buildThumbnailShareUrl(thumbnail: Thumbnail): string {
  const cloudName = thumbnail.cloud_name?.trim() ?? null;
  const publicId = thumbnail.cloudinary_public_id?.trim() ?? null;
  if (cloudName && publicId) {
    const cld = new Cloudinary({ cloud: { cloudName } });
    const img = cld.image(publicId);
    img.resize(fill().width(SHARE_IMAGE_SIZE).height(SHARE_IMAGE_SIZE).gravity(autoGravity()));
    img.delivery(format(jpg()));
    img.delivery(quality(autoQuality()));
    return img.toURL();
  }
  return thumbnail.url;
}

function publicPieceUrl(pieceId: string): string {
  return `${window.location.origin}/pieces/${pieceId}`;
}

export default function ShareControls({
  piece,
  onPieceUpdated,
}: {
  piece: PieceDetail;
  onPieceUpdated: (updated: PieceDetail) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const publicUrl = publicPieceUrl(piece.id);
  const canUseNativeShare = typeof navigator.share === "function";

  async function toggleShared() {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updatePiece(piece.id, { shared: !piece.shared });
      onPieceUpdated(updated);
      setMessage(updated.shared ? "Public link created." : "Public link disabled.");
    } catch {
      setMessage("Failed to update sharing. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage("Public link copied.");
    } catch {
      setMessage("Could not copy the public link.");
    }
  }

  async function shareLink() {
    if (!canUseNativeShare) return;
    try {
      const shareData: ShareData = { title: piece.name, text: piece.name, url: publicUrl };
      if (piece.thumbnail) {
        const imageUrl = buildThumbnailShareUrl(piece.thumbnail);
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const file = new File([blob], "thumbnail.jpg", { type: blob.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [file] })) {
            shareData.files = [file];
          }
        } catch {
          // Thumbnail fetch failure is non-fatal — share without the image.
        }
      }
      await navigator.share(shareData);
    } catch {
      // Browser share sheets reject when the user cancels; no UI error needed.
    }
  }

  return (
    <Box
      sx={(theme) => ({
        borderRadius: "6px",
        border: "1px solid",
        borderColor: "divider",
        backgroundColor: alpha(theme.palette.background.paper, 0.66),
        backdropFilter: "blur(14px)",
        boxShadow: `0 14px 34px ${alpha(theme.palette.common.black, 0.14)}`,
        overflow: "hidden",
      })}
    >
      <Box sx={{ px: { xs: 1.5, sm: 2 }, pt: 1.25, pb: 0.75 }}>
        <Typography variant="h6" component="h3">
          Share
        </Typography>
      </Box>
      <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 1.5 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Button
            variant={piece.shared ? "outlined" : "contained"}
            startIcon={piece.shared ? <PublicOffIcon /> : <PublicIcon />}
            onClick={() => void toggleShared()}
            disabled={saving}
          >
            {piece.shared ? "Unshare" : "Share"}
          </Button>
          {piece.shared && (
            <>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={() => void copyLink()}
              >
                Copy link
              </Button>
              {canUseNativeShare && (
                <Button
                  variant="outlined"
                  startIcon={<IosShareIcon />}
                  onClick={() => void shareLink()}
                >
                  Share
                </Button>
              )}
            </>
          )}
        </Stack>
        {piece.shared && (
          <Typography
            variant="caption"
            sx={{
              display: "block",
              mt: 0.75,
              color: "text.secondary",
              overflowWrap: "anywhere",
            }}
          >
            {publicUrl}
          </Typography>
        )}
        {message && (
          <Typography
            variant="body2"
            color={
              message.startsWith("Failed") || message.startsWith("Could")
                ? "error"
                : "text.secondary"
            }
            sx={{ mt: 0.75 }}
          >
            {message}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
