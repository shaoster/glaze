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
// state: string → state: State, handled by the domain override helper below.
// Piece domain types stay close to the generated schemas and replace only the
// fields we intentionally narrow.
// ---------------------------------------------------------------------------

type Override<T, R> = {
  [K in keyof T as K extends keyof R ? never : K]: T[K];
} & R;

// CaptionedImage narrows JSONField-backed crop to the normalized crop shape.
export type CaptionedImage = Override<
  components["schemas"]["CaptionedImage"],
  { crop?: ImageCrop | null }
>;

// Thumbnail stored on a Piece. Distinct from CaptionedImage — no caption field.
export type Thumbnail = Override<
  components["schemas"]["Thumbnail"],
  { crop?: ImageCrop | null }
>;

// Minimal state shape returned in list responses.
// Intersection narrows state: string → state: State.
// PieceState is a structural subtype, so it can substitute for StateSummary.
export type StateSummary = Override<
  components["schemas"]["StateSummary"],
  { state: State }
>;

// Piece list entry. Replace the generated broad fields with domain-specific types.
export type PieceSummary = Override<
  components["schemas"]["PieceSummary"],
  {
    current_state: StateSummary;
    thumbnail: Thumbnail | null;
  }
>;

// Full state record returned in detail responses.
export type PieceState = Override<
  components["schemas"]["PieceState"],
  {
    state: State;
  }
>;

// Piece detail. Build on the narrowed list shape so nested state stays aligned.
export type PieceDetail = Override<PieceSummary, {
  current_state: PieceState;
  history: PieceState[];
}>;


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

export interface JSONSchemaProperty {
  type: string;
  enum?: string[];
  anyOf?: JSONSchemaProperty[];
  "x-label"?: string;
  "x-description"?: string;
  "x-display-as"?: string;
  "x-required"?: boolean;
  "x-global-ref"?: string;
  "x-state-ref"?: boolean;
  "x-can-create"?: boolean;
  "x-read-only"?: boolean;
  [key: string]: unknown;
}

export interface UISchema {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export type CropRunSource = {
  type: "automated" | "human";
  backend: string | null;
  deployment: string | null;
  version: string | null;
};

export type CropRun = {
  id: string;
  piece_state_image_id: number | null;
  source: CropRunSource;
  crop: ImageCrop | null;
  status: "success" | "no_subject" | "error";
  created: Date;
};
