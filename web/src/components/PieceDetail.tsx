import { type ReactNode, useRef, useState } from "react";
import {
  Alert,
  alpha,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { useBlocker } from "react-router-dom";
import type { PieceDetail as PieceDetailType } from "../util/types";
import { formatState, isTerminalState } from "../util/types";
import { addPieceState, updateCurrentState, updatePiece } from "../util/api";
import CloudinaryImage from "./CloudinaryImage";
import WorkflowState from "./WorkflowState";
import TagManager from "./TagManager";
import StateTransition from "./StateTransition";
import PieceHistory from "./PieceHistory";
import GlobalEntryField from "./GlobalEntryField";
import PiecePhotoGallery, {
  type PiecePhotoGalleryImage,
} from "./PiecePhotoGallery";
import { PieceDetailSaveStatusProvider } from "./PieceDetailSaveStatusContext";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";

type PieceDetailProps = {
  piece: PieceDetailType;
  onPieceUpdated: (updated: PieceDetailType) => void;
};

type SectionCardProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
};

function SectionCard({
  eyebrow,
  title,
  subtitle,
  children,
}: SectionCardProps) {
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
        {(eyebrow || title || subtitle) && (
          <>
            {eyebrow && (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  mb: 0.25,
                  color: "text.secondary",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {eyebrow}
              </Typography>
            )}
            {(title || subtitle) && (
              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                {title ? (
                  <Typography variant="h6" component="h3">
                    {title}
                  </Typography>
                ) : (
                  <Box />
                )}
                {subtitle && (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {subtitle}
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
      <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 1.5 }}>{children}</Box>
    </Box>
  );
}

function normalizeAdditionalFields(
  fields: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === "object" && value !== null && "id" in value) {
      const id = (value as { id: unknown }).id;
      result[key] = typeof id === "string" ? id : null;
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      result[key] = value;
    } else {
      result[key] = null;
    }
  }
  return result;
}

export default function PieceDetail({
  piece,
  onPieceUpdated,
}: PieceDetailProps) {
  return (
    <PieceDetailSaveStatusProvider>
      <PieceDetailContent piece={piece} onPieceUpdated={onPieceUpdated} />
    </PieceDetailSaveStatusProvider>
  );
}

function PieceDetailContent({
  piece,
  onPieceUpdated,
}: PieceDetailProps) {
  const theme = useTheme();
  const [isDirty, setIsDirty] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(piece.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const pieceDetailSaveStatus = usePieceDetailSaveStatus();
  const currentState = piece.current_state;
  const isTerminal = isTerminalState(currentState.state);
  const pastHistory = piece.history.slice(0, -1);
  function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  }
  const createdLabel = formatDate(piece.created);
  const modifiedLabel = formatDate(piece.last_modified);
  const galleryImages: PiecePhotoGalleryImage[] = piece.history.flatMap((state) => {
    const isCurrentState =
      state.created.getTime() === currentState.created.getTime() &&
      state.state === currentState.state;
    return state.images.map((image, imageIndex) => ({
      ...image,
      stateLabel: formatState(state.state),
      editableCurrentStateIndex: isCurrentState ? imageIndex : null,
    }));
  });
  const editButtonSx = {
    width: 22,
    height: 22,
    borderRadius: "4px",
    border: "1px solid",
    borderColor: "divider",
    color: "text.secondary",
    backgroundColor: alpha(theme.palette.background.paper, 0.38),
  } as const;

  const blocker = useBlocker(isDirty);

  async function handleTransition(nextState: string) {
    setTransitioning(true);
    setTransitionError(null);
    try {
      const updated = await addPieceState(piece.id, {
        state: nextState as PieceDetailType["current_state"]["state"],
      });
      onPieceUpdated(updated);
      setIsDirty(false);
    } catch {
      setTransitionError("Failed to transition state. Please try again.");
    } finally {
      setTransitioning(false);
    }
  }

  function startEditingName() {
    setNameValue(piece.name);
    setNameError(null);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  function cancelEditingName() {
    setEditingName(false);
    setNameError(null);
    setNameValue(piece.name);
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty.");
      return;
    }
    if (trimmed === piece.name) {
      setEditingName(false);
      return;
    }
    setNameSaving(true);
    setNameError(null);
    try {
      const saveNameRequest = () => updatePiece(piece.id, { name: trimmed });
      const updated = pieceDetailSaveStatus
        ? await pieceDetailSaveStatus.runManualSave(saveNameRequest)
        : await saveNameRequest();
      onPieceUpdated(updated);
      setEditingName(false);
    } catch {
      setNameError("Failed to save name. Please try again.");
    } finally {
      setNameSaving(false);
    }
  }

  async function handleLocationSelect(entry: { id: string; name: string } | null) {
    setLocationSaving(true);
    setLocationError(null);
    try {
      const saveLocationRequest = () =>
        updatePiece(piece.id, {
          current_location: entry?.name ?? "",
        });
      const updated = pieceDetailSaveStatus
        ? await pieceDetailSaveStatus.runManualSave(saveLocationRequest)
        : await saveLocationRequest();
      onPieceUpdated(updated);
    } catch {
      setLocationError("Failed to save location. Please try again.");
    } finally {
      setLocationSaving(false);
    }
  }

  return (
    <Box
      sx={{
        textAlign: "left",
        px: { xs: 1.5, sm: 2.5 },
        pb: 4,
      }}
    >
      <Box sx={{ mx: "auto", maxWidth: 980, background: "transparent" }}>
        {/* Desktop: two-column hero+info; Mobile: stacked */}
        <Box
          sx={{
            display: { xs: "grid", md: "grid" },
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
            gridTemplateAreas: {
              xs: '"hero" "info"',
              md: '"info hero"',
            },
            gap: { md: 3 },
            alignItems: "start",
            mb: { xs: 0, md: 2 },
          }}
        >
          {/* Left column (desktop) / bottom (mobile): title + tags + states */}
          <Box sx={{ pt: { xs: 1.75, md: 0 }, pb: 0.5, gridArea: "info" }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                mb: 0.5,
                color: "text.secondary",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Created {createdLabel} · Modified {modifiedLabel}
            </Typography>
            <Box sx={{ minWidth: 0, mb: 1.25 }}>
              {editingName ? (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <TextField
                    inputRef={nameInputRef}
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") cancelEditingName();
                    }}
                    size="small"
                    error={!!nameError}
                    helperText={nameError}
                    disabled={nameSaving}
                    slotProps={{
                      htmlInput: { "aria-label": "Piece name", maxLength: 255 },
                    }}
                    sx={{
                      minWidth: 220,
                      flex: 1,
                      maxWidth: 460,
                    }}
                  />
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <IconButton
                      aria-label="Save name"
                      onClick={saveName}
                      disabled={nameSaving}
                      size="small"
                      color="primary"
                    >
                      <CheckIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      aria-label="Cancel name edit"
                      onClick={cancelEditingName}
                      disabled={nameSaving}
                      size="small"
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography
                    variant="h3"
                    component="h2"
                    sx={{
                      fontSize: { xs: "2rem", sm: "2.6rem", md: "2rem" },
                      lineHeight: 1.05,
                      letterSpacing: "-0.03em",
                      textWrap: "balance",
                    }}
                  >
                    {piece.name}
                  </Typography>
                  <IconButton
                    aria-label="Edit piece name"
                    onClick={startEditingName}
                    size="small"
                    sx={{ ...editButtonSx, alignSelf: "center" }}
                  >
                    <EditIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              )}
            </Box>
            <TagManager
              pieceId={piece.id}
              initialTags={piece.tags ?? []}
              onSaved={onPieceUpdated}
            />
            <Box sx={{ mt: 2, mb: 1.5 }}>
              <StateTransition
                currentStateName={currentState.state}
                disabled={isDirty}
                transitioning={transitioning}
                transitionError={transitionError}
                onTransition={handleTransition}
              />
            </Box>
            <Box sx={{ mb: 1.5 }}>
              <SectionCard>
                <GlobalEntryField
                  globalName="location"
                  label="Current location"
                  value={piece.current_location ?? ""}
                  onSelect={(entry) => void handleLocationSelect(entry)}
                  sx={{ opacity: locationSaving ? 0.7 : 1 }}
                />
                {locationError && (
                  <Typography variant="body2" color="error" sx={{ mt: 0.75 }}>
                    {locationError}
                  </Typography>
                )}
              </SectionCard>
            </Box>
          </Box>

          {/* Right column (desktop) / top (mobile): hero image */}
          <Box sx={{ gridArea: "hero" }}>
            <Box
              sx={(theme) => ({
                position: "relative",
                overflow: "hidden",
                borderRadius: { xs: "8px", md: "10px" },
                minHeight: { xs: 200, sm: 260 },
                aspectRatio: { md: "4 / 3" },
                backgroundColor: alpha(theme.palette.background.paper, 0.46),
                boxShadow: `0 24px 60px ${alpha(theme.palette.common.black, 0.22)}`,
              })}
            >
              {piece.thumbnail ? (
                <Box sx={{ position: "absolute", inset: 0 }}>
                  <CloudinaryImage
                    url={piece.thumbnail.url}
                    cloudinary_public_id={piece.thumbnail.cloudinary_public_id}
                    alt={piece.name}
                    context="detail"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </Box>
              ) : null}
              <Box
                sx={(theme) => ({
                  position: "absolute",
                  inset: 0,
                  background: piece.thumbnail
                    ? `linear-gradient(180deg, ${alpha(theme.palette.common.black, 0.24)} 0%, transparent 40%)`
                    : alpha(theme.palette.background.default, 0.9),
                })}
              />
              {/* Photo gallery button — inside hero on mobile only */}
              <Box
                sx={{
                  display: { xs: "flex", md: "none" },
                  position: "relative",
                  zIndex: 1,
                  justifyContent: "flex-end",
                  p: { xs: 1.5, sm: 2 },
                }}
              >
                <PiecePhotoGallery
                  images={galleryImages}
                  currentThumbnailUrl={piece.thumbnail?.url}
                  onSetAsThumbnail={async (image) => {
                    const updated = await updatePiece(piece.id, {
                      thumbnail: {
                        url: image.url,
                        cloudinary_public_id: image.cloudinary_public_id ?? null,
                      },
                    });
                    onPieceUpdated(updated);
                  }}
                  onSaveCaption={async (currentStateImageIndex, caption) => {
                    const updatedImages = currentState.images.map((image, index) => ({
                      url: image.url,
                      caption: index === currentStateImageIndex ? caption.trim() : image.caption,
                      cloudinary_public_id: image.cloudinary_public_id ?? null,
                    }));
                    const updated = await updateCurrentState(piece.id, {
                      notes: currentState.notes,
                      images: updatedImages,
                      additional_fields: normalizeAdditionalFields(currentState.additional_fields ?? {}),
                    });
                    onPieceUpdated(updated);
                  }}
                  onDeleteImage={async (currentStateImageIndex) => {
                    const updatedImages = currentState.images
                      .filter((_image, index) => index !== currentStateImageIndex)
                      .map((image) => ({
                        url: image.url,
                        caption: image.caption,
                        cloudinary_public_id: image.cloudinary_public_id ?? null,
                      }));
                    const updated = await updateCurrentState(piece.id, {
                      notes: currentState.notes,
                      images: updatedImages,
                      additional_fields: normalizeAdditionalFields(currentState.additional_fields ?? {}),
                    });
                    onPieceUpdated(updated);
                  }}
                />
              </Box>
            </Box>
            {/* Photo gallery + upload trigger — below hero on desktop only */}
            <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 1, mt: 1 }}>
              <Box id="piece-upload-trigger" />
              <PiecePhotoGallery
                images={galleryImages}
                currentThumbnailUrl={piece.thumbnail?.url}
                onSetAsThumbnail={async (image) => {
                  const updated = await updatePiece(piece.id, {
                    thumbnail: {
                      url: image.url,
                      cloudinary_public_id: image.cloudinary_public_id ?? null,
                    },
                  });
                  onPieceUpdated(updated);
                }}
                onSaveCaption={async (currentStateImageIndex, caption) => {
                  const updatedImages = currentState.images.map((image, index) => ({
                    url: image.url,
                    caption: index === currentStateImageIndex ? caption.trim() : image.caption,
                    cloudinary_public_id: image.cloudinary_public_id ?? null,
                  }));
                  const updated = await updateCurrentState(piece.id, {
                    notes: currentState.notes,
                    images: updatedImages,
                    additional_fields: normalizeAdditionalFields(currentState.additional_fields ?? {}),
                  });
                  onPieceUpdated(updated);
                }}
                onDeleteImage={async (currentStateImageIndex) => {
                  const updatedImages = currentState.images
                    .filter((_image, index) => index !== currentStateImageIndex)
                    .map((image) => ({
                      url: image.url,
                      caption: image.caption,
                      cloudinary_public_id: image.cloudinary_public_id ?? null,
                    }));
                  const updated = await updateCurrentState(piece.id, {
                    notes: currentState.notes,
                    images: updatedImages,
                    additional_fields: normalizeAdditionalFields(currentState.additional_fields ?? {}),
                  });
                  onPieceUpdated(updated);
                }}
              />
            </Box>
          </Box>

        </Box>

        <SectionCard>
          <WorkflowState
            key={currentState.state + currentState.created.toISOString()}
            pieceState={currentState}
            pieceId={piece.id}
            onSaved={onPieceUpdated}
            onDirtyChange={setIsDirty}
          />
        </SectionCard>

        <Divider sx={{ my: 2, opacity: 0.4 }} />

        {isTerminal && (
          <Alert severity="info" sx={{ mb: 2.5, borderRadius: 3 }}>
            This piece is in a terminal state (
            <strong>{formatState(currentState.state)}</strong>). No further
            transitions are possible.
          </Alert>
        )}

        <SectionCard
          title="Timeline"
          subtitle={`${pastHistory.length} completed state${pastHistory.length === 1 ? "" : "s"}`}
        >
          <PieceHistory pastHistory={pastHistory} />
        </SectionCard>
      </Box>

      {/* Navigation blocker dialog */}
      <Dialog open={blocker.state === "blocked"}>
        <DialogTitle>Unsaved Changes</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You have unsaved changes. Are you sure you want to leave?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => blocker.reset?.()}>Stay</Button>
          <Button onClick={() => blocker.proceed?.()} color="error">
            Leave without saving
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
