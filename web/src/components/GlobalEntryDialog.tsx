import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
  createGlobalEntry,
  fetchGlobalEntries,
  fetchGlobalEntriesWithFilters,
  toggleGlobalEntryFavorite,
} from "../util/api";
import {
  formatWorkflowFieldLabel,
  getFilterableFields,
  getGlobalComposeFrom,
  getGlobalDisplayField,
  getGlobalPickerFilters,
  getGlobalThumbnailField,
  isFavoritableGlobal,
  type GlobalPickerFilter,
} from "../util/workflow";
import { useAsync } from "../util/useAsync";
import AutosaveStatus from "./AutosaveStatus";
import CloudinaryImage from "./CloudinaryImage";
import type { AutosaveStatus as AutosaveStatusValue } from "./useAutosave";

export interface GlobalEntryDialogProps {
  globalName: string;
  open: boolean;
  onClose: () => void;
  onSelect: (entry: { id: string; name: string }) => void;
  canCreate?: boolean;
}

interface NamedRef {
  id: string;
  name: string;
}

interface GenericGlobalEntry {
  id: string;
  name?: string;
  is_favorite?: boolean;
  is_public?: boolean;
  [key: string]: unknown;
}

interface FilterState {
  boolFilters: Record<string, boolean | null>;
  onlyFavorites: boolean;
  relatedFilters: Record<string, NamedRef[] | NamedRef | null>;
}

interface CreateLayerRow {
  key: number;
  value: NamedRef | null;
}

// Reset filters to their neutral values whenever the dialog closes so each
// browse session starts from the same predictable state.
function makeEmptyFilters(
  boolFieldNames: string[],
  relatedFilters: GlobalPickerFilter[],
): FilterState {
  return {
    boolFilters: Object.fromEntries(boolFieldNames.map((name) => [name, null])),
    onlyFavorites: false,
    relatedFilters: Object.fromEntries(
      relatedFilters.map((f) => [f.paramKey, f.multiple ? [] : null]),
    ),
  };
}

// Translate the browse UI state into the exact backend query params expected by
// the generic globals endpoint, including CSV ids for multi-select filters.
function buildParams(
  filters: FilterState,
  boolFieldNames: string[],
  relatedFilters: GlobalPickerFilter[],
): Record<string, string> {
  const params: Record<string, string> = {};
  for (const name of boolFieldNames) {
    if (filters.boolFilters[name] !== null) {
      params[name] = String(filters.boolFilters[name]);
    }
  }
  for (const rf of relatedFilters) {
    const val = filters.relatedFilters[rf.paramKey];
    if (rf.multiple) {
      const arr = val as NamedRef[];
      if (arr.length > 0) {
        params[rf.paramKey] = arr.map((entry) => entry.id).join(",");
      }
      continue;
    }
    // Single-select related filters map to a lone `<field>_id` query param;
    // this branch covers globals that reference one other global filterably.
    const single = val as NamedRef | null;
    if (single) {
      params[rf.paramKey] = single.id;
    }
  }
  return params;
}

function createEmptyLayerRow(key: number): CreateLayerRow {
  return { key, value: null };
}

function createDisplayTitle(globalName: string): string {
  return `Browse ${formatWorkflowFieldLabel(globalName)}s`;
}

function getVisibilityLabel(entry: GenericGlobalEntry): string {
  return entry.is_public ? "Public" : "Private";
}

// One dialog handles both "pick an existing entry" and "create a new entry"
// flows so every global-ref field can share the same behavior and tests.
export default function GlobalEntryDialog({
  globalName,
  open,
  onClose,
  onSelect,
  canCreate = false,
}: GlobalEntryDialogProps) {
  const boolFilterableFields = useMemo(
    () => getFilterableFields(globalName),
    [globalName],
  );
  const boolFieldNames = useMemo(
    () => boolFilterableFields.map((field) => field.name),
    [boolFilterableFields],
  );
  const favoritable = isFavoritableGlobal(globalName);
  const thumbnailField = getGlobalThumbnailField(globalName);
  const relatedFilterDefs = useMemo(
    () => getGlobalPickerFilters(globalName),
    [globalName],
  );
  const composeFrom = useMemo(() => getGlobalComposeFrom(globalName), [
    globalName,
  ]);
  const composeEntry = useMemo(
    () => (composeFrom ? Object.entries(composeFrom)[0] : null),
    [composeFrom],
  );
  const composeFieldName = composeEntry?.[0] ?? null;
  const composeFieldConfig = composeEntry?.[1] ?? null;
  const createWithLayers = composeFieldConfig !== null;
  const [tab, setTab] = useState<"browse" | "create">("browse");
  const [filters, setFilters] = useState<FilterState>(() =>
    makeEmptyFilters(boolFieldNames, relatedFilterDefs),
  );
  const [relatedOptions, setRelatedOptions] = useState<
    Record<string, NamedRef[]>
  >({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutosaveStatusValue>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [componentOptions, setComponentOptions] = useState<NamedRef[]>([]);
  const [layerRows, setLayerRows] = useState<CreateLayerRow[]>([
    createEmptyLayerRow(0),
  ]);
  const [nextLayerKey, setNextLayerKey] = useState(1);
  const displayField = getGlobalDisplayField(globalName);

  useEffect(() => {
    if (!open || relatedFilterDefs.length === 0) return;
    for (const rf of relatedFilterDefs) {
      fetchGlobalEntries(rf.optionsGlobalName)
        .then((entries) =>
          setRelatedOptions((prev) => ({
            ...prev,
            [rf.paramKey]: entries.map((entry) => ({
              id: entry.id,
              name: entry.name,
            })),
          })),
        )
        .catch(() => {});
    }
  }, [globalName, open, relatedFilterDefs]);

  useEffect(() => {
    if (!open || !createWithLayers || tab !== "create" || !composeFieldConfig) {
      return;
    }
    fetchGlobalEntries(composeFieldConfig.global)
      .then((entries) =>
        setComponentOptions(
          entries.map((entry) => ({ id: entry.id, name: entry.name })),
        ),
      )
      .catch(() => {
        setComponentOptions([]);
      });
  }, [composeFieldConfig, createWithLayers, open, tab]);

  const {
    data: entriesData,
    loading,
    error: entriesAsyncError,
    setData: setEntries,
  } = useAsync<GenericGlobalEntry[]>(
    () => {
      if (!open || tab !== "browse") return Promise.resolve([]);
      const params = buildParams(filters, boolFieldNames, relatedFilterDefs);
      return fetchGlobalEntriesWithFilters<GenericGlobalEntry>(
        globalName,
        params,
      );
    },
    [boolFieldNames, filters, globalName, open, relatedFilterDefs, tab],
    { enabled: open },
  );

  const entries = entriesData ?? [];
  const entriesError = entriesAsyncError
    ? "Failed to load entries. Please try again."
    : null;
  const visible = filters.onlyFavorites
    ? entries.filter((entry) => entry.is_favorite)
    : entries;
  const title = createDisplayTitle(globalName);
  const createLabel = formatWorkflowFieldLabel(globalName);
  const createButtonLabel = createWithLayers
    ? `Create ${createLabel}`
    : `Create ${createLabel}`;
  const canSubmitCreate = createWithLayers
    ? layerRows.some((row) => row.value !== null)
    : createName.trim() !== "";

  // Resetting create state on close prevents old layer selections or failed
  // create attempts from leaking into the next time the dialog opens.
  function resetCreateState() {
    setCreateName("");
    setCreating(false);
    setCreateError(null);
    setLayerRows([createEmptyLayerRow(0)]);
    setNextLayerKey(1);
  }

  function handleClose() {
    setFilters(makeEmptyFilters(boolFieldNames, relatedFilterDefs));
    setTab("browse");
    resetCreateState();
    onClose();
  }

  // The paired Yes/No checkboxes behave like a tri-state filter:
  // `true`, `false`, or "don't care" when both are cleared.
  function handleBoolFilter(field: string, checked: boolean, value: boolean) {
    setFilters((prev) => ({
      ...prev,
      boolFilters: {
        ...prev.boolFilters,
        [field]: checked
          ? value
          : prev.boolFilters[field] === value
            ? null
            : prev.boolFilters[field],
      },
    }));
  }

  // Related global filters are stored separately from plain boolean toggles so
  // we can feed them back into MUI Autocomplete as controlled values.
  function handleGlobalPickerFilter(
    paramKey: string,
    value: NamedRef[] | NamedRef | null,
  ) {
    setFilters((prev) => ({
      ...prev,
      relatedFilters: { ...prev.relatedFilters, [paramKey]: value },
    }));
  }

  // Favorites mutate in place instead of forcing a full refetch so the browse
  // list stays responsive and keeps the user's current filter context intact.
  async function handleToggleFavorite(entry: GenericGlobalEntry) {
    setTogglingId(entry.id);
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await toggleGlobalEntryFavorite(globalName, entry.id, !entry.is_favorite);
      setEntries((prev) =>
        (prev ?? []).map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, is_favorite: !candidate.is_favorite }
            : candidate,
        ),
      );
      setLastSavedAt(new Date());
      setSaveStatus("saved");
    } catch {
      setSaveError("Failed to update favorite. Please try again.");
      setSaveStatus("error");
    } finally {
      setTogglingId(null);
    }
  }

  function handleSelect(entry: { id: string; name: string }) {
    onSelect(entry);
    handleClose();
  }

  // Layer rows use stable keys so removing one row does not scramble the
  // Autocomplete inputs the user has already filled in.
  function updateLayerRow(key: number, value: NamedRef | null) {
    setLayerRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, value } : row)),
    );
  }

  function addLayerRow() {
    setLayerRows((prev) => [...prev, createEmptyLayerRow(nextLayerKey)]);
    setNextLayerKey((prev) => prev + 1);
  }

  function removeLayerRow(key: number) {
    setLayerRows((prev) => {
      // Keep one empty row around so a composition-capable dialog never lands
      // in a state with no visible input controls at all.
      if (prev.length === 1) {
        return [createEmptyLayerRow(key)];
      }
      return prev.filter((row) => row.key !== key);
    });
  }

  // Creation reuses the same dialog close path as selection so the caller
  // always receives a normalized `{ id, name }` object regardless of source.
  async function handleCreate() {
    if (!canSubmitCreate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = createWithLayers
        ? await createGlobalEntry(globalName, {
            layers: layerRows
              .map((row) => row.value?.id ?? null)
              .filter((id): id is string => id !== null),
          })
        : await createGlobalEntry(globalName, {
            field: displayField,
            value: createName.trim(),
          });
      handleSelect({ id: created.id, name: created.name });
    } catch {
      setCreateError(`Failed to create ${createLabel.toLowerCase()}.`);
      setCreating(false);
    }
  }

  // Browse keeps filters and result list in one tab so the dialog stays useful
  // on mobile without pushing the user through nested picker screens.
  function renderBrowseTab() {
    return (
      <>
        <Box
          sx={{
            px: 3,
            pt: 1,
            pb: 1,
            flexShrink: 0,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Stack spacing={2}>
            {relatedFilterDefs.map((rf) =>
              rf.multiple ? (
                <Autocomplete
                  key={rf.paramKey}
                  multiple
                  options={relatedOptions[rf.paramKey] ?? []}
                  getOptionLabel={(option) => option.name}
                  value={
                    (filters.relatedFilters[rf.paramKey] as NamedRef[]) ?? []
                  }
                  onChange={(_event, value) =>
                    handleGlobalPickerFilter(rf.paramKey, value)
                  }
                  renderInput={(params) => (
                    <TextField {...params} label={rf.label} size="small" />
                  )}
                  size="small"
                />
              ) : (
                <Autocomplete
                  key={rf.paramKey}
                  options={relatedOptions[rf.paramKey] ?? []}
                  getOptionLabel={(option) => option.name}
                  value={
                    (filters.relatedFilters[rf.paramKey] as NamedRef | null) ??
                    null
                  }
                  onChange={(_event, value) =>
                    handleGlobalPickerFilter(rf.paramKey, value)
                  }
                  renderInput={(params) => (
                    <TextField {...params} label={rf.label} size="small" />
                  )}
                  size="small"
                />
              ),
            )}

            {boolFilterableFields.length > 0 && (
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0,
                  pt: 0,
                  mt: "6px !important",
                }}
              >
                {boolFilterableFields.map(({ name, label }) => (
                  <Box key={name}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0, padding: 0 }}
                    >
                      {label}
                    </Typography>
                    <FormControlLabel
                      label="Yes"
                      control={
                        <Checkbox
                          sx={{ pt: 0, pb: 0 }}
                          size="small"
                          checked={filters.boolFilters[name] === true}
                          onChange={(event) =>
                            handleBoolFilter(name, event.target.checked, true)
                          }
                        />
                      }
                    />
                    <FormControlLabel
                      label="No"
                      control={
                        <Checkbox
                          sx={{ pt: 0, pb: 0 }}
                          size="small"
                          checked={filters.boolFilters[name] === false}
                          onChange={(event) =>
                            handleBoolFilter(name, event.target.checked, false)
                          }
                        />
                      }
                    />
                  </Box>
                ))}
              </Box>
            )}

            {favoritable && (
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.onlyFavorites}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        onlyFavorites: event.target.checked,
                      }))
                    }
                  />
                }
                label="Only favorites"
                sx={{ mt: "4px !important", mb: "0px !important" }}
              />
            )}
          </Stack>
        </Box>

        <DialogContent sx={{ flex: 1, overflowY: "auto", pt: 2 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress />
            </Box>
          ) : entriesError ? (
            <Alert severity="error" sx={{ my: 2 }}>
              {entriesError}
            </Alert>
          ) : visible.length === 0 ? (
            <Typography
              color="text.secondary"
              sx={{ py: 2, textAlign: "center" }}
            >
              No entries match the current filters.
            </Typography>
          ) : (
            <Stack spacing={1}>
              {visible.map((entry) => {
                const thumbnailUrl = thumbnailField
                  ? (entry[thumbnailField] as string | undefined)
                  : undefined;
                return (
                  <Box
                    key={entry.id}
                    onClick={() =>
                      handleSelect({ id: entry.id, name: entry.name ?? "" })
                    }
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      p: 1.5,
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: "divider",
                      cursor: "pointer",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    {thumbnailField &&
                      (thumbnailUrl ? (
                        <CloudinaryImage
                          url={thumbnailUrl}
                          alt={entry.name ?? ""}
                          context="thumbnail"
                        />
                      ) : (
                        <Box
                          sx={{
                            width: 64,
                            height: 64,
                            flexShrink: 0,
                            bgcolor: "action.disabledBackground",
                            borderRadius: 1,
                          }}
                        />
                      ))}

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body1" fontWeight="medium" noWrap>
                        {entry.name}
                      </Typography>
                      {(relatedFilterDefs.some((rf) => entry[rf.entryKey]) ||
                        typeof entry.is_public === "boolean") && (
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 0.5,
                            mt: 0.5,
                          }}
                        >
                          {relatedFilterDefs.map((rf) => {
                            const value = entry[rf.entryKey];
                            if (!value) return null;
                            if (rf.multiple) {
                              return (value as NamedRef[]).map((ref) => (
                                <Chip key={ref.id} label={ref.name} size="small" />
                              ));
                            }
                            const ref = value as NamedRef;
                            return (
                              <Chip
                                key={rf.paramKey}
                                label={ref.name}
                                size="small"
                                variant="outlined"
                                color="secondary"
                              />
                            );
                          })}
                          {typeof entry.is_public === "boolean" && (
                            <Chip
                              label={getVisibilityLabel(entry)}
                              size="small"
                              variant={entry.is_public ? "outlined" : "filled"}
                            />
                          )}
                        </Box>
                      )}
                    </Box>

                    {favoritable && (
                      <IconButton
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleFavorite(entry);
                        }}
                        disabled={togglingId === entry.id}
                        size="small"
                        aria-label={
                          entry.is_favorite
                            ? "Remove from favorites"
                            : "Add to favorites"
                        }
                      >
                        {entry.is_favorite ? (
                          <StarIcon fontSize="small" color="warning" />
                        ) : (
                          <StarBorderIcon fontSize="small" />
                        )}
                      </IconButton>
                    )}
                  </Box>
                );
              })}
            </Stack>
          )}
        </DialogContent>
      </>
    );
  }

  // The create tab supports both simple name-entry globals and ordered
  // composition globals (currently glaze combinations) in one shared surface.
  function renderCreateTab() {
    return (
      <DialogContent sx={{ flex: 1, overflowY: "auto", pt: 2 }}>
        <Stack spacing={2}>
          {createWithLayers && composeFieldConfig && composeFieldName ? (
            <>
              <Typography color="text.secondary" variant="body2">
                Choose the {formatWorkflowFieldLabel(composeFieldName).toLowerCase()} in
                order. You can repeat the same entry more than once.
              </Typography>
              {layerRows.map((row, index) => (
                <Box
                  key={row.key}
                  sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}
                >
                  <Autocomplete
                    options={componentOptions}
                    getOptionLabel={(option) => option.name}
                    value={row.value}
                    onChange={(_event, value) => updateLayerRow(row.key, value)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={`Layer ${index + 1}`}
                        required={index === 0}
                      />
                    )}
                    sx={{ flex: 1 }}
                  />
                  <Button
                    onClick={() => removeLayerRow(row.key)}
                    disabled={layerRows.length === 1}
                    sx={{ whiteSpace: "nowrap", mt: "1px" }}
                  >
                    Remove
                  </Button>
                </Box>
              ))}
              <Button variant="outlined" onClick={addLayerRow}>
                Add layer
              </Button>
            </>
          ) : (
            <TextField
              label={createLabel}
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              required
              autoFocus
              fullWidth
            />
          )}
          {createError && <Alert severity="error">{createError}</Alert>}
        </Stack>
      </DialogContent>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { height: "85vh", display: "flex", flexDirection: "column" },
      }}
    >
      <DialogTitle sx={{ paddingTop: 2, paddingBottom: 0 }}>
        {title}
      </DialogTitle>
      {canCreate && (
        <Tabs
          value={tab}
          onChange={(_event, value: "browse" | "create") => setTab(value)}
          sx={{ px: 3, pt: 1 }}
        >
          <Tab label="Browse" value="browse" />
          <Tab label="Create" value="create" />
        </Tabs>
      )}
      {tab === "browse" ? renderBrowseTab() : renderCreateTab()}
      <DialogActions>
        {saveStatus !== "idle" && tab === "browse" && (
          <AutosaveStatus
            status={saveStatus}
            error={saveError}
            lastSavedAt={lastSavedAt}
          />
        )}
        {tab === "create" && canCreate && (
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !canSubmitCreate}
          >
            {creating ? `${createButtonLabel}…` : createButtonLabel}
          </Button>
        )}
        <Button onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
