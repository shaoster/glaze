/**
 * Web interface to the workflow.yml configuration.
 *
 * This module loads workflow.yml at build time and exposes typed helpers that
 * the web app uses to drive dynamic behavior — field definitions for per-state
 * forms, display labels, and global type metadata. It is the frontend
 * counterpart to the backend's `_STATE_MAP` / `_GLOBALS_MAP` in
 * `api/models.py`. Neither the state list nor the globals map should be
 * duplicated elsewhere in the app; derive them from the exports here.
 */
import workflow from "../../../workflow.yml";

type FieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "image";

interface InlineFieldDef {
  type: FieldType;
  description?: string;
  required?: boolean;
  enum?: string[];
  filterable?: boolean;
  use_as_thumbnail?: boolean;
  label?: string;
  display_as?: "percent";
}

interface StateRefFieldDef {
  $ref: string;
  description?: string;
  required?: boolean;
  label?: string;
  display_as?: "percent";
}

interface GlobalRefFieldDef {
  $ref: string;
  description?: string;
  required?: boolean;
  label?: string;
  can_create?: boolean;
  filterable?: boolean;
}

export type SummaryComputeOp = "product" | "difference" | "sum" | "ratio";

export type WorkflowASTLeafNode =
  | { field: string }
  | { constant: number | string | boolean };

export interface WorkflowASTOpNode {
  op: SummaryComputeOp;
  args: WorkflowASTNode[];
}

export type WorkflowASTNode = WorkflowASTLeafNode | WorkflowASTOpNode;

interface CalculatedFieldDef {
  compute: WorkflowASTNode;
  description?: string;
  label?: string;
  unit?: string;
  decimals?: number;
  display_as?: "percent";
}

type FieldDefinition =
  | InlineFieldDef
  | StateRefFieldDef
  | GlobalRefFieldDef
  | CalculatedFieldDef;

interface WorkflowStateDefinition {
  id: string;
  visible: boolean;
  friendly_name: string;
  past_friendly_name: string;
  description: string;
  terminal?: boolean;
  successors?: string[];
  fields?: Record<string, FieldDefinition>;
  summary?: WorkflowStateSummaryDefinition;
}

export interface ComposeFromEntry {
  global: string;
  ordered?: boolean;
  filter_label?: string;
}

interface WorkflowGlobalDefinition {
  model: string;
  description?: string;
  favoritable?: boolean;
  taggable?: boolean;
  compose_from?: Record<string, ComposeFromEntry>;
  fields: Record<string, InlineFieldDef | GlobalRefFieldDef>;
}

interface WorkflowDefinition {
  version: string;
  globals?: Record<string, WorkflowGlobalDefinition>;
  states: WorkflowStateDefinition[];
}

// The workflow.yml is expected to be well-formed and is controlled by us and
// validated by tests/test_workflow.py, so we can be a bit loose with this cast.
const workflowDef = workflow as unknown as WorkflowDefinition;
const STATE_MAP = new Map<string, WorkflowStateDefinition>(
  workflowDef.states.map((state) => [state.id, state]),
);
const GLOBALS_MAP = workflowDef.globals ?? {};

function toTitleWords(value: string): string {
  return value
    .split("_")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ""))
    .join(" ");
}

export type ResolvedCustomField = {
  name: string;
  label: string;
  type: FieldType;
  description?: string;
  required: boolean;
  enum?: string[];
  isGlobalRef: boolean;
  isStateRef: boolean;
  isCalculated: boolean;
  canCreate?: boolean;
  globalName?: string;
  globalField?: string;
  unit?: string;
  decimals?: number;
  displayAs?: "percent";
};

export interface WorkflowStateMetadata {
  id: string;
  friendlyName: string;
  pastFriendlyName: string;
  description: string;
  isTerminal: boolean;
}

export interface WorkflowSummaryCondition {
  state_exists?: string;
  state_missing?: string;
}

export interface WorkflowSummaryComputeDefinition {
  op: SummaryComputeOp;
  operands?: string[];
  left?: string;
  right?: string;
  numerator?: string;
  denominator?: string;
  unit?: string;
  decimals?: number;
}

interface WorkflowSummaryItemDefinition {
  label?: string;
  description?: string;
  value?: string;
  text?: string;
  compute?: WorkflowSummaryComputeDefinition;
  when?: WorkflowSummaryCondition;
}

interface WorkflowStateSummaryDefinition {
  sections: Array<{
    title: string;
    fields: WorkflowSummaryItemDefinition[];
  }>;
}

export interface WorkflowSummaryValueItem {
  kind: "value";
  label: string;
  description?: string;
  ref: string;
  stateId: string;
  fieldName: string;
  field: ResolvedCustomField;
  when?: WorkflowSummaryCondition;
}

export interface WorkflowSummaryTextItem {
  kind: "text";
  label: string;
  description?: string;
  text: string;
  when?: WorkflowSummaryCondition;
}

export interface WorkflowSummaryComputeItem {
  kind: "compute";
  label: string;
  description?: string;
  compute: WorkflowSummaryComputeDefinition;
  when?: WorkflowSummaryCondition;
}

export type WorkflowSummaryItem =
  | WorkflowSummaryValueItem
  | WorkflowSummaryTextItem
  | WorkflowSummaryComputeItem;

export interface WorkflowSummarySection {
  title: string;
  fields: WorkflowSummaryItem[];
}

/**
 * Returns the compose_from map for the given global, if declared. Each entry
 * maps an M2M field name on the model to the global type it references.
 * Used by the frontend to identify globals that support ordered composition
 * (e.g. GlazeCombination, composed from an ordered list of GlazeTypes) and to
 * dispatch to the appropriate composition picker UI instead of a plain FK selector.
 */
export function getGlobalComposeFrom(
  globalName: string,
): Record<string, ComposeFromEntry> | undefined {
  return GLOBALS_MAP[globalName]?.compose_from;
}

export interface FilterableFieldDef {
  name: string;
  type: FieldType;
  label: string;
}

/**
 * Returns metadata for fields declared as filterable: true for a given global.
 * Used by pickers (e.g. GlazeCombinationPicker) to discover which fields to
 * expose as filter controls without hardcoding labels or field names in the component.
 * Mirrors the backend's `get_filterable_fields` helper.
 */
export function getFilterableFields(globalName: string): FilterableFieldDef[] {
  const fields = GLOBALS_MAP[globalName]?.fields ?? {};
  return Object.entries(fields)
    .filter(
      ([, def]) => "filterable" in def && (def as InlineFieldDef).filterable,
    )
    .map(([name, def]) => {
      const inline = def as InlineFieldDef;
      return {
        name,
        type: inline.type,
        label: inline.label ?? formatWorkflowFieldLabel(name),
      };
    });
}

/**
 * Returns the name of the field tagged `use_as_thumbnail: true` for the given
 * global, or null if none is declared. workflow.yml enforces that at most one
 * field per global carries this flag and that it must have type: image.
 * Used by pickers to render a thumbnail without hardcoding field names.
 */
export function getGlobalThumbnailField(globalName: string): string | null {
  const fields = GLOBALS_MAP[globalName]?.fields ?? {};
  for (const [name, def] of Object.entries(fields)) {
    if ("use_as_thumbnail" in def && (def as InlineFieldDef).use_as_thumbnail) {
      return name;
    }
  }
  return null;
}

/**
 * Describes a related-object filter that a global entry picker should expose
 * as an autocomplete control. Derived from compose_from entries (multi-select)
 * and filterable global ref fields (single-select) declared in workflow.yml.
 */
export interface GlobalPickerFilter {
  /** globalName whose entries to fetch as autocomplete options */
  optionsGlobalName: string;
  /** UI label for the autocomplete */
  label: string;
  /** Multi-select (compose_from) or single-select (FK ref) */
  multiple: boolean;
  /** Query-param key sent to the backend (e.g. 'glaze_type_ids', 'firing_temperature_id') */
  paramKey: string;
  /** Key on the entry response object whose value(s) to render as chips */
  entryKey: string;
}

/**
 * Returns the related-object filters that a picker for the given global should
 * expose, derived entirely from workflow.yml metadata:
 *   - compose_from entries → multi-select filters (paramKey: `${global}_ids`)
 *   - global ref fields with filterable: true → single-select filters (paramKey: `${fieldName}_id`)
 * The ordering is compose_from entries first, then filterable ref fields in
 * declaration order.
 */
export function getGlobalPickerFilters(
  globalName: string,
): GlobalPickerFilter[] {
  const globalDef = GLOBALS_MAP[globalName];
  if (!globalDef) return [];

  const filters: GlobalPickerFilter[] = [];

  // compose_from entries → multi-select
  for (const [fieldName, entry] of Object.entries(
    globalDef.compose_from ?? {},
  )) {
    filters.push({
      optionsGlobalName: entry.global,
      label: entry.filter_label ?? formatWorkflowFieldLabel(fieldName),
      multiple: true,
      paramKey: `${entry.global}_ids`,
      entryKey: fieldName,
    });
  }

  // global ref fields with filterable: true → single-select
  for (const [fieldName, def] of Object.entries(globalDef.fields ?? {})) {
    if (!isGlobalRefField(def) || !(def as GlobalRefFieldDef).filterable)
      continue;
    const [refGlobalName] = parseGlobalRef(def);
    if (!refGlobalName) continue;
    filters.push({
      optionsGlobalName: refGlobalName,
      label: formatWorkflowFieldLabel(fieldName),
      multiple: false,
      paramKey: `${fieldName}_id`,
      entryKey: fieldName,
    });
  }

  return filters;
}

/**
 * Returns true if the global declares favoritable: true — i.e. it supports
 * per-user favorites via POST/DELETE /api/globals/<name>/<pk>/favorite/.
 * Mirrors the backend's `is_favoritable_global` helper.
 */
export function isFavoritableGlobal(globalName: string): boolean {
  return !!(GLOBALS_MAP[globalName] as WorkflowGlobalDefinition | undefined)
    ?.favoritable;
}

/**
 * Returns true if the global declares taggable: true — i.e. it supports ordered
 * tag assignments using the shared Tag global and a generated join model.
 * Mirrors the backend's `is_taggable_global` helper.
 */
export function isTaggableGlobal(globalName: string): boolean {
  return !!(GLOBALS_MAP[globalName] as WorkflowGlobalDefinition | undefined)
    ?.taggable;
}

/**
 * Returns the display field name for a globals entry — `'name'` if declared,
 * otherwise the first declared field. Used by the global-entry creation dialog
 * to determine which field to write when creating a new simple instance.
 * Mirrors the backend's `get_global_model_and_field` logic.
 */
export function getGlobalDisplayField(globalName: string): string {
  const fields = GLOBALS_MAP[globalName]?.fields ?? {};
  return "name" in fields ? "name" : (Object.keys(fields)[0] ?? "name");
}

/**
 * Returns the fully resolved custom field definitions for a given state,
 * ready for rendering in a form. Each entry has its type, label metadata,
 * required flag, and — for global refs — the global name and whether inline
 * creation is permitted. Used by `WorkflowState` to render per-state form
 * fields without hardcoding any state-specific logic in the component.
 */
export function getCustomFieldDefinitions(
  stateId: string,
): ResolvedCustomField[] {
  const state = STATE_MAP.get(stateId);
  if (!state) {
    return [];
  }
  const fields = state.fields ?? {};
  return Object.entries(fields).map(([name, def]) =>
    buildResolvedField(name, def),
  );
}

/**
 * Converts a snake_case DSL field name to a human-readable Title Case label
 * (e.g. `'clay_weight_lbs'` → `'Clay Weight Lbs'`). Used wherever
 * additional field names are shown in the UI.
 */
export function formatWorkflowFieldLabel(fieldName: string): string {
  return toTitleWords(fieldName);
}

/**
 * Converts a state ID into the current/upcoming display label (e.g. "Glazing").
 * State labels are required in workflow.yml; this helper intentionally does not
 * synthesize a fallback label from the state ID.
 */
export function formatState(stateId: string): string {
  return STATE_MAP.get(stateId)?.friendly_name ?? "";
}

/**
 * Converts a state ID into the past-tense display label used in history views
 * (e.g. "Glazed"). State labels are required in workflow.yml; this helper
 * intentionally does not synthesize a fallback label from the state ID.
 */
export function formatPastState(stateId: string): string {
  return STATE_MAP.get(stateId)?.past_friendly_name ?? "";
}

export function getStateDescription(stateId: string): string {
  return STATE_MAP.get(stateId)?.description ?? "";
}

export function isTerminalState(stateId: string): boolean {
  return !!STATE_MAP.get(stateId)?.terminal;
}

export function getStateMetadata(
  stateId: string,
): WorkflowStateMetadata | null {
  const state = STATE_MAP.get(stateId);
  if (!state) {
    return null;
  }
  return {
    id: state.id,
    friendlyName: state.friendly_name,
    pastFriendlyName: state.past_friendly_name,
    description: state.description,
    isTerminal: !!state.terminal,
  };
}

export function getStateSummaryDefinition(
  stateId: string,
): WorkflowSummarySection[] {
  const summary = STATE_MAP.get(stateId)?.summary;
  if (!summary) {
    return [];
  }
  return summary.sections.map((section) => ({
    title: section.title,
    fields: section.fields
      .map((item) => buildSummaryItem(item))
      .filter((item): item is WorkflowSummaryItem => item !== null),
  }));
}

function isStateRefField(def: FieldDefinition): boolean {
  return "$ref" in def && !def.$ref.startsWith("@");
}

function buildResolvedField(
  name: string,
  fieldDef: FieldDefinition,
): ResolvedCustomField {
  const inline = resolveInlineField(fieldDef);
  const isDirectGlobalRef = isGlobalRefField(fieldDef);
  const stateRef = isStateRefField(fieldDef);
  const isCalculated = "compute" in fieldDef;

  // A state ref that ultimately chains to a global ref should render as an
  // editable global-entry picker rather than a disabled plain text field.
  const resolvedGlobal = isDirectGlobalRef
    ? (fieldDef as GlobalRefFieldDef)
    : stateRef
      ? resolveStateRefToGlobalRef(fieldDef, new Set())
      : null;
  const globalRef = resolvedGlobal !== null;
  const [globalName, globalField] = globalRef
    ? parseGlobalRef(resolvedGlobal!)
    : [undefined, undefined];

  const calc = isCalculated ? (fieldDef as CalculatedFieldDef) : undefined;

  return {
    name,
    label: fieldDef.label ?? inline.label ?? formatWorkflowFieldLabel(name),
    type: inline.type,
    description: fieldDef.description ?? inline.description,
    required: (fieldDef as InlineFieldDef).required ?? inline.required ?? false,
    enum: inline.enum,
    isGlobalRef: globalRef,
    isStateRef: stateRef && !globalRef,
    isCalculated,
    canCreate: globalRef
      ? ((fieldDef as GlobalRefFieldDef).can_create ?? false)
      : undefined,
    globalName,
    globalField,
    unit: calc?.unit,
    decimals: calc?.decimals,
    displayAs:
      (fieldDef as CalculatedFieldDef).display_as ??
      (fieldDef as StateRefFieldDef).display_as ??
      inline.display_as,
  };
}

function resolveStateRefToGlobalRef(
  fieldDef: FieldDefinition,
  seen: Set<string>,
): GlobalRefFieldDef | null {
  if (!isStateRefField(fieldDef)) return null;
  const ref = (fieldDef as StateRefFieldDef).$ref;
  if (seen.has(ref)) return null;
  const [stateId, fieldName] = ref.split(".", 2);
  if (!stateId || !fieldName) return null;
  const target = STATE_MAP.get(stateId)?.fields?.[fieldName];
  if (!target) return null;
  if (isGlobalRefField(target)) return target;
  return resolveStateRefToGlobalRef(target, new Set([...seen, ref]));
}

function resolveInlineField(
  fieldDef: FieldDefinition,
  seen = new Set<string>(),
): InlineFieldDef {
  if ("type" in fieldDef) {
    return fieldDef;
  }

  if ("compute" in fieldDef) {
    const type = resolveASTType(fieldDef.compute, seen);
    return { type, display_as: (fieldDef as CalculatedFieldDef).display_as };
  }

  const ref = fieldDef.$ref;
  if (seen.has(ref)) {
    return { type: "string" };
  }
  const nextSeen = new Set(seen);
  nextSeen.add(ref);

  if (ref.startsWith("@")) {
    const [globalName, fieldName] = ref.slice(1).split(".", 2);
    if (!globalName || !fieldName) {
      return { type: "string" };
    }
    const globalDef = GLOBALS_MAP[globalName];
    const target = globalDef?.fields?.[fieldName];
    if (!target) {
      return { type: "string" };
    }
    return resolveInlineField(target, nextSeen);
  }

  const [stateId, fieldName] = ref.split(".", 2);
  if (!stateId || !fieldName) {
    return { type: "string" };
  }
  const state = STATE_MAP.get(stateId);
  const target = state?.fields?.[fieldName];
  if (!target) {
    return { type: "string" };
  }
  return resolveInlineField(target, nextSeen);
}

function resolveASTType(node: WorkflowASTNode, seen: Set<string>): FieldType {
  if ("op" in node) {
    if (["sum", "product", "difference", "ratio"].includes(node.op)) {
      return "number";
    }
    return "string";
  }
  if ("constant" in node) {
    if (typeof node.constant === "number") return "number";
    if (typeof node.constant === "boolean") return "boolean";
    return "string";
  }
  if ("field" in node) {
    const [stateId, fieldName] = node.field.split(".", 2);
    const target = STATE_MAP.get(stateId)?.fields?.[fieldName];
    if (!target) return "string";
    return resolveInlineField(target, seen).type;
  }
  return "string";
}

function isGlobalRefField(def: FieldDefinition): def is GlobalRefFieldDef {
  return "$ref" in def && def.$ref.startsWith("@");
}

function parseGlobalRef(
  def: FieldDefinition,
): [string | undefined, string | undefined] {
  if (!isGlobalRefField(def)) {
    return [undefined, undefined];
  }
  const [globalName, fieldName] = def.$ref.slice(1).split(".", 2);
  if (!globalName || !fieldName) {
    return [undefined, undefined];
  }
  return [globalName, fieldName];
}

function buildSummaryItem(
  item: WorkflowSummaryItemDefinition,
): WorkflowSummaryItem | null {
  if (item.value) {
    const resolved = resolveStateFieldRef(item.value);
    if (!resolved) {
      return null;
    }
    return {
      kind: "value",
      label: item.label ?? resolved.field.label,
      description: item.description ?? resolved.field.description,
      ref: item.value,
      stateId: resolved.stateId,
      fieldName: resolved.fieldName,
      field: resolved.field,
      when: item.when,
    };
  }
  if (item.text !== undefined) {
    return {
      kind: "text",
      label: item.label ?? "",
      description: item.description,
      text: item.text,
      when: item.when,
    };
  }
  if (item.compute) {
    return {
      kind: "compute",
      label: item.label ?? formatWorkflowFieldLabel(item.compute.op),
      description: item.description,
      compute: item.compute,
      when: item.when,
    };
  }
  return null;
}

function resolveStateFieldRef(
  ref: string,
): { stateId: string; fieldName: string; field: ResolvedCustomField } | null {
  const [stateId, fieldName] = ref.split(".", 2);
  if (!stateId || !fieldName) {
    return null;
  }
  const state = STATE_MAP.get(stateId);
  const fieldDef = state?.fields?.[fieldName];
  if (!fieldDef) {
    return null;
  }
  return {
    stateId,
    fieldName,
    field: buildResolvedField(fieldName, fieldDef),
  };
}
