import { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import ImageLightbox from "./ImageLightbox";
import CloudinaryImage from "./CloudinaryImage";
import type { PieceDetail, PieceState } from "../util/types";
import {
  fetchCloudinaryWidgetConfig,
  signCloudinaryWidgetParams,
  updateCurrentState,
  updatePiece,
} from "../util/api";
import {
  type ResolvedAdditionalField,
  formatWorkflowFieldLabel,
  getAdditionalFieldDefinitions,
} from "../util/workflow";
import { entryNameOrEmpty, normalizeOptionalText, undefinedIfBlank } from "../util/optionalValues";
import GlobalEntryField from "./GlobalEntryField";
import AutosaveStatus from "./AutosaveStatus";
import { useAutosave } from "./useAutosave";

export type ImageEntry = {
  url: string;
  caption: string;
  cloudinary_public_id?: string | null;
};

type WorkflowStateProps = {
  pieceState: PieceState;
  pieceId: string;
  onSaved: (updated: PieceDetail) => void;
  onDirtyChange?: (dirty: boolean) => void;
  currentLocation?: string;
  currentThumbnail?: import("../util/types").Thumbnail | null;
  onSetAsThumbnail?: (image: ImageEntry) => Promise<void>;
  autosaveDelayMs?: number;
};

type AdditionalFieldInputMap = Record<string, string>;
type GlobalRefPkMap = Record<string, string>;

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

// ── ImageList ─────────────────────────────────────────────────────────────────

type ImageListProps = {
  images: ImageEntry[];
  onRemove: (index: number) => void;
  onViewLightbox: (index: number) => void;
  onEditCaption: (index: number) => void;
  editingCaptionIndex: number | null;
  editingCaptionValue: string;
  onCaptionValueChange: (value: string) => void;
  onCaptionCommit: (index: number, value: string) => void;
  onCaptionCancel: () => void;
};

function ImageList({
  images,
  onRemove,
  onViewLightbox,
  onEditCaption,
  editingCaptionIndex,
  editingCaptionValue,
  onCaptionValueChange,
  onCaptionCommit,
  onCaptionCancel,
}: ImageListProps) {
  if (images.length === 0) return null;
  return (
    <List dense disablePadding>
      {images.map((img, i) => (
        <ListItem key={i} disableGutters>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", width: "100%" }}>
            <IconButton
              aria-label="remove image"
              onClick={() => onRemove(i)}
              size="small"
            >
              ✕
            </IconButton>
            <Box
              component="button"
              onClick={() => onViewLightbox(i)}
              aria-label={`View image ${i + 1}`}
              sx={{
                p: 0,
                border: "none",
                background: "none",
                cursor: "pointer",
                borderRadius: 0.5,
                display: "block",
                flexShrink: 0,
              }}
            >
              <CloudinaryImage
                url={img.url}
                cloudinary_public_id={img.cloudinary_public_id}
                alt={img.caption || "Pottery image"}
                context="thumbnail"
                style={{ objectFit: "cover", borderRadius: 4, display: "block" }}
              />
            </Box>
            {editingCaptionIndex === i ? (
              <TextField
                value={editingCaptionValue}
                onChange={(e) => onCaptionValueChange(e.target.value)}
                onBlur={() => onCaptionCommit(i, editingCaptionValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onCaptionCommit(i, editingCaptionValue);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onCaptionCancel();
                  }
                }}
                size="small"
                autoFocus
                sx={{ flex: 1 }}
                slotProps={{ htmlInput: { "aria-label": "Edit caption" } }}
              />
            ) : (
              <>
                <ListItemText
                  primary={img.caption || "(no caption)"}
                  slotProps={{ primary: { sx: { color: "text.primary" } } }}
                />
                <IconButton
                  aria-label="edit caption"
                  onClick={() => onEditCaption(i)}
                  size="small"
                  sx={{ ml: "auto", flexShrink: 0 }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </>
            )}
          </Box>
        </ListItem>
      ))}
    </List>
  );
}

// ── ImageUploader ─────────────────────────────────────────────────────────────

type ImageUploaderProps = {
  saving: boolean;
  widgetLoading: boolean;
  uploadError: string | null;
  imageError: string | null;
  onUploadClick: () => void;
};

function ImageUploader({
  saving,
  widgetLoading,
  uploadError,
  imageError,
  onUploadClick,
}: ImageUploaderProps) {
  return (
    <Box>
      <Button
        variant="outlined"
        size="small"
        onClick={onUploadClick}
        disabled={saving || widgetLoading}
        startIcon={
          saving ? <CircularProgress size={14} color="inherit" /> : undefined
        }
        sx={{ position: "relative", mt: 1 }}
      >
        <Box sx={{ opacity: widgetLoading ? 0 : 1 }}>
          {saving ? "Saving…" : "Upload Image"}
        </Box>
        {widgetLoading && (
          <CircularProgress
            aria-hidden
            size={14}
            color="inherit"
            sx={{ position: "absolute" }}
          />
        )}
      </Button>
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
  pieceState,
  pieceId,
  onSaved,
  onDirtyChange,
  currentLocation: currentLocationProp = "",
  currentThumbnail,
  onSetAsThumbnail: onSetAsThumbnailProp,
  autosaveDelayMs,
}: WorkflowStateProps) {
  const normalizedCurrentLocationProp = normalizeOptionalText(currentLocationProp);
  const [notes, setNotes] = useState(pieceState.notes);
  const [images, setImages] = useState<ImageEntry[]>(stateImages(pieceState));
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(false);
  const [editingCaptionIndex, setEditingCaptionIndex] = useState<number | null>(null);
  const [editingCaptionValue, setEditingCaptionValue] = useState("");
  const [removeDialogIndex, setRemoveDialogIndex] = useState<number | null>(null);
  const [currentLocation, setCurrentLocation] = useState(normalizedCurrentLocationProp);
  const additionalFieldDefs = useMemo(
    () => getAdditionalFieldDefinitions(pieceState.state),
    [pieceState.state],
  );
  const baseAdditionalFieldInputs = useMemo(
    () =>
      buildAdditionalFieldInputMap(
        additionalFieldDefs,
        pieceState.additional_fields ?? {},
      ),
    [additionalFieldDefs, pieceState.additional_fields],
  );
  const baseGlobalRefPks = useMemo(
    () =>
      buildGlobalRefPkMap(
        additionalFieldDefs,
        pieceState.additional_fields ?? {},
      ),
    [additionalFieldDefs, pieceState.additional_fields],
  );
  const [additionalFieldInputs, setAdditionalFieldInputs] = useState(
    baseAdditionalFieldInputs,
  );
  const [globalRefPks, setGlobalRefPks] = useState<GlobalRefPkMap>(baseGlobalRefPks);
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
        baseAdditionalFieldInputs,
        baseGlobalRefPks,
      ),
    [additionalFieldDefs, baseAdditionalFieldInputs, baseGlobalRefPks],
  );
  const additionalFieldsDirty =
    JSON.stringify(normalizedAdditionalFields) !==
    JSON.stringify(normalizedBaseAdditionalFields);
  const locationDirty =
    currentLocation.trim() !== normalizedCurrentLocationProp.trim();

  const theme = useTheme();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  async function handleSetAsThumbnail(image: ImageEntry) {
    if (onSetAsThumbnailProp) {
      await onSetAsThumbnailProp(image);
      return;
    }
    const updated = await updatePiece(pieceId, {
      thumbnail: {
        url: image.url,
        cloudinary_public_id: image.cloudinary_public_id ?? null,
      },
    });
    onSaved(updated);
  }

  useEffect(() => {
    setNotes(pieceState.notes);
    setImages(stateImages(pieceState));
    setAdditionalFieldInputs(baseAdditionalFieldInputs);
    setGlobalRefPks(baseGlobalRefPks);
    setCurrentLocation(normalizedCurrentLocationProp);
  }, [
    pieceState,
    baseAdditionalFieldInputs,
    baseGlobalRefPks,
    normalizedCurrentLocationProp,
  ]);

  const [savingImage, setSavingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const isDirty =
    notes !== pieceState.notes || additionalFieldsDirty || locationDirty;

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
    let finalResult = result;
    if (locationDirty) {
      finalResult = await updatePiece(pieceId, {
        current_location: undefinedIfBlank(currentLocation),
      });
    }
    onSaved(finalResult);
  }, [
    currentLocation,
    images,
    locationDirty,
    normalizedAdditionalFields,
    notes,
    onSaved,
    pieceId,
  ]);

  const autosaveKey = useMemo(
    () =>
      JSON.stringify({
        notes,
        images,
        additional_fields: normalizedAdditionalFields,
        current_location: currentLocation.trim(),
      }),
    [currentLocation, images, normalizedAdditionalFields, notes],
  );

  const autosave = useAutosave({
    dirty: isDirty,
    saveKey: autosaveKey,
    save: saveWorkflowState,
    delayMs: autosaveDelayMs,
  });

  function openRemoveDialog(index: number) {
    setRemoveDialogIndex(index);
  }

  function closeRemoveDialog() {
    setRemoveDialogIndex(null);
  }

  async function confirmRemoveImage() {
    if (removeDialogIndex === null) return;
    const index = removeDialogIndex;
    closeRemoveDialog();
    const updatedImages = images.filter((_, i) => i !== index);
    setSavingImage(true);
    setImageError(null);
    try {
      const result = await updateCurrentState(pieceId, {
        notes,
        images: updatedImages,
        additional_fields: normalizedAdditionalFields,
      });
      onSaved(result);
    } catch {
      setImageError("Failed to remove image. Please try again.");
    } finally {
      setSavingImage(false);
    }
  }

  function startEditingCaption(index: number) {
    setEditingCaptionIndex(index);
    setEditingCaptionValue(images[index].caption);
  }

  async function commitCaptionEdit(index: number, value: string) {
    setEditingCaptionIndex(null);
    const newCaption = value.trim();
    if (newCaption === images[index].caption) return;
    const updatedImages = images.map((img, i) =>
      i === index ? { ...img, caption: newCaption } : img,
    );
    setSavingImage(true);
    setImageError(null);
    try {
      const result = await updateCurrentState(pieceId, {
        notes,
        images: updatedImages,
        additional_fields: normalizedAdditionalFields,
      });
      onSaved(result);
    } catch {
      setImageError("Failed to save caption. Please try again.");
    } finally {
      setSavingImage(false);
    }
  }

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
            .then(onSaved)
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
    setAdditionalFieldInputs((prev) => ({ ...prev, [name]: value }));
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
        onChange={(e) => setNotes(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
        fullWidth
      />

      <GlobalEntryField
        globalName="location"
        label="Current location"
        value={currentLocation}
        onSelect={(entry) => setCurrentLocation(entryNameOrEmpty(entry))}
      />

      {additionalFieldDefs.length > 0 && (
        <Box>
          <Typography
            variant="subtitle2"
            sx={{ color: "text.secondary", mb: 1 }}
          >
            State details
          </Typography>
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
              const label = formatWorkflowFieldLabel(field.name);
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
                      setGlobalRefPks((prev) =>
                        entry
                          ? { ...prev, [field.name]: entry.id }
                          : Object.fromEntries(
                              Object.entries(prev).filter(
                                ([key]) => key !== field.name,
                              ),
                            ),
                      );
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

      <AutosaveStatus
        status={autosave.status}
        error={autosave.error}
        lastSavedAt={autosave.lastSavedAt}
      />

      {/* Images */}
      <Box>
        <ImageList
          images={images}
          onRemove={openRemoveDialog}
          onViewLightbox={setLightboxIndex}
          onEditCaption={startEditingCaption}
          editingCaptionIndex={editingCaptionIndex}
          editingCaptionValue={editingCaptionValue}
          onCaptionValueChange={setEditingCaptionValue}
          onCaptionCommit={commitCaptionEdit}
          onCaptionCancel={() => setEditingCaptionIndex(null)}
        />
        <ImageUploader
          saving={savingImage}
          widgetLoading={widgetLoading}
          uploadError={uploadError}
          imageError={imageError}
          onUploadClick={handleUploadWidgetClick}
        />
      </Box>

      {/* Remove image confirmation dialog */}
      <Dialog open={removeDialogIndex !== null} onClose={closeRemoveDialog}>
        <DialogTitle>Remove Image</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove this image? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRemoveDialog}>Cancel</Button>
          <Button
            onClick={() => void confirmRemoveImage()}
            color="error"
            variant="contained"
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          currentThumbnailUrl={currentThumbnail?.url}
          onSetAsThumbnail={handleSetAsThumbnail}
        />
      )}
    </Box>
  );
}
