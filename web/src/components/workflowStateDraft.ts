import type { ImageCrop, PieceState } from "../util/types";
import {
  type ResolvedCustomField,
  getCustomFieldDefinitions,
} from "../util/workflow";

export type ImageEntry = {
  url: string;
  caption: string;
  cloudinary_public_id?: string | null;
  cloud_name?: string | null;
  crop?: ImageCrop | null;
};

type CustomFieldInputMap = Record<string, string>;
type GlobalRefPkMap = Record<string, string>;

export type DraftState = {
  baseState: PieceState;
  notes: string;
  images: ImageEntry[];
  customFieldInputs: CustomFieldInputMap;
  globalRefPks: GlobalRefPkMap;
};

export type DraftAction =
  | { type: "replace_base_state"; pieceState: PieceState }
  | { type: "set_notes"; notes: string }
  | { type: "set_custom_field"; name: string; value: string }
  | { type: "set_global_ref_pks"; globalRefPks: GlobalRefPkMap };

function assertNever(value: never): never {
  throw new Error(`Unhandled DraftAction: ${JSON.stringify(value)}`);
}

function formatCustomFieldValue(
  value: unknown,
  type: ResolvedCustomField["type"],
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

export function buildCustomFieldInputMap(
  defs: ResolvedCustomField[],
  values: Record<string, unknown>,
): CustomFieldInputMap {
  const map: CustomFieldInputMap = {};
  defs.forEach((def) => {
    map[def.name] = formatCustomFieldValue(values[def.name], def.type);
  });
  return map;
}

export function buildGlobalRefPkMap(
  defs: ResolvedCustomField[],
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

export function normalizeCustomFieldPayload(
  defs: ResolvedCustomField[],
  inputs: CustomFieldInputMap,
  globalRefPks: GlobalRefPkMap,
): Record<string, string | number | boolean | null> {
  const payload: Record<string, string | number | boolean | null> = {};
  defs.forEach((def) => {
    if (def.isCalculated) {
      return;
    }
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
    crop: img.crop ?? null,
  }));
}

export function buildDraftState(pieceState: PieceState): DraftState {
  const customFieldDefs = getCustomFieldDefinitions(pieceState.state);
  const customFields = pieceState.custom_fields;
  return {
    baseState: pieceState,
    notes: pieceState.notes,
    images: stateImages(pieceState),
    customFieldInputs: buildCustomFieldInputMap(
      customFieldDefs,
      customFields,
    ),
    globalRefPks: buildGlobalRefPkMap(customFieldDefs, customFields),
  };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "replace_base_state":
      return buildDraftState(action.pieceState);
    case "set_notes":
      return { ...state, notes: action.notes };
    case "set_custom_field":
      return {
        ...state,
        customFieldInputs: {
          ...state.customFieldInputs,
          [action.name]: action.value,
        },
      };
    case "set_global_ref_pks":
      return { ...state, globalRefPks: action.globalRefPks };
    default:
      return assertNever(action);
  }
}
