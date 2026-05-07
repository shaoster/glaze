/**
 * Single point of contact between components and the backend API.
 *
 * All HTTP requests must go through the exported functions here — components
 * must never call Axios directly or construct URLs themselves. This module is
 * also the only place where wire types (ISO date strings, raw JSON) are
 * converted to domain types as declared in `types.ts`. Components receive
 * fully-typed domain objects and pass them back through these functions;
 * serialization and deserialization happen here and nowhere else.
 *
 * The `Wire<T>` generic models the raw Axios response shape: fields declared
 * as `Date` in domain types arrive as `string` over the wire. Mappers convert
 * `Wire<T>` → `T` using `new Date()` and state casts before the data leaves
 * this module.
 */
import axios from "axios";
import type {
  CaptionedImage,
  FiringTemperatureRef,
  GlazeCombinationEntry,
  GlazeCombinationImageEntry,
  GlazeTypeRef,
  PieceDetail,
  PieceSummary,
  PieceState,
  State,
  StateSummary,
  TagEntry,
  Thumbnail,
  ImageCrop,
} from "./types";

export type AuthUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  openid_subject: string;
  profile_image_url: string;
};

const client = axios.create({ baseURL: "/api/" });
client.defaults.withCredentials = true;
client.defaults.xsrfCookieName = "csrftoken";
client.defaults.xsrfHeaderName = "X-CSRFToken";
const expoBaseUrl = (
  globalThis as { process?: { env?: Record<string, string | undefined> } }
).process?.env?.EXPO_PUBLIC_API_BASE_URL;
if (expoBaseUrl) {
  client.defaults.baseURL = expoBaseUrl;
}

export type CloudinaryWidgetConfig = {
  cloud_name: string;
  api_key: string;
  folder?: string;
  upload_preset?: string;
};

// ---------------------------------------------------------------------------
// Wire<T> — converts domain types back to the raw format Axios delivers.
// The generated types declare dates as Date (via the date-time transform),
// but JSON deserialization delivers strings. Wire<T> models that reality:
//   Date        →  string
//   T[]         →  Wire<T>[]
//   nested obj  →  Wire<nested obj>
//   everything else unchanged
// ---------------------------------------------------------------------------
type Wire<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends (infer U)[]
      ? Wire<U>[]
      : T[K] extends object
        ? Wire<T[K]>
        : T[K];
};

// ---------------------------------------------------------------------------
// Mappers: wire → domain
// ---------------------------------------------------------------------------

function mapImage(raw: Wire<CaptionedImage>): CaptionedImage {
  return {
    url: raw.url,
    caption: raw.caption,
    created: new Date(raw.created ?? ""),
    cloudinary_public_id: raw.cloudinary_public_id ?? null,
    cloud_name: raw.cloud_name ?? null,
    crop: normalizeCrop(raw.crop),
  };
}

function normalizeCrop(value: unknown): ImageCrop | null {
  if (!value || typeof value !== "object") return null;
  const crop = value as Partial<Record<keyof ImageCrop, unknown>>;
  const x = Number(crop.x);
  const y = Number(crop.y);
  const width = Number(crop.width);
  const height = Number(crop.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.min(Math.max(x, 0), 1),
    y: Math.min(Math.max(y, 0), 1),
    width: Math.min(Math.max(width, 0), 1),
    height: Math.min(Math.max(height, 0), 1),
  };
}


function mapStateSummary(raw: Wire<StateSummary>): StateSummary {
  return { state: raw.state as State };
}

function mapTagEntry(raw: Wire<TagEntry>): TagEntry {
  return {
    id: raw.id,
    name: raw.name,
    color: raw.color ?? "",
    is_public: raw.is_public,
  };
}

function mapPieceState(raw: Wire<PieceState>): PieceState {
  return {
    state: raw.state as State,
    notes: raw.notes,
    created: new Date(raw.created ?? ""),
    last_modified: new Date(raw.last_modified ?? ""),
    images: raw.images.map(mapImage),
    previous_state: raw.previous_state as State | null,
    next_state: raw.next_state as State | null,
    custom_fields: raw.custom_fields ?? {},
  };
}

function mapPieceSummary(raw: Wire<PieceSummary>): PieceSummary {
  return {
    id: raw.id,
    name: raw.name,
    created: new Date(raw.created ?? ""),
    last_modified: new Date(raw.last_modified ?? ""),
    thumbnail: raw.thumbnail as Thumbnail | null,
    shared: raw.shared ?? false,
    can_edit: raw.can_edit ?? true,
    current_state: mapStateSummary(raw.current_state),
    current_location: raw.current_location ?? "",
    tags: (raw.tags ?? []).map(mapTagEntry),
  };
}

function mapPieceDetail(raw: Wire<PieceDetail>): PieceDetail {
  return {
    ...mapPieceSummary(raw),
    current_state: mapPieceState(raw.current_state),
    history: raw.history.map(mapPieceState),
  };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export type PieceSortOrder =
  | "last_modified"
  | "-last_modified"
  | "name"
  | "-name"
  | "created"
  | "-created";

export type PiecePage = { count: number; results: PieceSummary[] };

export const PIECE_SORT_OPTIONS: { value: PieceSortOrder; label: string }[] = [
  { value: "-last_modified", label: "Recently Modified" },
  { value: "last_modified", label: "Oldest Modified" },
  { value: "-created", label: "Newest First" },
  { value: "created", label: "Oldest First" },
  { value: "name", label: "Name A → Z" },
  { value: "-name", label: "Name Z → A" },
];

export const DEFAULT_PIECE_SORT: PieceSortOrder = "-last_modified";
export const PIECES_PAGE_SIZE = 24;

export async function fetchPieces(params?: {
  ordering?: PieceSortOrder;
  limit?: number;
  offset?: number;
}): Promise<PiecePage> {
  const { data } = await client.get<{
    count: number;
    results: Wire<PieceSummary>[];
  }>("pieces/", { params });
  return { count: data.count, results: data.results.map(mapPieceSummary) };
}

export async function ensureCsrfCookie(): Promise<void> {
  await client.get("auth/csrf/");
}

export async function loginWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  await ensureCsrfCookie();
  const { data } = await client.post<AuthUser>("auth/login/", {
    email,
    password,
  });
  return data;
}

export async function registerWithEmail(payload: {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}): Promise<AuthUser> {
  await ensureCsrfCookie();
  const { data } = await client.post<AuthUser>("auth/register/", payload);
  return data;
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const { data } = await client.get<AuthUser>("auth/me/");
    return data;
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      return null;
    }
    throw error;
  }
}

export async function loginWithGoogle(credential: string): Promise<AuthUser> {
  await ensureCsrfCookie();
  const { data } = await client.post<AuthUser>("auth/google/", { credential });
  return data;
}

export async function logoutUser(): Promise<void> {
  await ensureCsrfCookie();
  await client.post("auth/logout/", {});
}

export async function fetchPiece(id: string): Promise<PieceDetail> {
  const { data } = await client.get<Wire<PieceDetail>>(`pieces/${id}/`);
  return mapPieceDetail(data);
}

export type CreatePiecePayload = {
  name: string;
  thumbnail?: string;
  notes?: string;
  current_location?: string;
};

// New pieces always start in the `designed` state — the backend enforces this.
export async function createPiece(
  payload: CreatePiecePayload,
): Promise<PieceDetail> {
  const { data } = await client.post<Wire<PieceDetail>>("pieces/", payload);
  return mapPieceDetail(data);
}

export type AddStatePayload = {
  state: State;
  notes?: string;
  images?: Wire<CaptionedImage>[];
  custom_fields?: Record<string, string | number | boolean | null>;
};

export async function addPieceState(
  pieceId: string,
  payload: AddStatePayload,
): Promise<PieceDetail> {
  const { data } = await client.post<Wire<PieceDetail>>(
    `pieces/${pieceId}/states/`,
    payload,
  );
  return mapPieceDetail(data);
}

export type UpdateStatePayload = {
  notes?: string;
  images?: Array<{
    url: string;
    caption: string;
    cloudinary_public_id?: string | null;
    cloud_name?: string | null;
    crop?: ImageCrop | null;
  }>;
  custom_fields?: Record<string, string | number | boolean | null>;
};

export async function updateCurrentState(
  pieceId: string,
  payload: UpdateStatePayload,
): Promise<PieceDetail> {
  const { data } = await client.patch<Wire<PieceDetail>>(
    `pieces/${pieceId}/state/`,
    payload,
  );
  return mapPieceDetail(data);
}

export type UpdatePiecePayload = {
  name?: string;
  current_location?: string;
  thumbnail?: Thumbnail | null;
  shared?: boolean;
  tags?: string[];
};

export async function updatePiece(
  pieceId: string,
  payload: UpdatePiecePayload,
): Promise<PieceDetail> {
  const { data } = await client.patch<Wire<PieceDetail>>(
    `pieces/${pieceId}/`,
    payload,
  );
  return mapPieceDetail(data);
}

export interface GlobalEntry {
  id: string;
  name: string;
  isPublic: boolean;
  isFavorite?: boolean;
  color?: string;
}

export async function fetchGlobalEntries(
  globalName: string,
): Promise<GlobalEntry[]> {
  const { data } = await client.get<
    Array<{
      id: string;
      name: string;
      is_public: boolean;
      is_favorite?: boolean;
      color?: string;
    }>
  >(`globals/${globalName}/`);
  return data.map((entry) => ({
    id: entry.id,
    name: entry.name,
    isPublic: entry.is_public,
    ...(entry.color !== undefined ? { color: entry.color } : {}),
    ...(entry.is_favorite !== undefined
      ? { isFavorite: entry.is_favorite }
      : {}),
  }));
}

export type {
  GlazeTypeRef,
  FiringTemperatureRef,
  GlazeCombinationEntry,
  TagEntry,
};

export interface GlazeCombinationFilters {
  glazeTypeIds?: string[];
  isFoodSafe?: boolean;
  runs?: boolean;
  highlightsGrooves?: boolean;
  isDifferentOnWhiteAndBrownClay?: boolean;
  firingTemperatureId?: string;
}

export async function fetchGlazeCombinations(
  filters: GlazeCombinationFilters = {},
): Promise<GlazeCombinationEntry[]> {
  const params: Record<string, string> = {};
  if (filters.glazeTypeIds?.length)
    params.glaze_type_ids = filters.glazeTypeIds.join(",");
  if (filters.isFoodSafe !== undefined)
    params.is_food_safe = String(filters.isFoodSafe);
  if (filters.runs !== undefined) params.runs = String(filters.runs);
  if (filters.highlightsGrooves !== undefined)
    params.highlights_grooves = String(filters.highlightsGrooves);
  if (filters.isDifferentOnWhiteAndBrownClay !== undefined)
    params.is_different_on_white_and_brown_clay = String(
      filters.isDifferentOnWhiteAndBrownClay,
    );
  if (filters.firingTemperatureId !== undefined)
    params.firing_temperature_id = filters.firingTemperatureId;
  const { data } = await client.get<GlazeCombinationEntry[]>(
    "globals/glaze_combination/",
    { params },
  );
  return data;
}

export async function fetchGlobalEntriesWithFilters<
  T extends { id: string; name?: string; is_favorite?: boolean },
>(globalName: string, params: Record<string, string> = {}): Promise<T[]> {
  const { data } = await client.get<T[]>(`globals/${globalName}/`, { params });
  return data;
}

export async function toggleGlobalEntryFavorite(
  globalName: string,
  id: string,
  favorite: boolean,
): Promise<void> {
  if (favorite) {
    await client.post(`globals/${globalName}/${id}/favorite/`);
  } else {
    await client.delete(`globals/${globalName}/${id}/favorite/`);
  }
}

export type CreateGlobalEntryPayload =
  | { field: string; value: string }
  | { values: Record<string, unknown> }
  | { layers: string[] };

export async function createGlobalEntry(
  globalName: string,
  payload: CreateGlobalEntryPayload,
): Promise<GlobalEntry> {
  const { data } = await client.post<{
    id: string;
    name: string;
    is_public?: boolean;
  }>(`globals/${globalName}/`, payload);
  return { id: data.id, name: data.name, isPublic: data.is_public ?? false };
}

export async function createTagEntry(payload: {
  name: string;
  color?: string;
}): Promise<TagEntry> {
  const { data } = await client.post<TagEntry>("globals/tag/", {
    values: payload,
  });
  return data;
}

/** Fetch glaze combination image gallery data for the Analyze tab. */
export async function fetchGlazeCombinationImages(): Promise<
  GlazeCombinationImageEntry[]
> {
  const { data } = await client.get<
    Array<{
      glaze_combination: GlazeCombinationEntry;
      pieces: Array<{
        id: string;
        name: string;
        state: string;
        images: Wire<CaptionedImage>[];
      }>;
    }>
  >("analysis/glaze-combination-images/");
  return data.map((entry) => ({
    glaze_combination: entry.glaze_combination,
    pieces: entry.pieces.map((p) => ({
      id: p.id,
      name: p.name,
      state: p.state as State,
      images: p.images.map(mapImage),
    })),
  }));
}

export async function fetchCloudinaryWidgetConfig(): Promise<CloudinaryWidgetConfig> {
  const { data } = await client.get<CloudinaryWidgetConfig>(
    "uploads/cloudinary/widget-config/",
  );
  return data;
}

export async function signCloudinaryWidgetParams(
  paramsToSign: Record<string, unknown>,
): Promise<string> {
  const { data } = await client.post<{ signature: string }>(
    "uploads/cloudinary/widget-signature/",
    {
      params_to_sign: paramsToSign,
    },
  );
  return data.signature;
}

export type ManualSquareCropImportRecordPayload = {
  client_id: string;
  filename: string;
  reviewed: boolean;
  parsed_fields: {
    name: string;
    kind: "glaze_type" | "glaze_combination";
    first_glaze: string;
    second_glaze: string;
    runs: boolean | null;
    is_food_safe: boolean | null;
  };
};

export type ManualSquareCropImportResponse = {
  results: Array<{
    client_id: string;
    filename: string;
    kind: string;
    name: string;
    status: "created" | "skipped_duplicate" | "error";
    reason: string | null;
    object_id: string | null;
    image_url: string | null;
  }>;
  summary: {
    created_glaze_types: number;
    created_glaze_combinations: number;
    skipped_duplicates: number;
    errors: number;
  };
};

export async function importManualSquareCropRecords(
  records: ManualSquareCropImportRecordPayload[],
  cropFiles: Record<string, File>,
): Promise<ManualSquareCropImportResponse> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ records }));
  for (const record of records) {
    const file = cropFiles[record.client_id];
    if (file) {
      form.append(`crop_image__${record.client_id}`, file, file.name);
    }
  }
  const { data } = await client.post<ManualSquareCropImportResponse>(
    "admin/manual-square-crop-import/",
    form,
  );
  return data;
}

export type CloudinaryCleanupAsset = {
  public_id: string;
  cloud_name: string;
  path_prefix: string | null;
  url: string;
  thumbnail_url: string;
  bytes: number | null;
  created_at: string | null;
};

export type CloudinaryCleanupScanResponse = {
  assets: CloudinaryCleanupAsset[];
  summary: {
    total: number;
    referenced: number;
    unused: number;
    referenced_breakdown: {
      key: string;
      label: string;
      count: number;
    }[];
    reference_warnings: string[];
  };
};

export async function scanCloudinaryCleanupAssets(): Promise<CloudinaryCleanupScanResponse> {
  const { data } = await client.get<CloudinaryCleanupScanResponse>(
    "admin/cloudinary-cleanup/",
  );
  return data;
}

export async function deleteCloudinaryCleanupAssets(
  publicIds: string[],
): Promise<Record<string, string>> {
  const { data } = await client.delete<{ deleted: Record<string, string> }>(
    "admin/cloudinary-cleanup/",
    { data: { public_ids: publicIds } },
  );
  return data.deleted;
}
