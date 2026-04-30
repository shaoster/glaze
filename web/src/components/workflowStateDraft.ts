import type { PieceState } from "../util/types";
import {
  type ResolvedAdditionalField,
  getAdditionalFieldDefinitions,
} from "../util/workflow";

export type ImageEntry = {
  url: string;
  caption: string;
  cloudinary_public_id?: string | null;
  cloud_name?: string | null;
};

type AdditionalFieldInputMap = Record<string, string>;
type GlobalRefPkMap = Record<string, string>;

export type DraftState = {
  baseState: PieceState;
  notes: string;
  images: ImageEntry[];
  additionalFieldInputs: AdditionalFieldInputMap;
  globalRefPks: GlobalRefPkMap;
};

export type DraftAction =
  | { type: "replace_base_state"; pieceState: PieceState }
  | { type: "set_notes"; notes: string }
  | { type: "set_additional_field"; name: string; value: string }
  | { type: "set_global_ref_pks"; globalRefPks: GlobalRefPkMap };

function assertNever(value: never): never {
  throw new Error(`Unhandled DraftAction: ${JSON.stringify(value)}`);
}

function formatAdditionalFieldValue(
  value: unknown,
  type: ResolvedAdditionalField["type"],
): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") {
      return obj.name;
    }
    return "";
  }
  if (type === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function extractGlobalRefPk(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

export function buildAdditionalFieldInputMap(
  defs: ResolvedAdditionalField[],
  values: Record<string, unknown>,
): AdditionalFieldInputMap {
  const map: AdditionalFieldInputMap = {};
  defs.forEach((def) => {
    map[def.name] = formatAdditionalFieldValue(values[def.name], def.type);
  });
  return map;
}

export function buildGlobalRefPkMap(
  defs: ResolvedAdditionalField[],
  values: Record<string, unknown>,
): GlobalRefPkMap {
  const map: GlobalRefPkMap = {};
  defs.forEach((def) => {
    if (def.isGlobalRef) {
      const pk = extractGlobalRefPk(values[def.name]);
      if (pk) map[def.name] = pk;
    }
  });
  return map;
}

export function normalizeAdditionalFieldPayload(
  defs: ResolvedAdditionalField[],
  inputs: AdditionalFieldInputMap,
  globalRefPks: GlobalRefPkMap,
): Record<string, string | number | boolean | null> {
  const payload: Record<string, string | number | boolean | null> = {};
  defs.forEach((def) => {
    if (def.isGlobalRef) {
      const pk = globalRefPks[def.name];
      payload[def.name] = pk || null;
      return;
    }
    // buildDraftState populates every known field name, but this helper is
    // exported and can still be called with a sparse runtime map.
    const raw = inputs[def.name] ?? "";
    const trimmed = raw.trim();
    if (trimmed === "") {
      return;
    }
    if (def.type === "integer") {
      const parsed = parseInt(trimmed, 10);
      if (!Number.isNaN(parsed)) {
        payload[def.name] = parsed;
      }
      return;
    }
    if (def.type === "number") {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed)) {
        payload[def.name] = parsed;
      }
      return;
    }
    if (def.type === "boolean") {
      if (trimmed === "true") {
        payload[def.name] = true;
      } else if (trimmed === "false") {
        payload[def.name] = false;
      }
      return;
    }
    payload[def.name] = raw;
  });
  return payload;
}

function stateImages(pieceState: PieceState): ImageEntry[] {
  return pieceState.images.map((img) => ({
    url: img.url,
    caption: img.caption,
    cloudinary_public_id: img.cloudinary_public_id ?? null,
    cloud_name: img.cloud_name ?? null,
  }));
}

export function buildDraftState(pieceState: PieceState): DraftState {
  const additionalFieldDefs = getAdditionalFieldDefinitions(pieceState.state);
  const additionalFields = pieceState.additional_fields;
  return {
    baseState: pieceState,
    notes: pieceState.notes,
    images: stateImages(pieceState),
    additionalFieldInputs: buildAdditionalFieldInputMap(
      additionalFieldDefs,
      additionalFields,
    ),
    globalRefPks: buildGlobalRefPkMap(additionalFieldDefs, additionalFields),
  };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "replace_base_state":
      return buildDraftState(action.pieceState);
    case "set_notes":
      return { ...state, notes: action.notes };
    case "set_additional_field":
      return {
        ...state,
        additionalFieldInputs: {
          ...state.additionalFieldInputs,
          [action.name]: action.value,
        },
      };
    case "set_global_ref_pks":
      return { ...state, globalRefPks: action.globalRefPks };
    default:
      return assertNever(action);
  }
}
