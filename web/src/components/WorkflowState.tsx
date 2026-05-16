import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
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
import type { PieceDetail, PieceState, UISchema } from "../util/types";
import {
  fetchWorkflowStateSchema,
  updateCurrentState,
  type UpdateStatePayload,
} from "../util/api";
import { openCloudinaryUploadWidget } from "../util/cloudinaryUpload";
import {
  getCustomFieldDefinitions,
  getDefinitionsFromSchema,
} from "../util/workflow";
import { entryNameOrEmpty } from "../util/optionalValues";
import GlobalEntryField from "./GlobalEntryField";
import AutosaveStatus from "./AutosaveStatus";
import { useAutosave } from "./useAutosave";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";
import { useAsync } from "../util/useAsync";
import {
  type ImageEntry,
  buildDraftState,
  draftReducer,
  normalizeCustomFieldPayload,
} from "./workflowStateDraft";

type WorkflowStateProps = {
  initialPieceState: PieceState;
  pieceId: string;
  onSaved: (updated: PieceDetail) => void;
  onDirtyChange?: (dirty: boolean) => void;
  autosaveDelayMs?: number;
  readOnly?: boolean;
  hideNotes?: boolean;
  hideImageUpload?: boolean;
  saveStateFn?: (payload: UpdateStatePayload) => Promise<PieceDetail>;
  /** Optional pre-fetched schema to avoid an extra API call. */
  uiSchema?: UISchema;
  disableAutosave?: boolean;
  /** Called whenever the payload changes. */
  onChange?: (payload: UpdateStatePayload) => void;
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
        <Portal
          container={
            (typeof document !== "undefined" &&
              document.getElementById("piece-upload-trigger")) ||
            null
          }
        >
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
  hideNotes = false,
  hideImageUpload = false,
  saveStateFn,
  uiSchema: initialUiSchema,
  disableAutosave = false,
  onChange,
}: WorkflowStateProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [draft, dispatch] = useReducer(
    draftReducer,
    initialPieceState,
    buildDraftState,
  );
  const { baseState, notes, images, customFieldInputs, globalRefPks } = draft;

  const { data: uiSchema } = useAsync(
    () => fetchWorkflowStateSchema(baseState.state),
    [baseState.state],
    { enabled: !initialUiSchema },
  );

  const activeSchema = initialUiSchema ?? uiSchema;

  const baseDraft = useMemo(() => buildDraftState(baseState), [baseState]);
  const customFieldDefs = useMemo(() => {
    if (activeSchema) {
      return getDefinitionsFromSchema(activeSchema);
    }
    // Fallback to build-time AST if schema is not yet loaded.
    return getCustomFieldDefinitions(baseState.state);
  }, [baseState.state, activeSchema]);

  const normalizedCustomFields = useMemo(
    () =>
      normalizeCustomFieldPayload(
        customFieldDefs,
        customFieldInputs,
        globalRefPks,
      ),
    [customFieldDefs, customFieldInputs, globalRefPks],
  );
  const normalizedBaseCustomFields = useMemo(
    () =>
      normalizeCustomFieldPayload(
        customFieldDefs,
        baseDraft.customFieldInputs,
        baseDraft.globalRefPks,
      ),
    [customFieldDefs, baseDraft.customFieldInputs, baseDraft.globalRefPks],
  );
  const customFieldsDirty =
    JSON.stringify(normalizedCustomFields) !==
    JSON.stringify(normalizedBaseCustomFields);

  const theme = useTheme();
  const isMobileLayout = useMediaQuery(theme.breakpoints.down("sm"));

  const [savingImage, setSavingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const latestImagesRef = useRef<ImageEntry[]>(images);
  const imageSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const isDirty = notes !== baseState.notes || customFieldsDirty;

  const currentPayload = useMemo(
    () => ({
      notes,
      images,
      custom_fields: normalizedCustomFields,
    }),
    [notes, images, normalizedCustomFields],
  );

  useEffect(() => {
    latestImagesRef.current = images;
  }, [images]);

  useEffect(() => {
    onDirtyChange?.(readOnly ? false : isDirty);
  }, [isDirty, onDirtyChange, readOnly]);

  useEffect(() => {
    if (!readOnly) {
      onChange?.(currentPayload);
    }
  }, [currentPayload, onChange, readOnly]);

  const saveWorkflowState = useCallback(async () => {
    const saveFn = saveStateFn ?? ((p) => updateCurrentState(pieceId, p));
    const result = await saveFn(currentPayload);
    const savedState = saveStateFn
      ? result.history.find((ps) => ps.id === initialPieceState.id) ?? result.current_state
      : result.current_state;
    dispatch({ type: "replace_base_state", pieceState: savedState });
    onSaved(result);
  }, [
    pieceId,
    initialPieceState.id,
    onSaved,
    saveStateFn,
    currentPayload,
  ]);

  const autosaveKey = useMemo(
    () =>
      JSON.stringify({
        notes,
        images,
        custom_fields: normalizedCustomFields,
      }),
    [images, normalizedCustomFields, notes],
  );


  const autosave = useAutosave({
    dirty: !readOnly && isDirty && !disableAutosave,
    saveKey: autosaveKey,
    save: saveWorkflowState,
    delayMs: autosaveDelayMs,
  });
  const pieceDetailSaveStatus = usePieceDetailSaveStatus();

  const saveUploadedImage = useCallback(
    (newImage: ImageEntry) => {
      setSavingImage(true);
      setImageError(null);
      const queuedSave = imageSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const nextImages = [...latestImagesRef.current, newImage];
          const payload = {
            notes,
            images: nextImages,
            custom_fields: normalizedCustomFields,
          };
          const saveFn = saveStateFn ?? ((p) => updateCurrentState(pieceId, p));
          const result = await saveFn(payload);
          const savedState = saveStateFn
            ? result.history.find((ps) => ps.id === initialPieceState.id) ?? result.current_state
            : result.current_state;
          latestImagesRef.current = savedState.images;
          dispatch({
            type: "replace_base_state",
            pieceState: savedState,
          });
          onSaved(result);
        });
      imageSaveQueueRef.current = queuedSave;
      queuedSave
        .catch(() =>
          setImageError("Failed to save image. Please try again."),
        )
        .finally(() => {
          if (imageSaveQueueRef.current === queuedSave) {
            setSavingImage(false);
          }
        });
    },
    [initialPieceState.id, normalizedCustomFields, notes, onSaved, pieceId, saveStateFn],
  );

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

    const cleanupWidgetStyles = () => {
      hideStyle.remove();
      safeAreaStyle.remove();
    };
    const uploadWidget = await openCloudinaryUploadWidget({
      messages: {
        configError: "Failed to load upload configuration. Please try again.",
        unavailableError:
          "Upload widget is not available in this browser. Please try again.",
        signatureError: "Failed to sign upload. Please try again.",
        uploadError: "Upload failed. Please try again.",
      },
      widgetOptions: {
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
      callbacks: {
        onError: (message) => {
          setWidgetLoading(false);
          cleanupWidgetStyles();
          setUploadError(message);
        },
        onDisplayChange: (state) => {
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
        },
        onSuccess: (result, config) => {
          const newImage = {
            url: result.info.secure_url,
            caption: "",
            cloudinary_public_id: result.info.public_id,
            cloud_name: config.cloud_name,
            crop: null,
          };
          saveUploadedImage(newImage);
        },
      },
    });
    if (!uploadWidget) {
      setWidgetLoading(false);
      cleanupWidgetStyles();
    }
  }

  function handleFieldChange(name: string, value: string) {
    dispatch({ type: "set_custom_field", name, value });
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
      {/* Notes — hidden in public views, disabled in owner read-only views */}
      {!hideNotes && (
        <TextField
          label="Notes"
          multiline
          value={notes}
          onChange={(e) => dispatch({ type: "set_notes", notes: e.target.value })}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
          fullWidth
          disabled={readOnly}
          sx={{
            mb: 1.5,
            "& .MuiInputBase-root": { fontSize: "0.875rem" },
            "& .MuiInputLabel-root": { fontSize: "0.875rem" },
          }}
        />
      )}
      {customFieldDefs.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            pt: 3, // Increased padding above the custom fields interior
            alignItems: "start",
          }}
        >
          {customFieldDefs.map((field) => {
              const value = customFieldInputs[field.name] ?? "";
              const helperText = field.description;
              const label = field.label;
              if (field.isStateRef || field.isCalculated) {
                const isPercent = field.displayAs === "percent";
                const valueNum = Number(value);
                const displayValue =
                  isPercent && !Number.isNaN(valueNum)
                    ? (valueNum * 100).toFixed(field.decimals ?? 0)
                    : value;

                const hasUnit = isPercent || !!(field.unit && value);
                const unit = isPercent ? "%" : field.unit;
                const formattedValue = hasUnit ? `${displayValue} ${unit}` : value;
                return (
                  <TextField
                    key={field.name}
                    label={label}
                    type={
                      !hasUnit &&
                      (field.type === "number" || field.type === "integer")
                        ? "number"
                        : "text"
                    }
                    value={formattedValue}
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
        hidden={readOnly || hideImageUpload}
        onUploadClick={handleUploadWidgetClick}
      />
    </Box>
  );
}
