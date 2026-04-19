/**
 * Registry mapping global type names to custom field UI overrides.
 *
 * WorkflowState looks up this registry for each global ref field and applies
 * the registered config if present. Add an entry here instead of adding a new
 * per-type branch inside WorkflowState.
 *
 * Connections:
 *   - #81: once filterable fields are declared in workflow.yml, the registry
 *     could be derived from workflow metadata rather than hardcoded.
 *   - #83: with a generic GlobalEntryPicker, any filterable global type may
 *     just need `showBrowse: true` and no per-type code at all.
 */

export interface GlobalFieldOverride {
    /** Show a Browse button that opens GlobalEntryPicker for this global type. */
    showBrowse: boolean
}

const GLOBAL_FIELD_REGISTRY: Record<string, GlobalFieldOverride> = {
    glaze_combination: { showBrowse: true },
}

export function getGlobalFieldOverride(globalName: string): GlobalFieldOverride | undefined {
    return GLOBAL_FIELD_REGISTRY[globalName]
}
