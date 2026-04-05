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

interface WorkflowGlobalDefinition {
    model: string
    description?: string
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
    canCreate?: boolean
    globalName?: string
    globalField?: string
}

export function getAdditionalFieldDefinitions(stateId: string): ResolvedAdditionalField[] {
    const state = STATE_MAP.get(stateId)
    if (!state) {
        return []
    }
    const fields = state.additional_fields ?? {}
    return Object.entries(fields).map(([name, def]) => buildResolvedField(name, def))
}

export function formatWorkflowFieldLabel(fieldName: string): string {
    return fieldName
        .split('_')
        .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
        .join(' ')
}

function buildResolvedField(name: string, fieldDef: FieldDefinition): ResolvedAdditionalField {
    const inline = resolveInlineField(fieldDef)
    const globalRef = isGlobalRefField(fieldDef)
    const [globalName, globalField] = globalRef ? parseGlobalRef(fieldDef) : [undefined, undefined]
    return {
        name,
        type: inline.type,
        description: fieldDef.description ?? inline.description,
        required: fieldDef.required ?? inline.required ?? false,
        enum: inline.enum,
        isGlobalRef: globalRef,
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
