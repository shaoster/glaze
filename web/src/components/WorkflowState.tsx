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
  type ResolvedAdditionalField,
  getAdditionalFieldDefinitions,
} from "../util/workflow";
import { entryNameOrEmpty } from "../util/optionalValues";
import GlobalEntryField from "./GlobalEntryField";
import AutosaveStatus from "./AutosaveStatus";
import { useAutosave } from "./useAutosave";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";

export type ImageEntry = {
  url: string;
  caption: string;
  cloudinary_public_id?: string | null;
};

type WorkflowStateProps = {
  initialPieceState: PieceState;
  pieceId: string;
  onSaved: (updated: PieceDetail) => void;
  onDirtyChange?: (dirty: boolean) => void;
  autosaveDelayMs?: number;
};

type AdditionalFieldInputMap = Record<string, string>;
type GlobalRefPkMap = Record<string, string>;
type DraftState = {
  baseState: PieceState;
  notes: string;
  images: ImageEntry[];
  additionalFieldInputs: AdditionalFieldInputMap;
  globalRefPks: GlobalRefPkMap;
};
type DraftAction =
  | { type: "replace_base_state"; pieceState: PieceState }
  | { type: "set_notes"; notes: string }
  | { type: "set_additional_field"; name: string; value: string }
  | { type: "set_global_ref_pks"; globalRefPks: GlobalRefPkMap };

// Global-ref objects always carry an id and name. Any object without a name
// is not a valid global ref value — treat it as empty so callers receive a
// typed contract rather than a runtime fallback.
function formatAdditionalFieldValue(
  value: unknown,
  type: ResolvedAdditionalField["type"],
): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") {
      return obj.name;
    }
    // Objects without a name field are not representable as a string input.
    return "";
  }
  if (type === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function extractGlobalRefPk(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function buildAdditionalFieldInputMap(
  defs: ResolvedAdditionalField[],
  values: Record<string, unknown>,
): AdditionalFieldInputMap {
  const map: AdditionalFieldInputMap = {};
  defs.forEach((def) => {
    map[def.name] = formatAdditionalFieldValue(values[def.name], def.type);
  });
  return map;
}

function buildGlobalRefPkMap(
  defs: ResolvedAdditionalField[],
  values: Record<string, unknown>,
): GlobalRefPkMap {
  const map: GlobalRefPkMap = {};
  defs.forEach((def) => {
    if (def.isGlobalRef) {
      const pk = extractGlobalRefPk(values[def.name]);
      if (pk) map[def.name] = pk;
    }
  });
  return map;
}

function normalizeAdditionalFieldPayload(
  defs: ResolvedAdditionalField[],
  inputs: AdditionalFieldInputMap,
  globalRefPks: GlobalRefPkMap,
): Record<string, string | number | boolean | null> {
  const payload: Record<string, string | number | boolean | null> = {};
  defs.forEach((def) => {
    if (def.isGlobalRef) {
      const pk = globalRefPks[def.name];
      payload[def.name] = pk || null;
      return;
    }
    // buildAdditionalFieldInputMap initializes all def names, so `raw` is
    // always a string here. Guard is defensive for future call sites.
    const raw = inputs[def.name] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "") {
      return;
    }
    if (def.type === "integer") {
      const parsed = parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        payload[def.name] = parsed;
      }
      return;
    }
    if (def.type === "number") {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed)) {
        payload[def.name] = parsed;
      }
      return;
    }
    if (def.type === "boolean") {
      if (trimmed === "true") {
        payload[def.name] = true;
      } else if (trimmed === "false") {
        payload[def.name] = false;
      }
      return;
    }
    payload[def.name] = raw;
  });
  return payload;
}

function stateImages(pieceState: PieceState): ImageEntry[] {
  return pieceState.images.map((img) => ({
    url: img.url,
    caption: img.caption,
    cloudinary_public_id: img.cloudinary_public_id ?? null,
  }));
}

function buildDraftState(pieceState: PieceState): DraftState {
  const additionalFieldDefs = getAdditionalFieldDefinitions(pieceState.state);
  const additionalFields = pieceState.additional_fields ?? {};
  return {
    baseState: pieceState,
    notes: pieceState.notes,
    images: stateImages(pieceState),
    additionalFieldInputs: buildAdditionalFieldInputMap(
      additionalFieldDefs,
      additionalFields,
    ),
    globalRefPks: buildGlobalRefPkMap(additionalFieldDefs, additionalFields),
  };
}

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "replace_base_state":
      return buildDraftState(action.pieceState);
    case "set_notes":
      return { ...state, notes: action.notes };
    case "set_additional_field":
      return {
        ...state,
        additionalFieldInputs: {
          ...state.additionalFieldInputs,
          [action.name]: action.value,
        },
      };
    case "set_global_ref_pks":
      return { ...state, globalRefPks: action.globalRefPks };
    default:
      return state;
  }
}

// ── ImageUploader ─────────────────────────────────────────────────────────────

type ImageUploaderProps = {
  saving: boolean;
  widgetLoading: boolean;
  uploadError: string | null;
  imageError: string | null;
  mobile: boolean;
  onUploadClick: () => void;
};

function ImageUploader({
  saving,
  widgetLoading,
  uploadError,
  imageError,
  mobile,
  onUploadClick,
}: ImageUploaderProps) {
  const buttonDisabled = saving || widgetLoading;
  const statusMessage = saving ? "Saving…" : "Upload Image";

  return (
    <Box>
      {mobile ? (
        <Portal>
          <Fab
            color="primary"
            aria-label="Upload Image"
            onClick={onUploadClick}
            disabled={buttonDisabled}
            sx={{
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
            startIcon={
              saving ? <CircularProgress size={14} color="inherit" /> : undefined
            }
            sx={{ position: "relative" }}
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
}: WorkflowStateProps) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [draft, dispatch] = useReducer(
    draftReducer,
    initialPieceState,
    buildDraftState,
  );
  const { baseState, notes, images, additionalFieldInputs, globalRefPks } = draft;
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
        draft.baseState.additional_fields
          ? buildAdditionalFieldInputMap(
              additionalFieldDefs,
              draft.baseState.additional_fields,
            )
          : {},
        buildGlobalRefPkMap(
          additionalFieldDefs,
          draft.baseState.additional_fields ?? {},
        ),
      ),
    [additionalFieldDefs, draft.baseState.additional_fields],
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
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const saveWorkflowState = useCallback(async () => {
    const payload = {
      notes,
      images,
      additional_fields: normalizedAdditionalFields,
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
        additional_fields: normalizedAdditionalFields,
      }),
    [images, normalizedAdditionalFields, notes],
  );

  const autosave = useAutosave({
    dirty: isDirty,
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
    setUploadError(null);
    setWidgetLoading(true);
    let config;
    try {
      config = await fetchCloudinaryWidgetConfig();
    } catch {
      setUploadError("Failed to load upload configuration. Please try again.");
      return;
    }
    const hideStyle = document.createElement("style");
    hideStyle.textContent = 'iframe[title="Upload Widget"] { opacity: 0; }';
    document.head.appendChild(hideStyle);

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
        multiple: false,
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
          }
        }
        if (error) {
          setWidgetLoading(false);
          hideStyle.remove();
          setUploadError("Upload failed. Please try again.");
          return;
        }
        if (result?.event === "success") {
          const newImage = {
            url: result.info.secure_url,
            caption: "",
            cloudinary_public_id: result.info.public_id,
          };
          setSavingImage(true);
          setImageError(null);
          updateCurrentState(pieceId, {
            notes,
            images: [...images, newImage],
            additional_fields: normalizedAdditionalFields,
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
      {/* Notes */}
      <TextField
        label="Notes"
        multiline
        minRows={3}
        value={notes}
        onChange={(e) => dispatch({ type: "set_notes", notes: e.target.value })}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
        fullWidth
      />
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
        onUploadClick={handleUploadWidgetClick}
      />
    </Box>
  );
}
