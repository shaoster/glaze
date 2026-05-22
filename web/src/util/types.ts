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
  components["schemas"]["PieceSummary"]["current_state"],
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
export type GlazeCombinationImagePiece = Override<
  components["schemas"]["GlazeCombinationImagePiece"],
  {
    state: State;
    images: CaptionedImage[];
  }
>;

export type GlazeCombinationImageEntry = Override<
  components["schemas"]["GlazeCombinationImageEntry"],
  { pieces: GlazeCombinationImagePiece[] }
>;

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

export type CropRunSource = components["schemas"]["CropRunSource"];

export type CropRun = Override<
  components["schemas"]["CropRun"],
  {
    source: CropRunSource;
    crop: ImageCrop | null;
  }
>;
