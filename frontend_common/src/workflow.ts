/**
 * Shared web/mobile interface to the workflow.yml configuration.
 *
 * This module loads workflow.yml at build time and exposes typed helpers that
 * the web and mobile apps use to drive dynamic behavior — field definitions
 * for per-state forms, display labels, and global type metadata. It is the
 * shared-app counterpart to the backend's `_STATE_MAP` / `_GLOBALS_MAP` in
 * `api/models.py`. Neither the state list nor the globals map should be
 * duplicated elsewhere in the apps; derive them from the exports here.
 */
import workflow from '../../workflow.yml'

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'

interface InlineFieldDef {
    type: FieldType
    description?: string
    required?: boolean
    enum?: string[]
}

interface StateRefFieldDef {
    $ref: string
    description?: string
    required?: boolean
}

interface GlobalRefFieldDef {
    $ref: string
    description?: string
    required?: boolean
    can_create?: boolean
}

type FieldDefinition = InlineFieldDef | StateRefFieldDef | GlobalRefFieldDef

interface WorkflowStateDefinition {
    id: string
    visible: boolean
    terminal?: boolean
    successors?: string[]
    additional_fields?: Record<string, FieldDefinition>
}

export interface ComposeFromEntry {
    global: string
}

interface WorkflowGlobalDefinition {
    model: string
    description?: string
    compose_from?: Record<string, ComposeFromEntry>
    fields: Record<string, InlineFieldDef | GlobalRefFieldDef>
}

interface WorkflowDefinition {
    version: string
    globals?: Record<string, WorkflowGlobalDefinition>
    states: WorkflowStateDefinition[]
}

// The workflow.yml is expected to be well-formed and is controlled by us and 
// validated by tests/test_workflow.py, so we can be a bit loose with this cast.
const workflowDef = workflow as unknown as WorkflowDefinition
const STATE_MAP = new Map<string, WorkflowStateDefinition>(
    workflowDef.states.map((state) => [state.id, state])
)
const GLOBALS_MAP = workflowDef.globals ?? {}

export type ResolvedAdditionalField = {
    name: string
    type: FieldType
    description?: string
    required: boolean
    enum?: string[]
    isGlobalRef: boolean
    isStateRef: boolean
    canCreate?: boolean
    globalName?: string
    globalField?: string
}

/**
 * Returns the compose_from map for the given global, if declared. Each entry
 * maps an M2M field name on the model to the global type it references.
 * Used by the frontend to identify globals that support ordered composition
 * (e.g. GlazeCombination, composed from an ordered list of GlazeTypes) and to
 * dispatch to the appropriate composition picker UI instead of a plain FK selector.
 */
export function getGlobalComposeFrom(globalName: string): Record<string, ComposeFromEntry> | undefined {
    return GLOBALS_MAP[globalName]?.compose_from
}

/**
 * Returns the display field name for a globals entry — `'name'` if declared,
 * otherwise the first declared field. Used by `GlobalFieldPicker` to determine
 * which field to write when creating a new instance via `createGlobalEntry`.
 * Mirrors the backend's `get_global_model_and_field` logic.
 */
export function getGlobalDisplayField(globalName: string): string {
    const fields = GLOBALS_MAP[globalName]?.fields ?? {}
    return 'name' in fields ? 'name' : (Object.keys(fields)[0] ?? 'name')
}

/**
 * Returns the fully resolved additional field definitions for a given state,
 * ready for rendering in a form. Each entry has its type, label metadata,
 * required flag, and — for global refs — the global name and whether inline
 * creation is permitted. Used by `WorkflowState` to render per-state form
 * fields without hardcoding any state-specific logic in the component.
 */
export function getAdditionalFieldDefinitions(stateId: string): ResolvedAdditionalField[] {
    const state = STATE_MAP.get(stateId)
    if (!state) {
        return []
    }
    const fields = state.additional_fields ?? {}
    return Object.entries(fields).map(([name, def]) => buildResolvedField(name, def))
}

/**
 * Converts a snake_case DSL field name to a human-readable Title Case label
 * (e.g. `'clay_weight_grams'` → `'Clay Weight Grams'`). Used wherever
 * additional field names are shown in the UI.
 */
export function formatWorkflowFieldLabel(fieldName: string): string {
    return fieldName
        .split('_')
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
        .join(' ')
}

function isStateRefField(def: FieldDefinition): boolean {
    return '$ref' in def && !def.$ref.startsWith('@')
}

function buildResolvedField(name: string, fieldDef: FieldDefinition): ResolvedAdditionalField {
    const inline = resolveInlineField(fieldDef)
    const globalRef = isGlobalRefField(fieldDef)
    const stateRef = isStateRefField(fieldDef)
    const [globalName, globalField] = globalRef ? parseGlobalRef(fieldDef) : [undefined, undefined]
    return {
        name,
        type: inline.type,
        description: fieldDef.description ?? inline.description,
        required: fieldDef.required ?? inline.required ?? false,
        enum: inline.enum,
        isGlobalRef: globalRef,
        isStateRef: stateRef,
        canCreate: globalRef ? (fieldDef.can_create ?? false) : undefined,
        globalName,
        globalField,
    }
}

function resolveInlineField(fieldDef: FieldDefinition, seen = new Set<string>()): InlineFieldDef {
    if ('type' in fieldDef) {
        return fieldDef
    }

    const ref = fieldDef.$ref
    if (seen.has(ref)) {
        return { type: 'string' }
    }
    const nextSeen = new Set(seen)
    nextSeen.add(ref)

    if (ref.startsWith('@')) {
        const [globalName, fieldName] = ref.slice(1).split('.', 2)
        if (!globalName || !fieldName) {
            return { type: 'string' }
        }
        const globalDef = GLOBALS_MAP[globalName]
        const target = globalDef?.fields?.[fieldName]
        if (!target) {
            return { type: 'string' }
        }
        return resolveInlineField(target, nextSeen)
    }

    const [stateId, fieldName] = ref.split('.', 2)
    if (!stateId || !fieldName) {
        return { type: 'string' }
    }
    const state = STATE_MAP.get(stateId)
    const target = state?.additional_fields?.[fieldName]
    if (!target) {
        return { type: 'string' }
    }
    return resolveInlineField(target, nextSeen)
}

function isGlobalRefField(def: FieldDefinition): def is GlobalRefFieldDef {
    return '$ref' in def && def.$ref.startsWith('@')
}

function parseGlobalRef(def: FieldDefinition): [string | undefined, string | undefined] {
    if (!isGlobalRefField(def)) {
        return [undefined, undefined]
    }
    const [globalName, fieldName] = def.$ref.slice(1).split('.', 2)
    if (!globalName || !fieldName) {
        return [undefined, undefined]
    }
    return [globalName, fieldName]
}
