import { useEffect, useState } from "react";
import CropIcon from "@mui/icons-material/Crop";
import EditIcon from "@mui/icons-material/Edit";
import PhotoSizeSelectActualIcon from "@mui/icons-material/PhotoSizeSelectActual";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { PieceDetail } from "../util/types";
import type { moveImage } from "../util/api";
import type { PiecePhotoGalleryImage } from "./PiecePhotoGallery";

type PieceStateRef = {
  id: string;
  label: string;
};

export type LightboxFooterProps = {
  activeImage: PiecePhotoGalleryImage | null;
  /** Null means the caption is read-only for the active image. */
  onSaveCaption: ((caption: string) => Promise<void>) | null;
  pieceStates?: PieceStateRef[];
  moveImageFn?: typeof moveImage;
  onPieceUpdated?: (updated: PieceDetail) => void;
  /** Called after a successful move so the parent can navigate away. */
  onMoveSuccess: () => void;
  isCurrentThumbnail: boolean;
  /** Absent means thumbnail controls are not available. Footer owns loading state. */
  onSetAsThumbnail?: () => Promise<void>;
  /** Passed through from ImageLightbox's footerActions render prop. */
  onCrop?: () => void;
  cropAvailable?: boolean;
};

/**
 * Footer content rendered inside the ImageLightbox for piece photos.
 *
 * Owns caption-editing, photo-move, and thumbnail-setting state so
 * PiecePhotoGallery only coordinates data flow and route-level navigation.
 * Resets its local state whenever `activeImage` changes.
 */
export default function LightboxFooter({
  activeImage,
  onSaveCaption,
  pieceStates,
  moveImageFn,
  onPieceUpdated,
  onMoveSuccess,
  isCurrentThumbnail,
  onSetAsThumbnail,
  onCrop,
  cropAvailable,
}: LightboxFooterProps) {
  const [captionDraft, setCaptionDraft] = useState(activeImage?.caption ?? "");
  const [captionEditing, setCaptionEditing] = useState(false);
  const [captionSaving, setCaptionSaving] = useState(false);
  const [captionSaveError, setCaptionSaveError] = useState<string | null>(null);
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveMenuAnchor, setMoveMenuAnchor] = useState<HTMLElement | null>(null);
  const [settingThumbnail, setSettingThumbnail] = useState(false);

  const canEditCaption = onSaveCaption !== null;
  const showMoveButton =
    activeImage?.image_id && pieceStates && pieceStates.length > 1;
  const canMove = Boolean(moveImageFn) && !moveSaving;

  useEffect(() => {
    if (!activeImage) return;
    setCaptionEditing(false);
    setCaptionSaveError(null);
    setMoveError(null);
    setCaptionDraft(activeImage.caption ?? "");
  }, [activeImage]);

  function stopEditingCaption() {
    setCaptionEditing(false);
    setCaptionSaveError(null);
    setCaptionDraft(activeImage?.caption ?? "");
  }

  async function handleSaveCaption() {
    if (!onSaveCaption) return;
    setCaptionSaving(true);
    setCaptionSaveError(null);
    try {
      await onSaveCaption(captionDraft.trim());
      setCaptionEditing(false);
    } catch {
      setCaptionSaveError("Failed to save caption. Please try again.");
    } finally {
      setCaptionSaving(false);
    }
  }

  async function handleMoveImage(toStateId: string) {
    if (!activeImage?.image_id || !moveImageFn || !onPieceUpdated) return;
    setMoveSaving(true);
    setMoveError(null);
    try {
      const updated = await moveImageFn(
        activeImage.image_id,
        activeImage.stateId,
        toStateId,
      );
      onPieceUpdated(updated);
      onMoveSuccess();
    } catch {
      setMoveError("Failed to move photo. Please try again.");
    } finally {
      setMoveSaving(false);
    }
  }

  async function handleSetAsThumbnail() {
    if (!onSetAsThumbnail) return;
    setSettingThumbnail(true);
    try {
      await onSetAsThumbnail();
    } finally {
      setSettingThumbnail(false);
    }
  }

  if (!activeImage) return null;

  return (
    <Box sx={{ display: "grid", gap: 0.75, justifyItems: "center" }}>
      {captionEditing ? (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            size="small"
            value={captionDraft}
            onChange={(event) => setCaptionDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSaveCaption();
              if (event.key === "Escape") stopEditingCaption();
            }}
            autoFocus
            slotProps={{ htmlInput: { "aria-label": "Edit photo caption" } }}
            sx={{
              minWidth: 220,
              "& .MuiOutlinedInput-root": {
                backgroundColor: "rgba(255,255,255,0.08)",
                color: "white",
              },
            }}
          />
          <Button size="small" variant="contained" onClick={() => void handleSaveCaption()} disabled={captionSaving}>
            {captionSaving ? "Saving…" : "Save"}
          </Button>
          <Button size="small" variant="text" onClick={stopEditingCaption} disabled={captionSaving}>
            Cancel
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
          {/* Caption */}
          {activeImage.caption ? (
            <Tooltip title={canEditCaption ? "Edit caption" : activeImage.caption}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditIcon fontSize="small" />}
                onClick={() => { if (canEditCaption) setCaptionEditing(true); }}
                disabled={!canEditCaption}
                sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)", textTransform: "none", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {activeImage.caption}
              </Button>
            </Tooltip>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditIcon fontSize="small" />}
              onClick={() => { setCaptionDraft(""); setCaptionEditing(true); }}
              disabled={!canEditCaption}
              sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)" }}
            >
              Caption
            </Button>
          )}

          {/* Move to */}
          {showMoveButton && (
            <>
              <Button
                size="small"
                variant="outlined"
                disabled={!canMove}
                onClick={(e) => { if (canMove) setMoveMenuAnchor(e.currentTarget); }}
                sx={{ color: "white", borderColor: "rgba(255,255,255,0.35)" }}
              >
                {moveSaving ? "Moving…" : "Move to…"}
              </Button>
              <Menu
                anchorEl={moveMenuAnchor}
                open={Boolean(moveMenuAnchor)}
                onClose={() => setMoveMenuAnchor(null)}
              >
                {pieceStates!
                  .filter((s) => s.id !== activeImage.stateId)
                  .map((s) => (
                    <MenuItem
                      key={s.id}
                      onClick={() => {
                        setMoveMenuAnchor(null);
                        void handleMoveImage(s.id);
                      }}
                    >
                      {s.label}
                    </MenuItem>
                  ))}
              </Menu>
            </>
          )}

          {/* Thumbnail */}
          {onSetAsThumbnail && (
            <Tooltip title={isCurrentThumbnail ? "Current thumbnail" : "Set as thumbnail"}>
              <span>
                <IconButton
                  disabled={isCurrentThumbnail || settingThumbnail}
                  onClick={() => void handleSetAsThumbnail()}
                  aria-label="Set as thumbnail"
                  sx={{ color: "white" }}
                >
                  {settingThumbnail
                    ? <CircularProgress size={20} sx={{ color: "white" }} />
                    : <PhotoSizeSelectActualIcon />}
                </IconButton>
              </span>
            </Tooltip>
          )}

          {/* Crop */}
          {cropAvailable && (
            <Tooltip title={onCrop ? "Edit crop" : "Crop only available for Cloudinary images"}>
              <span>
                <IconButton onClick={onCrop} disabled={!onCrop} aria-label="Edit crop" sx={{ color: "white" }}>
                  <CropIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      )}
      {captionSaveError && (
        <Typography variant="caption" sx={{ color: "error.light" }}>{captionSaveError}</Typography>
      )}
      {moveError && (
        <Typography variant="caption" sx={{ color: "error.light" }}>{moveError}</Typography>
      )}
      <Typography variant="caption" sx={{ color: "rgba(255,255,255,0.55)" }}>
        {canEditCaption ? "Added in current state" : `Added in ${activeImage.stateLabel}`}
      </Typography>
    </Box>
  );
}
