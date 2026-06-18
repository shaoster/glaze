import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  usePieceHistoryRouting,
  usePieceTagsRouting,
} from "../routing/pieceRouting";
import RoutedGlobalEntryField from "./RoutedGlobalEntryField";
import {
  Alert,
  alpha,
  Box,
  Chip,
  Collapse,
  Divider,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useBlocker, useLocation, useNavigate, Link as RouterLink } from "react-router-dom";
import type { PieceDetail as PieceDetailType, PieceState } from "../util/types";
import { DEFAULT_TRACK_ID } from "../util/music";
import { formatState, isTerminalState, getCustomFieldDefinitions } from "../util/workflow";
import { useIsMutating, useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPieceShowcaseVideo,
  requestPieceShowcaseVideo,
  updatePiece,
  updatePastState,
  updateCurrentState,
  moveImage,
  extractErrorMessage,
  addPieceState,
} from "../util/api";
import AppImage from "./AppImage";

import NavigationBlocker from "./NavigationBlocker";
import WorkflowState from "./WorkflowState";
import TagManager from "./TagManager";
import StateTransition from "./StateTransition";
import PieceHistory from "./PieceHistory";
import ProcessSummary from "./ProcessSummary";
import PiecePhotoGallery, {
  PiecePhotoGalleryButton,
  type PiecePhotoGalleryImage,
} from "./PiecePhotoGallery";
import ShowcaseVideoInputPicker, {
  type ShowcaseVideoInputSelection,
} from "./ShowcaseVideoInputPicker";
import { PieceDetailSaveStatusProvider } from "./PieceDetailSaveStatusContext";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";
import ShareControls from "./PieceShareControls";
import SectionCard from "./SectionCard";
import EditableToggle from "./EditableToggle";
import PieceNameEditor from "./PieceNameEditor";

type PieceDetailProps = {
  piece: PieceDetailType;
  history?: PieceState[];
  historyLoading?: boolean;
  historyError?: unknown;
  refetchHistory?: () => void;
  onPieceUpdated: (updated: PieceDetailType) => void;
};

export default function PieceDetail({
  piece,
  history,
  historyLoading = false,
  historyError = null,
  refetchHistory,
  onPieceUpdated,
}: PieceDetailProps) {
  return (
    <PieceDetailSaveStatusProvider>
      <PieceDetailContent
        piece={piece}
        history={history}
        historyLoading={historyLoading}
        historyError={historyError}
        refetchHistory={refetchHistory}
        onPieceUpdated={onPieceUpdated}
      />
    </PieceDetailSaveStatusProvider>
  );
}

function PieceDetailContent({
  piece,
  history,
  historyLoading = false,
  historyError,
  refetchHistory,
  onPieceUpdated,
}: PieceDetailProps) {
  const pieceDetailSaveStatus = usePieceDetailSaveStatus();
  const isSaving = useIsMutating({ mutationKey: ["autosave"] }) > 0;
  const hasSaveError =
    useMutationState({
      filters: { mutationKey: ["autosave"], status: "error" },
    }).length > 0;
  const pendingTransitionRef = useRef<string | null>(null);

  const currentState = piece.current_state;
  const isTerminal = isTerminalState(currentState.state);
  const canEdit = piece.can_edit;
  const hasWorkflowContent =
    canEdit || getCustomFieldDefinitions(currentState.state).length > 0;
  const statesHistory: PieceState[] = useMemo(() => {
    if (!history) {
      return piece.history && piece.history.length > 0 ? piece.history : [currentState];
    }
    // Replace the current state in history with the fresh currentState from piece
    return history.map((state) =>
      state.id === currentState.id ? currentState : state
    );
  }, [history, piece.history, currentState]);
  const pastHistory = statesHistory.slice(0, -1);

  const historyRouting = usePieceHistoryRouting(piece.id);
  const tagsRouting = usePieceTagsRouting(piece.id);

  const { rewindedStateId } = historyRouting;
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
  const galleryImages: PiecePhotoGalleryImage[] = statesHistory.flatMap(
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

  // Block navigation away from the dirty form, but allow routing-hook sub-routes
  // that are pure in-page UI and do not mutate piece state.
  // /photos is intentionally excluded: the gallery can write back to the current
  // state using the last-saved prop values, which would silently drop dirty edits.
  const blocker = useBlocker(
    useCallback(
      ({ nextLocation }: { nextLocation: { pathname: string } }) => {
        if (!canEdit || !hasSaveError) return false;
        const next = nextLocation.pathname;
        const base = `/pieces/${piece.id}`;
        if (next === base) return false;
        if (next.startsWith(`${base}/history/`)) return false;
        if (next === `${base}/video`) return false;
        if (next === `${base}/tags/new`) return false;
        if (next.startsWith(`${base}/state/fields/`)) return false;
        return true;
      },
      [canEdit, hasSaveError, piece.id],
    ),
  );



  const { mutate: transitionMutate, isPending: transitioning, error: rawTransitionError } = useMutation({
    mutationFn: (nextState: string) =>
      addPieceState(piece.id, { state: nextState as PieceDetailType["current_state"]["state"] }),
    onSuccess: (updated) => onPieceUpdated(updated),
  });

  // If a save is in progress when the user clicks a transition button, defer
  // the transition until the save completes rather than prompting the user.
  useEffect(() => {
    if (!isSaving && pendingTransitionRef.current) {
      transitionMutate(pendingTransitionRef.current);
      pendingTransitionRef.current = null;
    }
  }, [isSaving, transitionMutate]);

  const handleTransition = useCallback(
    (nextState: string) => {
      if (isSaving) {
        pendingTransitionRef.current = nextState;
      } else {
        transitionMutate(nextState);
      }
    },
    [isSaving, transitionMutate],
  );
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
  const thumbnailIndex = piece.thumbnail
    ? galleryImages.findIndex((img) =>
        piece.thumbnail?.image_id && img.image_id
          ? img.image_id === piece.thumbnail.image_id
          : img.url === piece.thumbnail?.url,
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
    pieceStates: statesHistory.length > 0
      ? statesHistory.map((s) => ({ id: s.id, label: formatState(s.state) }))
      : [{ id: currentState.id, label: formatState(currentState.state) }],
    moveImageFn: piece.is_editable ? moveImage : undefined,
    historyLoading,
    historyError,
    refetchHistory,
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
                tagDialogOpen={tagsRouting.tagDialogOpen}
                onOpenTagDialog={tagsRouting.onOpenTagDialog}
                onCloseTagDialog={tagsRouting.onCloseTagDialog}
              />
            ) : null}
            {canEdit && (
              <Box sx={{ mt: 2, mb: 1.5 }}>
                <StateTransition
                  currentStateName={currentState.state}
                  disabled={hasSaveError || piece.is_editable}
                  disabledHint={
                    piece.is_editable
                      ? "Seal edit mode before transitioning to a new state."
                      : hasSaveError
                        ? "Auto-save failed. Your changes may not be saved."
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
            {piece.can_edit && (
              <Box sx={{ mb: 1.5 }}>
                <Button
                  component={RouterLink}
                  to={`/pieces/${piece.id}/showcase`}
                  variant="outlined"
                  size="small"
                >
                  Preview showcase
                </Button>
              </Box>
            )}
            {canEdit && (
              <Box sx={{ mb: 1.5 }}>
                <EditableToggle piece={piece} onPieceUpdated={onPieceUpdated} />
              </Box>
            )}
            <Box sx={{ mb: 1.5 }}>
              <SectionCard>
                <RoutedGlobalEntryField
                  pieceId={piece.id}
                  fieldName="current_location"
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
                  <AppImage
                    url={piece.thumbnail.url}
                    croppedUrl={piece.thumbnail.cropped_url}
                    crop={piece.thumbnail.crop}
                    r2Key={piece.thumbnail.r2_key}
                    cropTaskFailed={piece.thumbnail.crop_task_failed}
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
                onDelete={historyRouting.onClearRewind}
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

        {canEdit && isTerminal && (
          <Box sx={{ mb: 2.5 }}>
            <ShowcaseVideoPanel
              piece={piece}
              history={statesHistory}
              historyLoading={historyLoading}
              historyError={historyError}
              refetchHistory={refetchHistory}
            />
          </Box>
        )}

        <Box sx={{ mb: 2.5 }}>
          <SectionCard
            title="Process Summary"
            titleId="process-summary-title"
          >
            {historyError ? (
              <Box sx={{ py: 1, textAlign: "center" }}>
                <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                  Failed to load process summary.
                </Typography>
                <Button size="small" variant="outlined" onClick={refetchHistory}>
                  Retry
                </Button>
              </Box>
            ) : historyLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <ProcessSummary piece={piece} history={statesHistory} />
            )}
          </SectionCard>
        </Box>

        <SectionCard
          title="Timeline"
          subtitle={
            historyError
              ? "Error loading history"
              : historyLoading
              ? "Loading history..."
              : `${pastHistory.length} completed state${pastHistory.length === 1 ? "" : "s"}`
          }
        >
          {historyError ? (
            <Box sx={{ py: 2, textAlign: "center" }}>
              <Typography variant="body2" color="error" sx={{ mb: 1.5 }}>
                Failed to load timeline.
              </Typography>
              <Button size="small" variant="outlined" onClick={refetchHistory}>
                Retry
              </Button>
            </Box>
          ) : historyLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <PieceHistory
              pastHistory={pastHistory}
              piece={piece}
              history={statesHistory}
              onPieceUpdated={onPieceUpdated}
              rewindedStateId={rewindedStateId}
              onRewind={(id) =>
                id ? historyRouting.onRewind(id) : historyRouting.onClearRewind()
              }
            />
          )}
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

type ArtifactActionsProps = {
  artifact: { url: string };
};

function ArtifactActions({ artifact }: ArtifactActionsProps) {
  return (
    <Box
      component="video"
      src={artifact.url}
      controls
      playsInline
      sx={{
        width: "100%",
        borderRadius: 1,
        display: "block",
        backgroundColor: "black",
      }}
    />
  );
}

function ShowcaseVideoPanel({
  piece,
  history,
  historyLoading,
  historyError,
  refetchHistory,
}: {
  piece: PieceDetailType;
  history?: PieceState[];
  historyLoading: boolean;
  historyError?: unknown;
  refetchHistory?: () => void;
}) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [selection, setSelection] = useState<ShowcaseVideoInputSelection>({
    excludedImageKeys: [],
    excludedNoteKeys: [],
    musicTrackId: DEFAULT_TRACK_ID,
  });

  // Piece edits change the render hash server-side; invalidate so the fresh
  // current_input_hash is fetched and the stale-needs-regeneration status
  // (or re-enabled button) reflects the updated piece content.
  const prevPieceRef = useRef(piece);
  useEffect(() => {
    if (prevPieceRef.current !== piece) {
      prevPieceRef.current = piece;
      queryClient.invalidateQueries({ queryKey: ["showcase-video", piece.id] });
    }
  }, [piece, queryClient]);

  const {
    data: showcaseVideo,
    error: rawStatusError,
    isLoading,
  } = useQuery({
    queryKey: ["showcase-video", piece.id],
    queryFn: () => fetchPieceShowcaseVideo(piece.id),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ||
      query.state.data?.status === "running"
        ? 2500
        : false,
  });

  const {
    mutate: generateVideo,
    isPending: generating,
    error: rawGenerateError,
  } = useMutation({
    mutationFn: () => requestPieceShowcaseVideo(piece.id, selection),
    onSuccess: (updated) => {
      queryClient.setQueryData(["showcase-video", piece.id], updated);
    },
  });

  const currentStatus = showcaseVideo?.status ?? "idle";
  const storedImageKeys = showcaseVideo?.excluded_image_keys ?? [];
  const storedNoteKeys = showcaseVideo?.excluded_note_keys ?? [];
  const selectionMatchesStoredTask =
    selection.musicTrackId === (showcaseVideo?.music_track_id ?? DEFAULT_TRACK_ID) &&
    selection.excludedImageKeys.length === storedImageKeys.length &&
    selection.excludedImageKeys.every((k) => storedImageKeys.includes(k)) &&
    selection.excludedNoteKeys.length === storedNoteKeys.length &&
    selection.excludedNoteKeys.every((k) => storedNoteKeys.includes(k));
  const hashUnchanged =
    selectionMatchesStoredTask &&
    currentStatus === "succeeded" &&
    showcaseVideo?.current_input_hash != null &&
    showcaseVideo.current_input_hash === showcaseVideo?.stored_input_hash;
  const canGenerate =
    !generating &&
    !hashUnchanged &&
    (showcaseVideo?.enabled ?? true) &&
    currentStatus !== "pending" &&
    currentStatus !== "running" &&
    (showcaseVideo?.eligible ?? true) &&
    !historyLoading &&
    !historyError;
  const statusLabel =
    currentStatus === "idle"
      ? "No render has been requested yet."
      : currentStatus === "disabled"
        ? "Showcase video generation is unavailable."
        : currentStatus === "failed"
          ? "The latest render failed."
          : currentStatus === "stale-needs-regeneration"
            ? "The latest render is stale."
            : "The latest render is ready.";

  const isActive =
    currentStatus === "pending" || currentStatus === "running";
  const activeProgress =
    currentStatus === "running" ? (showcaseVideo?.progress ?? 0) : null;

  const artifact = showcaseVideo?.artifact ?? null;
  const errorMessage = rawGenerateError
    ? extractErrorMessage(
        rawGenerateError,
        "Failed to request a video render. Please try again.",
      )
    : rawStatusError
      ? extractErrorMessage(
          rawStatusError,
          "Failed to load showcase video status.",
        )
      : null;

  return (
    <SectionCard
      title="Showcase Video"
      subtitle="Render a deterministic Keepsake slideshow from the piece history."
      titleAdornment={
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {artifact && !expanded && (
            <CheckCircleIcon fontSize="small" sx={{ color: "success.main" }} />
          )}
          <IconButton
            size="small"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded ? "Collapse showcase video" : "Expand showcase video"}
            sx={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      <Collapse in={expanded} unmountOnExit>
      <Stack spacing={2}>
        {historyError ? (
          <Box sx={{ py: 2, textAlign: "center" }}>
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              Failed to load past photos and notes for the video.
            </Typography>
            {refetchHistory && (
              <Button size="small" variant="outlined" onClick={refetchHistory}>
                Retry
              </Button>
            )}
          </Box>
        ) : historyLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <ShowcaseVideoInputPicker
            piece={piece}
            history={history}
            selection={selection}
            onSelectionChange={setSelection}
            disabled={generating || currentStatus === "pending" || currentStatus === "running"}
          />
        )}

        <Box
          sx={(theme) => ({
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            backgroundColor: theme.palette.background.paper,
            p: 1.5,
          })}
        >
          <Stack spacing={1.25}>
            {isActive ? (
              currentStatus === "pending" ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    Queued — you can safely navigate away.
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                    Rendering in the background…
                  </Typography>
                  <LinearProgress
                    variant={activeProgress !== null ? "determinate" : "indeterminate"}
                    value={activeProgress ?? undefined}
                  />
                </Box>
              )
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {statusLabel}
              </Typography>
            )}
            {isLoading && !showcaseVideo ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Checking for the latest render...
                </Typography>
              </Box>
            ) : null}
            {showcaseVideo?.stale_reason ? (
              <Alert severity="warning" variant="outlined">
                {showcaseVideo.stale_reason}
              </Alert>
            ) : null}
            {showcaseVideo?.disabled_reason ? (
              <Alert severity="info" variant="outlined">
                {showcaseVideo.disabled_reason}
              </Alert>
            ) : null}
            {showcaseVideo?.error ? (
              <Alert severity="error" variant="outlined">
                {showcaseVideo.error}
              </Alert>
            ) : null}
            {errorMessage ? (
              <Typography variant="body2" color="error">
                {errorMessage}
              </Typography>
            ) : null}
            {artifact ? (
              <ArtifactActions artifact={artifact} />
            ) : null}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
                <Button
                  variant="contained"
                  onClick={() => generateVideo()}
                  disabled={!canGenerate}
                  startIcon={generating ? <CircularProgress size={16} /> : undefined}
                >
                  {currentStatus === "succeeded" ||
                  currentStatus === "stale-needs-regeneration"
                    ? "Render again"
                    : currentStatus === "disabled"
                      ? "Unavailable"
                      : "Generate video"}
                </Button>
                {!isActive && (
                  <Typography variant="caption" color="text.secondary">
                    {showcaseVideo?.enabled === false
                      ? "Configure R2 storage to enable showcase videos."
                      : showcaseVideo?.eligible === false
                      ? "This piece is not eligible for video generation yet."
                      : "Renders asynchronously — you can navigate away."}
                  </Typography>
                )}
            </Stack>
          </Stack>
        </Box>
      </Stack>
      </Collapse>
    </SectionCard>
  );
}
