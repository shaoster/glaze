import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import axios from "axios";
import {
  Alert,
  alpha,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import LockIcon from "@mui/icons-material/Lock";
import { useBlocker } from "react-router-dom";
import type { PieceDetail as PieceDetailType } from "../util/types";
import { formatState, isTerminalState, validateHistorySequence } from "../util/workflow";
import {
  getCustomFieldDefinitions,
} from "../util/workflow";
import { addPieceState, updateCurrentState, updatePastState, updatePiece } from "../util/api";
import CloudinaryImage from "./CloudinaryImage";
import NavigationBlocker from "./NavigationBlocker";
import WorkflowState from "./WorkflowState";
import TagManager from "./TagManager";
import StateTransition from "./StateTransition";
import PieceHistory from "./PieceHistory";
import ProcessSummary from "./ProcessSummary";
import GlobalEntryField from "./GlobalEntryField";
import PiecePhotoGallery, {
  type PiecePhotoGalleryImage,
} from "./PiecePhotoGallery";
import { PieceDetailSaveStatusProvider } from "./PieceDetailSaveStatusContext";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";
import ShareControls from "./PieceShareControls";
import { useAutosave } from "./useAutosave";
import AutosaveStatus from "./AutosaveStatus";

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

function SectionCard({ eyebrow, title, subtitle, children }: SectionCardProps) {
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

function EditableToggle({ piece, onPieceUpdated }: PieceDetailProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqError = piece.is_editable
    ? validateHistorySequence(piece.history)
    : null;

  async function toggle() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePiece(piece.id, {
        is_editable: !piece.is_editable,
      });
      onPieceUpdated(updated);
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data) {
        const data = e.response.data;
        const msg =
          typeof data === "string"
            ? data
            : data.non_field_errors?.[0] ||
              (typeof data === "object" ? Object.values(data).flat()[0] : null);
        setError(String(msg || "Failed to update. Please try again."));
      } else {
        setError("Failed to update. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const disabledReason = piece.shared
    ? "This piece is publicly shared. Unshare it to edit history."
    : null;

  return (
    <Box>
      <Tooltip
        title={disabledReason || ""}
        disableHoverListener={!disabledReason}
        arrow
      >
        <span>
          {piece.is_editable ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<LockIcon fontSize="small" />}
              onClick={toggle}
              disabled={saving || !!seqError}
            >
              Seal changes
            </Button>
          ) : (
            <Button
              variant="outlined"
              size="small"
              startIcon={<HistoryIcon fontSize="small" />}
              onClick={toggle}
              disabled={saving || !!disabledReason}
              sx={{ borderStyle: "dashed", color: "text.secondary" }}
            >
              Edit piece history
            </Button>
          )}
        </span>
      </Tooltip>
      {disabledReason && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            ml: { sm: 1.5 },
            mt: { xs: 0.5, sm: 0 },
            display: { xs: "block", sm: "inline-block" },
            verticalAlign: "middle",
          }}
        >
          {disabledReason}
        </Typography>
      )}
      {seqError && (
        <Typography variant="caption" color="error" sx={{ ml: 1 }}>
          {seqError}
        </Typography>
      )}
      {error && (
        <Typography variant="caption" color="error" sx={{ ml: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
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

function PieceDetailContent({ piece, onPieceUpdated }: PieceDetailProps) {
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
  const canEdit = piece.can_edit;
  const hasWorkflowContent =
    canEdit || getCustomFieldDefinitions(currentState.state).length > 0;
  const pastHistory = piece.history.slice(0, -1);

  const [rewindedStateId, setRewindedStateId] = useState<string | null>(null);

  useEffect(() => {
    if (!piece.is_editable) setRewindedStateId(null);
  }, [piece.is_editable]);

  const rewindedState = rewindedStateId
    ? pastHistory.find((ps) => ps.id === rewindedStateId) ?? null
    : null;

  const [showcaseStoryValue, setShowcaseStoryValue] = useState(
    piece.showcase_story ?? "",
  );

  useEffect(() => {
    setShowcaseStoryValue(piece.showcase_story ?? "");
  }, [piece.showcase_story]);

  const { status: showcaseAutosaveStatus } = useAutosave({
    dirty: showcaseStoryValue !== (piece.showcase_story ?? ""),
    saveKey: `piece-${piece.id}-showcase-story`,
    save: async () => {
      const updated = await updatePiece(piece.id, {
        showcase_story: showcaseStoryValue,
      });
      onPieceUpdated(updated);
    },
  });
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
        state.created.getTime() === currentState.created.getTime() &&
        state.state === currentState.state;
      return state.images.map((image, imageIndex) => ({
        ...image,
        stateLabel: formatState(state.state),
        editableCurrentStateIndex:
          canEdit && isCurrentState ? imageIndex : null,
      }));
    },
  );
  const editButtonSx = {
    width: 22,
    height: 22,
    borderRadius: "4px",
    border: "1px solid",
    borderColor: "divider",
    color: "text.secondary",
    backgroundColor: alpha(theme.palette.background.paper, 0.38),
  } as const;

  const blocker = useBlocker(canEdit && isDirty);

  // Preload all piece images aggressively: hero first, then the rest async.
  useEffect(() => {
    const heroUrl = piece.thumbnail?.url;
    const galleryUrls = galleryImages.map((img) => img.url).filter(Boolean);
    // Prioritize hero, then background-load the rest.
    const ordered = heroUrl
      ? [heroUrl, ...galleryUrls.filter((u) => u !== heroUrl)]
      : galleryUrls;
    ordered.forEach((url, i) => {
      const img = new Image();
      if (i === 0) img.fetchPriority = "high";
      img.src = url;
    });
    // galleryImages is recomputed every render but its identity changes with piece,
    // so depend only on piece to avoid re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece]);

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

  async function handleLocationSelect(
    entry: { id: string; name: string } | null,
  ) {
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

  const galleryProps = {
    images: galleryImages,
    pieceId: piece.id,
    currentStateNotes: currentState.notes,
    currentStateCustomFields: currentState.custom_fields ?? {},
    currentThumbnailUrl: piece.thumbnail?.url,
    onPieceUpdated,
    updatePieceFn: canEdit ? updatePiece : undefined,
    updateCurrentStateFn: canEdit ? updateCurrentState : undefined,
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
                  {canEdit && (
                    <IconButton
                      aria-label="Edit piece name"
                      onClick={startEditingName}
                      size="small"
                      sx={{ ...editButtonSx, alignSelf: "center" }}
                    >
                      <EditIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  )}
                </Box>
              )}
            </Box>
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
                <PiecePhotoGallery {...galleryProps} />
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

        {rewindedState && piece.is_editable ? (
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
                Editing historical state — later states greyed out in timeline
              </Typography>
            </Box>
            <WorkflowState
              key={rewindedState.id}
              initialPieceState={rewindedState}
              pieceId={piece.id}
              onSaved={onPieceUpdated}
              saveStateFn={(payload) =>
                updatePastState(piece.id, rewindedState.id, payload)
              }
            />
          </SectionCard>
        ) : hasWorkflowContent ? (
          <SectionCard>
            <WorkflowState
              key={currentState.state + currentState.created.toISOString()}
              initialPieceState={currentState}
              pieceId={piece.id}
              onSaved={onPieceUpdated}
              onDirtyChange={setIsDirty}
              readOnly={!canEdit}
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
          <SectionCard title="Process Summary">
            <ProcessSummary history={piece.history} />
          </SectionCard>
        </Box>

        {isTerminal && canEdit && (
          <Box sx={{ mb: 2.5 }}>
            <SectionCard title="Showcase">
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Typography variant="subtitle2">Showcase Story</Typography>
                    <AutosaveStatus status={showcaseAutosaveStatus} />
                  </Box>
                  <TextField
                    multiline
                    fullWidth
                    rows={4}
                    placeholder="Tell the story of this piece..."
                    value={showcaseStoryValue}
                    onChange={(e) => setShowcaseStoryValue(e.target.value)}
                  />
                </Box>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Showcase Fields
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    TODO: Showcase Field Selection
                  </Typography>
                </Box>
              </Box>
            </SectionCard>
          </Box>
        )}

        <SectionCard
          title="Timeline"
          subtitle={`${pastHistory.length} completed state${pastHistory.length === 1 ? "" : "s"}`}
        >
          <PieceHistory
            pastHistory={pastHistory}
            piece={piece}
            onPieceUpdated={onPieceUpdated}
            rewindedStateId={rewindedStateId}
            onRewind={piece.is_editable ? setRewindedStateId : undefined}
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
