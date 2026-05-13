import type { components } from "./generated-types";

// State type from the generated schema — stays in sync with backend validation.
export type State = components["schemas"]["StateEnum"];

export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// ---------------------------------------------------------------------------
// Domain types
//
// Date fields are already Date in generated-types (via the date-time transform
// in scripts/generate-types.mjs). The only remaining narrowing needed is
// state: string → state: State, handled via intersection (string & State = State).
// No Omit<> is required anywhere in this file.
// ---------------------------------------------------------------------------

// CaptionedImage narrows JSONField-backed crop to the normalized crop shape.
export type CaptionedImage = Omit<
  components["schemas"]["CaptionedImage"],
  "crop"
> & {
  crop?: ImageCrop | null;
};

// Thumbnail stored on a Piece. Distinct from CaptionedImage — no caption field.
export type Thumbnail = Omit<components["schemas"]["Thumbnail"], "crop"> & {
  crop?: ImageCrop | null;
};

// Minimal state shape returned in list responses.
// Intersection narrows state: string → state: State.
// PieceState is a structural subtype, so it can substitute for StateSummary.
export type StateSummary = components["schemas"]["StateSummary"] & {
  state: State;
};

// Full state record returned in detail responses.
// Intersection narrows state: string → state: State.
export type PieceState = Omit<components["schemas"]["PieceState"], "images"> & {
  id: string;
  state: State;
  images: CaptionedImage[];
  custom_fields: Record<string, unknown>;
  has_been_edited: boolean;
};

// Piece list entry. Intersection narrows current_state to use our typed StateSummary.
export type PieceSummary = Omit<
  components["schemas"]["PieceSummary"],
  "current_state" | "thumbnail" | "showcase_fields"
> & {
  current_state: StateSummary;
  thumbnail: Thumbnail | null;
  shared: boolean;
  is_editable: boolean;
  can_edit: boolean;
  tags: TagEntry[];
  showcase_fields: string[];
};

// Piece detail. Intersection narrows current_state to PieceState (subtype of StateSummary)
// and adds the history array. No Omit needed — PieceState satisfies StateSummary structurally.
export type PieceDetail = PieceSummary & {
  current_state: PieceState;
  history: PieceState[];
};


// GlazeCombination entry and related types — derived from generated OpenAPI types.
export type GlazeTypeRef = components["schemas"]["GlazeTypeRef"];
export type FiringTemperatureRef =
  components["schemas"]["FiringTemperatureRef"];
export type GlazeCombinationEntry =
  components["schemas"]["GlazeCombinationEntry"];
export type TagEntry = components["schemas"]["TagEntry"];
// Structured image value stored by global model image fields.
export type GlobalImage = components["schemas"]["GlobalImage"];
// ---------------------------------------------------------------------------
// Glaze Combination Gallery — analysis endpoint types
// ---------------------------------------------------------------------------

/** A single piece entry returned by GET /api/analysis/glaze-combination-images/. */
export type GlazeCombinationImagePiece = {
  id: string;
  name: string;
  /** Most recent qualifying state (glazed | glaze_fired | completed) that has images. */
  state: State;
  /** Images aggregated across all qualifying states for this piece. */
  images: CaptionedImage[];
};

/** One entry in the glaze combination image gallery response. */
export type GlazeCombinationImageEntry = {
  glaze_combination: GlazeCombinationEntry;
  pieces: GlazeCombinationImagePiece[];
};

export type AsyncTaskStatus = "pending" | "running" | "success" | "failure";

export interface AsyncTask {
  id: string;
  status: AsyncTaskStatus;
  task_type: string;
  input_params: Record<string, unknown>;
  result: unknown;
  error: string | null;
  created: string;
  last_modified: string;
}
