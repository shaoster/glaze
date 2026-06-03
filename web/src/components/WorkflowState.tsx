import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { useTheme } from "@mui/material";
import {
  Box,
  MenuItem,
  TextField,
  useMediaQuery,
} from "@mui/material";
import type { PieceDetail, PieceState } from "../util/types";
import {
  fetchWorkflowStateSchema,
  updateCurrentState,
  type UISchema,
  type UpdateStatePayload,
} from "../util/api";
import {
  getCustomFieldDefinitions,
  getDefinitionsFromSchema,
} from "../util/workflow";
import { entryNameOrEmpty } from "../util/optionalValues";
import GlobalEntryField from "./GlobalEntryField";
import AutosaveStatus from "./AutosaveStatus";
import { useAutosave } from "./useAutosave";
import { usePieceDetailSaveStatus } from "./usePieceDetailSaveStatus";
import { useQuery } from "@tanstack/react-query";
import {
  buildDraftState,
  draftReducer,
  normalizeCustomFieldPayload,
} from "./workflowStateDraft";
import ImageUploader from "./ImageUploader";

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
  const [draft, dispatch] = useReducer(
    draftReducer,
    initialPieceState,
    buildDraftState,
  );
  const { baseState, notes, images, customFieldInputs, globalRefPks } = draft;

  const { data: uiSchema } = useQuery({
    queryKey: ["workflowStateSchema", baseState.state],
    queryFn: () => fetchWorkflowStateSchema(baseState.state),
    enabled: !initialUiSchema,
  });

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
      ? (result.history.find((ps) => ps.id === initialPieceState.id) ??
        result.current_state)
      : result.current_state;
    dispatch({ type: "replace_base_state", pieceState: savedState });
    onSaved(result);
  }, [pieceId, initialPieceState.id, onSaved, saveStateFn, currentPayload]);

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
          onChange={(e) =>
            dispatch({ type: "set_notes", notes: e.target.value })
          }
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
              const formattedValue = hasUnit
                ? `${displayValue} ${unit}`
                : value;
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
                <Box key={field.name} data-testid={`global-entry-field-${field.globalName}`}>
                  <GlobalEntryField
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
                </Box>
              );
            }
            if (field.enum?.length) {
              return (
                <TextField
                  key={field.name}
                  label={label}
                  select
                  value={value}
                  onChange={(e) =>
                    handleFieldChange(field.name, e.target.value)
                  }
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
                  onChange={(e) =>
                    handleFieldChange(field.name, e.target.value)
                  }
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
                  onChange={(e) =>
                    handleFieldChange(field.name, e.target.value)
                  }
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
        pieceId={pieceId}
        initialStateId={initialPieceState.id}
        saveStateFn={saveStateFn}
        notes={notes}
        normalizedCustomFields={normalizedCustomFields}
        images={images}
        onSaved={onSaved}
        dispatch={dispatch}
        mobile={isMobileLayout}
        hidden={readOnly || hideImageUpload}
      />
    </Box>
  );
}
