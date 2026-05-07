import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import { useTheme } from "@mui/material";
import {
  Box,
  Button,
  CircularProgress,
  Fab,
  MenuItem,
  Portal,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import type { PieceDetail, PieceState } from "../util/types";
import {
  fetchCloudinaryWidgetConfig,
  signCloudinaryWidgetParams,
  updateCurrentState,
} from "../util/api";
import {
  getAdditionalFieldDefinitions,
} from "../util/workflow";
import { entryNameOrEmpty } from "../util/optionalValues";
import GlobalEntryField from "./GlobalEntryField";
import AutosaveStatus from "./AutosaveStatus";
import { useAutosave } from "./useAutosave";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";
import {
  buildDraftState,
  draftReducer,
  normalizeAdditionalFieldPayload,
} from "./workflowStateDraft";

type WorkflowStateProps = {
  initialPieceState: PieceState;
  pieceId: string;
  onSaved: (updated: PieceDetail) => void;
  onDirtyChange?: (dirty: boolean) => void;
  autosaveDelayMs?: number;
  readOnly?: boolean;
};


// ── ImageUploader ─────────────────────────────────────────────────────────────

type ImageUploaderProps = {
  saving: boolean;
  widgetLoading: boolean;
  uploadError: string | null;
  imageError: string | null;
  mobile: boolean;
  hidden?: boolean;
  onUploadClick: () => void;
};

function ImageUploader({
  saving,
  widgetLoading,
  uploadError,
  imageError,
  mobile,
  hidden = false,
  onUploadClick,
}: ImageUploaderProps) {
  const buttonDisabled = saving || widgetLoading;
  const statusMessage = saving ? "Saving…" : "Upload Image";

  return (
    <Box sx={hidden ? { display: "none" } : undefined}>
      {mobile ? (
        <Portal>
          <Fab
            color="primary"
            aria-label="Upload Image"
            onClick={onUploadClick}
            disabled={buttonDisabled}
            hidden={hidden}
            sx={{
              display: hidden ? "none" : undefined,
              position: "fixed",
              right: 24,
              bottom: 24,
              zIndex: (theme) => theme.zIndex.speedDial,
              boxShadow: (theme) => theme.shadows[8],
            }}
          >
            {widgetLoading ? (
              <CircularProgress aria-hidden size={20} color="inherit" />
            ) : (
              <PhotoCameraOutlinedIcon />
            )}
            <Box
              component="span"
              sx={{
                position: "absolute",
                width: 1,
                height: 1,
                p: 0,
                m: -1,
                overflow: "hidden",
                clip: "rect(0 0 0 0)",
                whiteSpace: "nowrap",
                border: 0,
              }}
            >
              {statusMessage}
            </Box>
          </Fab>
        </Portal>
      ) : (
        <Portal container={() => document.getElementById("piece-upload-trigger")}>
          <Button
            variant="outlined"
            size="small"
            onClick={onUploadClick}
            disabled={buttonDisabled}
            hidden={hidden}
            startIcon={
              saving ? <CircularProgress size={14} color="inherit" /> : undefined
            }
            sx={{ display: hidden ? "none" : undefined, position: "relative" }}
          >
            <Box sx={{ opacity: widgetLoading ? 0 : 1 }}>{statusMessage}</Box>
            {widgetLoading && (
              <CircularProgress
                aria-hidden
                size={14}
                color="inherit"
                sx={{ position: "absolute" }}
              />
            )}
          </Button>
        </Portal>
      )}
      {(uploadError || imageError) && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {uploadError ?? imageError}
        </Typography>
      )}
    </Box>
  );
}

// ── WorkflowState ─────────────────────────────────────────────────────────────

export default function WorkflowState({
  initialPieceState,
  pieceId,
  onSaved,
  onDirtyChange,
  autosaveDelayMs,
  readOnly = false,
}: WorkflowStateProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [draft, dispatch] = useReducer(
    draftReducer,
    initialPieceState,
    buildDraftState,
  );
  const { baseState, notes, images, additionalFieldInputs, globalRefPks } = draft;
  const baseDraft = useMemo(() => buildDraftState(baseState), [baseState]);
  const additionalFieldDefs = useMemo(
    () => getAdditionalFieldDefinitions(baseState.state),
    [baseState.state],
  );
  const normalizedAdditionalFields = useMemo(
    () =>
      normalizeAdditionalFieldPayload(
        additionalFieldDefs,
        additionalFieldInputs,
        globalRefPks,
      ),
    [additionalFieldDefs, additionalFieldInputs, globalRefPks],
  );
  const normalizedBaseAdditionalFields = useMemo(
    () =>
      normalizeAdditionalFieldPayload(
        additionalFieldDefs,
        baseDraft.additionalFieldInputs,
        baseDraft.globalRefPks,
      ),
    [additionalFieldDefs, baseDraft.additionalFieldInputs, baseDraft.globalRefPks],
  );
  const additionalFieldsDirty =
    JSON.stringify(normalizedAdditionalFields) !==
    JSON.stringify(normalizedBaseAdditionalFields);

  const theme = useTheme();
  const isMobileLayout = useMediaQuery(theme.breakpoints.down("sm"));

  const [savingImage, setSavingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const isDirty = notes !== baseState.notes || additionalFieldsDirty;

  useEffect(() => {
    onDirtyChange?.(readOnly ? false : isDirty);
  }, [isDirty, onDirtyChange, readOnly]);

  const saveWorkflowState = useCallback(async () => {
    const payload = {
      notes,
      images,
      custom_fields: normalizedAdditionalFields,
    };
    const result = await updateCurrentState(pieceId, payload);
    dispatch({ type: "replace_base_state", pieceState: result.current_state });
    onSaved(result);
  }, [
    pieceId,
    images,
    normalizedAdditionalFields,
    notes,
    onSaved,
  ]);

  const autosaveKey = useMemo(
    () =>
      JSON.stringify({
        notes,
        images,
        custom_fields: normalizedAdditionalFields,
      }),
    [images, normalizedAdditionalFields, notes],
  );

  const autosave = useAutosave({
    dirty: !readOnly && isDirty,
    saveKey: autosaveKey,
    save: saveWorkflowState,
    delayMs: autosaveDelayMs,
  });
  const pieceDetailSaveStatus = usePieceDetailSaveStatus();

  useEffect(() => {
    pieceDetailSaveStatus?.publishWorkflowStatus({
      status: autosave.status,
      error: autosave.error,
      lastSavedAt: autosave.lastSavedAt,
    });
  }, [
    autosave.error,
    autosave.lastSavedAt,
    autosave.status,
    pieceDetailSaveStatus,
  ]);

  async function handleUploadWidgetClick() {
    if (readOnly) {
      return;
    }
    setUploadError(null);
    setWidgetLoading(true);
    let config;
    try {
      config = await fetchCloudinaryWidgetConfig();
    } catch {
      setUploadError("Failed to load upload configuration. Please try again.");
      return;
    }
    // Keeps the iframe hidden until it is ready (removed on display-changed: shown).
    const hideStyle = document.createElement("style");
    hideStyle.textContent = 'iframe[title="Upload Widget"] { opacity: 0; }';
    document.head.appendChild(hideStyle);
    // On iOS PWA with viewport-fit=cover the status bar overlays the page.
    // Push the widget iframe below it so its header controls are reachable.
    // This style must persist for the widget's lifetime (not removed with hideStyle).
    const safeAreaStyle = document.createElement("style");
    safeAreaStyle.textContent =
      'iframe[title="Upload Widget"] { top: env(safe-area-inset-top) !important; height: calc(100dvh - env(safe-area-inset-top)) !important; }';
    document.head.appendChild(safeAreaStyle);

    const uploadWidget = window.cloudinary?.createUploadWidget(
      {
        cloudName: config.cloud_name,
        apiKey: config.api_key,
        uploadSignature: (callback, paramsToSign) => {
          signCloudinaryWidgetParams(paramsToSign as Record<string, unknown>)
            .then(callback)
            .catch(() =>
              setUploadError("Failed to sign upload. Please try again."),
            );
        },
        ...(config.folder ? { folder: config.folder } : {}),
        ...(config.upload_preset ? { uploadPreset: config.upload_preset } : {}),
        sources: ["local", "camera"],
        multiple: true,
        resourceType: "image",
        styles: {
          palette: {
            window: theme.palette.background.paper,
            windowBorder: theme.palette.divider,
            tabIcon: theme.palette.primary.main,
            menuIcons: theme.palette.text.secondary,
            textDark: theme.palette.text.primary,
            textLight: theme.palette.text.secondary,
            link: theme.palette.primary.main,
            action: theme.palette.primary.dark,
            inactiveTabIcon: theme.palette.text.disabled,
            error: theme.palette.error.main,
            inProgress: theme.palette.primary.main,
            complete: theme.palette.success.main,
            sourceBg: theme.palette.background.default,
          },
          frame: { background: "#00000000" },
        } as { palette: Record<string, string> },
      },
      (error, result) => {
        if (result?.event === "display-changed") {
          const state =
            typeof result.info === "string"
              ? result.info
              : (result.info as Record<string, unknown>)?.state;
          if (state === "shown") {
            setWidgetLoading(false);
            hideStyle.remove();
            const iframe = document.querySelector(
              'iframe[title="Upload Widget"]',
            );
            if (iframe instanceof HTMLElement) {
              iframe.style.transition = "opacity 0.15s ease-in";
              iframe.style.opacity = "1";
            }
          } else if (state === "hidden" || state === "destroyed") {
            safeAreaStyle.remove();
          }
        }
        if (error) {
          setWidgetLoading(false);
          hideStyle.remove();
          safeAreaStyle.remove();
          setUploadError("Upload failed. Please try again.");
          return;
        }
        if (result?.event === "success") {
          const newImage = {
            url: result.info.secure_url,
            caption: "",
            cloudinary_public_id: result.info.public_id,
            cloud_name: config.cloud_name,
          };
          setSavingImage(true);
          setImageError(null);
          updateCurrentState(pieceId, {
            notes,
            images: [...images, { ...newImage, crop: null }],
            custom_fields: normalizedAdditionalFields,
          })
            .then((result) => {
              dispatch({
                type: "replace_base_state",
                pieceState: result.current_state,
              });
              onSaved(result);
            })
            .catch(() =>
              setImageError("Failed to save image. Please try again."),
            )
            .finally(() => setSavingImage(false));
        }
      },
    );
    uploadWidget?.open();
  }

  function handleFieldChange(name: string, value: string) {
    dispatch({ type: "set_additional_field", name, value });
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        textAlign: "left",
      }}
    >
      {/* Notes — hidden in read-only (public) views */}
      {!readOnly && (
        <TextField
          label="Notes"
          multiline
          minRows={3}
          value={notes}
          onChange={(e) => dispatch({ type: "set_notes", notes: e.target.value })}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
          fullWidth
        />
      )}
      {additionalFieldDefs.length > 0 && (
        <Box>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {additionalFieldDefs.map((field) => {
              const value = additionalFieldInputs[field.name] ?? "";
              const helperText = field.description;
              const label = field.label;
              if (field.isStateRef) {
                return (
                  <TextField
                    key={field.name}
                    label={label}
                    type={
                      field.type === "number" || field.type === "integer"
                        ? "number"
                        : "text"
                    }
                    value={value}
                    disabled
                    helperText={helperText}
                    fullWidth
                  />
                );
              }
              if (field.isGlobalRef && field.globalName) {
                return (
                  <GlobalEntryField
                    key={field.name}
                    globalName={field.globalName}
                    label={label}
                    value={value}
                    onSelect={(entry) => {
                      if (readOnly) return;
                      handleFieldChange(field.name, entryNameOrEmpty(entry));
                      dispatch({
                        type: "set_global_ref_pks",
                        globalRefPks: entry
                          ? { ...globalRefPks, [field.name]: entry.id }
                          : Object.fromEntries(
                              Object.entries(globalRefPks).filter(
                                ([key]) => key !== field.name,
                              ),
                            ),
                      });
                    }}
                    canCreate={Boolean(field.canCreate)}
                    disabled={readOnly}
                    helperText={helperText}
                    required={field.required}
                  />
                );
              }
              if (field.enum?.length) {
                return (
                  <TextField
                    key={field.name}
                    label={label}
                    select
                    value={value}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    helperText={helperText}
                    required={field.required}
                    disabled={readOnly}
                    fullWidth
                  >
                    {field.enum.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </TextField>
                );
              }
              if (field.type === "number" || field.type === "integer") {
                return (
                  <TextField
                    key={field.name}
                    label={label}
                    type="number"
                    value={value}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    slotProps={{
                      htmlInput: {
                        inputMode:
                          field.type === "integer" ? "numeric" : "decimal",
                        step: field.type === "integer" ? 1 : "any",
                      },
                    }}
                    helperText={helperText}
                    required={field.required}
                    disabled={readOnly}
                    fullWidth
                  />
                );
              }
              if (field.type === "boolean") {
                return (
                  <TextField
                    key={field.name}
                    label={label}
                    select
                    value={value}
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    helperText={helperText}
                    required={field.required}
                    disabled={readOnly}
                    fullWidth
                  >
                    <MenuItem value="true">True</MenuItem>
                    <MenuItem value="false">False</MenuItem>
                  </TextField>
                );
              }
              return (
                <TextField
                  key={field.name}
                  label={label}
                  value={value}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  helperText={helperText}
                  required={field.required}
                  disabled={readOnly}
                  fullWidth
                />
              );
            })}
          </Box>
        </Box>
      )}

      {!pieceDetailSaveStatus && (
        <AutosaveStatus
          status={autosave.status}
          error={autosave.error}
          lastSavedAt={autosave.lastSavedAt}
          variant="floating"
        />
      )}

      <ImageUploader
        saving={savingImage}
        widgetLoading={widgetLoading}
        uploadError={uploadError}
        imageError={imageError}
        mobile={isMobileLayout}
        hidden={readOnly}
        onUploadClick={handleUploadWidgetClick}
      />
    </Box>
  );
}
