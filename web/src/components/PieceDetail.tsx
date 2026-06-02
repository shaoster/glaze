import {
  type ComponentProps,
  useState,
} from "react";
import {
  Alert,
  alpha,
  Box,
  Chip,
  Divider,
  Typography,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import type { PieceDetail as PieceDetailType } from "../util/types";
import { formatState, isTerminalState, getCustomFieldDefinitions } from "../util/workflow";
import { useMutation } from "@tanstack/react-query";
import { updatePiece, updatePastState, updateCurrentState, moveImage, extractErrorMessage, addPieceState } from "../util/api";
import CloudinaryImage from "./CloudinaryImage";

import NavigationBlocker from "./NavigationBlocker";
import WorkflowState from "./WorkflowState";
import TagManager from "./TagManager";
import StateTransition from "./StateTransition";
import PieceHistory from "./PieceHistory";
import ProcessSummary from "./ProcessSummary";
import GlobalEntryField from "./GlobalEntryField";
import PiecePhotoGallery, {
  PiecePhotoGalleryButton,
  type PiecePhotoGalleryImage,
} from "./PiecePhotoGallery";
import { PieceDetailSaveStatusProvider } from "./PieceDetailSaveStatusContext";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";
import ShareControls from "./PieceShareControls";
import SectionCard from "./SectionCard";
import EditableToggle from "./EditableToggle";
import PieceNameEditor from "./PieceNameEditor";

type PieceDetailProps = {
  piece: PieceDetailType;
  onPieceUpdated: (updated: PieceDetailType) => void;
};

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

function PieceDetailContent({ piece, onPieceUpdated }: PieceDetailProps) {
  const [isDirty, setIsDirty] = useState(false);
  const pieceDetailSaveStatus = usePieceDetailSaveStatus();

  const currentState = piece.current_state;
  const isTerminal = isTerminalState(currentState.state);
  const canEdit = piece.can_edit;
  const hasWorkflowContent =
    canEdit || getCustomFieldDefinitions(currentState.state).length > 0;
  const pastHistory = piece.history.slice(0, -1);

  const [rewindedStateId, setRewindedStateId] = useState<string | null>(null);

  // Keep rewindedStateId when toggling is_editable to allow viewing history in read-only mode.

  const rewindedState = rewindedStateId
    ? pastHistory.find((ps) => ps.id === rewindedStateId) ?? null
    : null;

  function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  }
  const createdLabel = formatDate(piece.created);
  const modifiedLabel = formatDate(piece.last_modified);
  const galleryImages: PiecePhotoGalleryImage[] = piece.history.flatMap(
    (state) => {
      const isCurrentState =
        state.created &&
        currentState.created &&
        state.created.getTime() === currentState.created.getTime() &&
        state.state === currentState.state;
      return state.images.map((image, imageIndex) => ({
        ...image,
        stateLabel: formatState(state.state),
        stateId: state.id,
        editableCurrentStateIndex:
          canEdit && isCurrentState ? imageIndex : null,
      }));
    },
  );

  const blocker = useBlocker(canEdit && isDirty);



  const { mutate: handleTransition, isPending: transitioning, error: rawTransitionError } = useMutation({
    mutationFn: (nextState: string) =>
      addPieceState(piece.id, { state: nextState as PieceDetailType["current_state"]["state"] }),
    onSuccess: (updated) => { onPieceUpdated(updated); setIsDirty(false); },
  });
  const transitionError = rawTransitionError
    ? extractErrorMessage(rawTransitionError, "Failed to transition state. Please try again.")
    : null;

  const { mutate: handleLocationSelect, isPending: locationSaving, error: rawLocationError } = useMutation({
    mutationFn: (entry: { id: string; name: string } | null) => {
      const saveLocationRequest = () => updatePiece(piece.id, { current_location: entry?.name ?? "" });
      return pieceDetailSaveStatus
        ? pieceDetailSaveStatus.runManualSave(saveLocationRequest)
        : saveLocationRequest();
    },
    onSuccess: (updated) => onPieceUpdated(updated),
  });
  const locationError = rawLocationError
    ? extractErrorMessage(rawLocationError, "Failed to save location. Please try again.")
    : null;

  const navigate = useNavigate();
  const location = useLocation();
  const hasGalleryImages = galleryImages.length > 0;
  const thumbnailIndex = piece.thumbnail?.cloudinary_public_id
    ? galleryImages.findIndex(
        (img) =>
          img.cloudinary_public_id !== null &&
          img.cloudinary_public_id === piece.thumbnail?.cloudinary_public_id,
      )
    : -1;
  const heroLightboxIndex = thumbnailIndex >= 0 ? thumbnailIndex : 0;

  const galleryProps = {
    images: galleryImages,
    pieceId: piece.id,
    currentStateNotes: currentState.notes,
    currentStateCustomFields: currentState.custom_fields ?? {},
    currentThumbnailUrl: piece.thumbnail?.url,
    onPieceUpdated,
    updatePieceFn: canEdit ? updatePiece : undefined,
    updateCurrentStateFn: canEdit ? updateCurrentState : undefined,
    updatePastStateFn: piece.is_editable ? updatePastState : undefined,
    pieceStates: [
      { id: currentState.id, label: formatState(currentState.state) },
      ...piece.history.map((s) => ({ id: s.id, label: formatState(s.state) })),
    ],
    moveImageFn: piece.is_editable ? moveImage : undefined,
  } satisfies ComponentProps<typeof PiecePhotoGallery>;

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
            <PieceNameEditor
              piece={piece}
              onPieceUpdated={onPieceUpdated}
            />
            {canEdit ? (
              <TagManager
                pieceId={piece.id}
                initialTags={piece.tags ?? []}
                onSaved={onPieceUpdated}
              />
            ) : null}
            {canEdit && (
              <Box sx={{ mt: 2, mb: 1.5 }}>
                <StateTransition
                  currentStateName={currentState.state}
                  disabled={isDirty || piece.is_editable}
                  disabledHint={
                    piece.is_editable
                      ? "Seal edit mode before transitioning to a new state."
                      : undefined
                  }
                  transitioning={transitioning}
                  transitionError={transitionError}
                  onTransition={handleTransition}
                />
              </Box>
            )}
            {canEdit && isTerminal && (
              <Box sx={{ mb: 1.5 }}>
                <ShareControls piece={piece} onPieceUpdated={onPieceUpdated} />
              </Box>
            )}
            {canEdit && (
              <Box sx={{ mb: 1.5 }}>
                <EditableToggle piece={piece} onPieceUpdated={onPieceUpdated} />
              </Box>
            )}
            <Box sx={{ mb: 1.5 }}>
              <SectionCard>
                <GlobalEntryField
                  globalName="location"
                  label="Current location"
                  value={piece.current_location ?? ""}
                  onSelect={(entry) => void handleLocationSelect(entry)}
                  disabled={!canEdit}
                  hideActionWhenDisabled
                  sx={{ opacity: locationSaving ? 0.7 : 1 }}
                  canCreate
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
              onClick={
                hasGalleryImages
                  ? () => navigate(`/pieces/${piece.id}/photos/${heroLightboxIndex}`, { state: location.state })
                  : undefined
              }
              sx={(theme) => ({
                position: "relative",
                overflow: "hidden",
                borderRadius: { xs: "8px", md: "10px" },
                minHeight: { xs: 200, sm: 260 },
                aspectRatio: { md: "4 / 3" },
                backgroundColor: alpha(theme.palette.background.paper, 0.46),
                boxShadow: `0 24px 60px ${alpha(theme.palette.common.black, 0.22)}`,
                cursor: hasGalleryImages ? "pointer" : "default",
              })}
            >
              {piece.thumbnail ? (
                <Box sx={{ position: "absolute", inset: 0 }}>
                  <CloudinaryImage
                    url={piece.thumbnail.url}
                    cloud_name={piece.thumbnail.cloud_name}
                    cloudinary_public_id={piece.thumbnail.cloudinary_public_id}
                    crop={piece.thumbnail.crop}
                    alt={piece.name}
                    context="detail"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: piece.thumbnail.crop ? "contain" : "cover",
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
                <PiecePhotoGalleryButton
                  images={galleryImages}
                  pieceId={piece.id}
                />
              </Box>
            </Box>
            {/* Photo gallery + upload trigger — below hero on desktop only */}
            <Box
              sx={{
                display: { xs: "none", md: "flex" },
                alignItems: "center",
                gap: 1,
                mt: 1,
              }}
            >
              <Box id="piece-upload-trigger" />
              <PiecePhotoGallery {...galleryProps} />
            </Box>
          </Box>
        </Box>

        {rewindedState ? (
          <SectionCard>
            <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
              <Chip
                icon={<HistoryIcon fontSize="small" />}
                label={`Rewound to: ${formatState(rewindedState.state)}`}
                color="primary"
                variant="outlined"
                size="small"
                onDelete={() => setRewindedStateId(null)}
              />
              <Typography variant="caption" color="text.secondary">
                {piece.is_editable
                  ? "Editing historical state — later states greyed out in timeline"
                  : "Viewing historical state — read-only"}
              </Typography>
            </Box>
            <WorkflowState
              key={rewindedState.id}
              initialPieceState={rewindedState}
              pieceId={piece.id}
              onSaved={onPieceUpdated}
              readOnly={!piece.is_editable}
              hideNotes={!canEdit}
              saveStateFn={(payload) =>
                updatePastState(piece.id, rewindedState.id, payload)
              }
            />
          </SectionCard>
        ) : hasWorkflowContent ? (
          <SectionCard>
            <WorkflowState
              key={
                currentState.state +
                (currentState.created?.toISOString() ?? "")
              }
              initialPieceState={currentState}
              pieceId={piece.id}
              onSaved={onPieceUpdated}
              onDirtyChange={setIsDirty}
              readOnly={!canEdit}
              hideNotes={!canEdit}
            />
          </SectionCard>
        ) : null}

        <Divider sx={{ my: 2, opacity: 0.4 }} />

        {isTerminal && canEdit && (
          <Alert severity="info" sx={{ mb: 2.5, borderRadius: 3 }}>
            This piece is in a terminal state (
            <strong>{formatState(currentState.state)}</strong>). No further
            transitions are possible.
          </Alert>
        )}

        <Box sx={{ mb: 2.5 }}>
          <SectionCard
            title="Process Summary"
            titleId="process-summary-title"
          >
            <ProcessSummary piece={piece} history={piece.history} />
          </SectionCard>
        </Box>

        <SectionCard
          title="Timeline"
          subtitle={`${pastHistory.length} completed state${pastHistory.length === 1 ? "" : "s"}`}
        >
          <PieceHistory
            pastHistory={pastHistory}
            piece={piece}
            onPieceUpdated={onPieceUpdated}
            rewindedStateId={rewindedStateId}
            onRewind={setRewindedStateId}
          />
        </SectionCard>
      </Box>

      {canEdit && (
        <NavigationBlocker
          open={blocker.state === "blocked"}
          onStay={() => blocker.reset?.()}
          onLeave={() => blocker.proceed?.()}
        />
      )}
    </Box>
  );
}
