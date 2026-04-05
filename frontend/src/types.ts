import type { components } from './generated-types'
import workflow from '../../workflow.yml'

type WorkflowState = { id: string; visible: boolean; successors?: string[]; terminal?: boolean }

// Runtime constants derived from workflow.json.
// STATES preserves lifecycle order; SUCCESSORS encodes the transition graph.
// Neither is expressed in the OpenAPI schema, so they stay anchored to workflow.json.
export const STATES = (workflow.states as WorkflowState[]).map(({ id }) => id)
export const SUCCESSORS: Record<string, string[]> = Object.fromEntries(
    (workflow.states as WorkflowState[]).map(({ id, successors }) => [id, successors ?? []])
)

// State type from the generated schema — stays in sync with backend validation.
export type State = components['schemas']['StateEnum']

// ---------------------------------------------------------------------------
// Domain types
//
// Date fields are already Date in generated-types (via the date-time transform
// in scripts/generate-types.mjs). The only remaining narrowing needed is
// state: string → state: State, handled via intersection (string & State = State).
// No Omit<> is required anywhere in this file.
// ---------------------------------------------------------------------------

// CaptionedImage is correct as-is — direct re-export.
export type CaptionedImage = components['schemas']['CaptionedImage']

// Minimal state shape returned in list responses.
// Intersection narrows state: string → state: State.
// PieceState is a structural subtype, so it can substitute for StateSummary.
export type StateSummary = components['schemas']['StateSummary'] & { state: State }

// Full state record returned in detail responses.
// Intersection narrows state: string → state: State.
export type PieceState = components['schemas']['PieceState'] & { state: State }

// Piece list entry. Intersection narrows current_state to use our typed StateSummary.
export type PieceSummary = components['schemas']['PieceSummary'] & { current_state: StateSummary }

// Piece detail. Intersection narrows current_state to PieceState (subtype of StateSummary)
// and adds the history array. No Omit needed — PieceState satisfies StateSummary structurally.
export type PieceDetail = PieceSummary & {
    current_state: PieceState
    history: PieceState[]
}

export type Location = string

// Convert a snake_case state id to a human-readable label.
// e.g. "wheel_thrown" → "Wheel Thrown", "designed" → "Designed"
export function formatState(state: string): string {
    return state.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
