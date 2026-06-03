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
  CropRun,
  FiringTemperatureRef,
  GlazeCombinationEntry,
  GlazeCombinationImageEntry,
  GlazeCombinationImagePiece,
  GlazeTypeRef,
  ImageCrop,
  PieceDetail,
  PieceSummary,
  PieceState,
  StateEnum,
  TagEntry,
  Thumbnail,
} from "./types";

/**
 * JSON Schema property shape returned by the workflow-schema endpoint.
 *
 * This is intentionally a small, handwritten protocol type rather than a
 * generated OpenAPI contract. The backend builds these objects dynamically
 * from `workflow.yml` and decorates them with UI-specific `x-*` fields, so
 * the frontend needs a tolerant structural type for schema-driven rendering
 * and field discovery. Trying to force this into the usual generated-types
 * pipeline would add noise without improving the actual contract clarity.
 */
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

/**
 * UI Schema envelope returned by `GET /api/workflow/schema/<state_id>/`.
 *
 * The endpoint is a runtime synthesis of workflow metadata, not a normal DRF
 * serializer contract, so this remains a pragmatic frontend protocol type.
 * It exists to support the dynamic workflow field machinery in
 * `web/src/util/workflow.ts` and the editors that render from those schemas.
 */
export interface UISchema {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export type AuthUser = {
  id: number;
  is_staff: boolean;
  openid_subject: string;
  alias: string;
  preferences: UserPreferences;
};

export type TutorialVisibility = boolean;

export type UserPreferences = {
  process_summary_fields: string[];
} & Record<string, unknown>;

const client = axios.create({ baseURL: "/api/" });
client.defaults.withCredentials = true;
client.defaults.xsrfCookieName = "potterdoc_csrftoken";
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
    image_id: raw.image_id ?? null,
  };
}

function mapThumbnail(raw: Wire<Thumbnail> | null): Thumbnail | null {
  if (!raw) return null;
  return {
    ...raw,
    crop: normalizeCrop(raw.crop),
  };
}

function mapCropRun(raw: Wire<CropRun>): CropRun {
  return {
    ...raw,
    crop: normalizeCrop(raw.crop),
    created: new Date(raw.created ?? ""),
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

function mapStateSummary(
  raw: Wire<PieceSummary["current_state"]>,
): PieceSummary["current_state"] {
  return {
    state: raw.state,
  };
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
    id: raw.id,
    state: raw.state,
    notes: raw.notes,
    created: new Date(raw.created ?? ""),
    last_modified: new Date(raw.last_modified ?? ""),
    images: raw.images.map(mapImage),
    previous_state: raw.previous_state,
    next_state: raw.next_state,
    custom_fields: raw.custom_fields ?? {},
    has_been_edited: raw.has_been_edited ?? false,
  };
}

function mapPieceSummary(raw: Wire<PieceSummary>): PieceSummary {
  return {
    id: raw.id,
    name: raw.name,
    created: new Date(raw.created ?? ""),
    last_modified: new Date(raw.last_modified ?? ""),
    thumbnail: mapThumbnail(raw.thumbnail),
    photo_count: raw.photo_count ?? 0,
    shared: raw.shared ?? false,
    is_editable: raw.is_editable ?? false,
    can_edit: raw.can_edit ?? true,
    current_state: mapStateSummary(raw.current_state),
    current_location: raw.current_location ?? "",
    tags: (raw.tags ?? []).map(mapTagEntry),
    showcase_story: raw.showcase_story ?? "",
    showcase_fields: (raw.showcase_fields as string[]) ?? [],
  };
}

function mapPieceDetail(raw: Wire<PieceDetail>): PieceDetail {
  return {
    ...mapPieceSummary(raw),
    current_state: mapPieceState(raw.current_state),
    history: raw.history.map(mapPieceState),
  };
}

function normalizeUserPreferences(
  preferences: Partial<UserPreferences> | null | undefined,
): UserPreferences {
  return {
    ...(preferences || {}),
    process_summary_fields: Array.isArray(preferences?.process_summary_fields)
      ? preferences.process_summary_fields.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  } as UserPreferences;
}

function normalizeAuthUser(raw: AuthUser): AuthUser {
  return {
    ...raw,
    alias: raw.alias ?? "",
    preferences: normalizeUserPreferences(raw.preferences),
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
export const PIECES_PAGE_SIZE = 16;

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

export interface AppInit {
  googleOauthClientId: string;
  mockIdpUrl: string | null;
  adminBaseUrl: string | null;
  user: AuthUser | null;
}

export async function fetchAppInit(): Promise<AppInit> {
  const { data } = await client.get<AppInit>("auth/me/");
  return {
    googleOauthClientId: data.googleOauthClientId,
    mockIdpUrl: data.mockIdpUrl ?? null,
    adminBaseUrl: data.adminBaseUrl ?? null,
    user: data.user ? normalizeAuthUser(data.user) : null,
  };
}

export async function loginWithGoogle(
  code: string,
  redirectUri: string,
  inviteCode?: string,
): Promise<AuthUser> {
  await ensureCsrfCookie();
  const { data } = await client.post<AuthUser>("auth/google/", {
    code,
    redirect_uri: redirectUri,
    invite_code: inviteCode,
  });
  return normalizeAuthUser(data);
}

export async function logoutUser(): Promise<void> {
  await ensureCsrfCookie();
  await client.post("auth/logout/", {});
}

export function downloadUserData(): void {
  // Navigate the browser to the export URL so the ZIP is streamed directly
  // to disk via Content-Disposition: attachment, with no client-side buffering.
  window.location.assign("/api/auth/export/");
}

export async function deleteAccount(): Promise<void> {
  await ensureCsrfCookie();
  await client.delete("auth/account/");
}

export type StaffInviteCodeResponse = { code: string; expires_at: string };

export async function getStaffInviteCode(): Promise<StaffInviteCodeResponse> {
  const { data } =
    await client.get<StaffInviteCodeResponse>("staff/invite-code/");
  return data;
}

export async function generateStaffInviteCode(): Promise<StaffInviteCodeResponse> {
  await ensureCsrfCookie();
  const { data } = await client.post<StaffInviteCodeResponse>(
    "staff/invite-code/",
    {},
  );
  return data;
}

export type InviteBatchResponse = { created: number };

export async function generateInviteBatch(
  count: number,
): Promise<InviteBatchResponse> {
  await ensureCsrfCookie();
  const { data } = await client.post<InviteBatchResponse>(
    "staff/invite-batch/",
    { count },
  );
  return data;
}

// Email an invite without ever sending the recipient address back to the
// client beyond this call. Resolves on 204; rejects on an empty pool (409) or
// invalid address (400) so the page can surface a message.
export async function sendEmailInvite(email: string): Promise<void> {
  await ensureCsrfCookie();
  await client.post("auth/invite/send/", { email });
}

export type UserPreferencesResponse = {
  alias: string;
  preferences: UserPreferences;
};

export async function fetchUserPreferences(): Promise<UserPreferencesResponse> {
  const { data } =
    await client.get<UserPreferencesResponse>("auth/preferences/");
  return {
    alias: data.alias ?? "",
    preferences: normalizeUserPreferences(data.preferences),
  };
}

export async function updateUserPreferences(
  preferences: UserPreferences,
  alias?: string,
): Promise<UserPreferencesResponse> {
  await ensureCsrfCookie();
  const { data } = await client.patch<UserPreferencesResponse>(
    "auth/preferences/",
    { preferences, ...(alias !== undefined && { alias }) },
  );
  return {
    alias: data.alias ?? "",
    preferences: normalizeUserPreferences(data.preferences),
  };
}

export async function fetchPiece(id: string): Promise<PieceDetail> {
  const { data } = await client.get<Wire<PieceDetail>>(`pieces/${id}/`);
  return mapPieceDetail(data);
}

export async function fetchWorkflowStateSchema(
  stateId: string,
): Promise<UISchema> {
  const { data } = await client.get<UISchema>(`workflow/schema/${stateId}/`);
  return data;
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
  state: StateEnum;
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

export type ShowcaseVideoArtifact = {
  url: string;
  download_url: string;
  filename: string;
  content_type: string;
};

export type ShowcaseVideoStatus = {
  piece_id: string;
  task_id: string | null;
  status:
    | "idle"
    | "disabled"
    | "pending"
    | "running"
    | "succeeded"
    | "failed"
    | "stale-needs-regeneration";
  task_status: "pending" | "running" | "success" | "failure" | null;
  enabled: boolean;
  disabled_reason: string | null;
  eligible: boolean;
  current_input_hash: string | null;
  stored_input_hash: string | null;
  is_stale: boolean;
  stale_reason: string | null;
  music_track_id: string | null;
  storyboard: Record<string, unknown> | null;
  artifact: ShowcaseVideoArtifact | null;
  error: string | null;
};

export type ShowcaseVideoRequestPayload = {
  excludedImageKeys?: string[];
  excludedNoteKeys?: string[];
  musicTrackId?: string | null;
};

export async function fetchPieceShowcaseVideo(
  pieceId: string,
): Promise<ShowcaseVideoStatus> {
  const { data } = await client.get<ShowcaseVideoStatus>(
    `pieces/${pieceId}/showcase-video/`,
  );
  return data;
}

export async function requestPieceShowcaseVideo(
  pieceId: string,
  payload: ShowcaseVideoRequestPayload = {},
): Promise<ShowcaseVideoStatus> {
  await ensureCsrfCookie();
  const { data } = await client.post<ShowcaseVideoStatus>(
    `pieces/${pieceId}/showcase-video/`,
    {
      excluded_image_keys: payload.excludedImageKeys ?? [],
      excluded_note_keys: payload.excludedNoteKeys ?? [],
      music_track_id: payload.musicTrackId ?? null,
    },
  );
  return data;
}

export type UpdateStatePayload = {
  notes?: string;
  created?: string;
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

export async function updatePastState(
  pieceId: string,
  stateId: string,
  payload: UpdateStatePayload,
): Promise<PieceDetail> {
  const { data } = await client.patch<Wire<PieceDetail>>(
    `pieces/${pieceId}/states/${stateId}/`,
    payload,
  );
  return mapPieceDetail(data);
}

export async function deletePieceState(
  pieceId: string,
  stateId: string,
): Promise<PieceDetail> {
  const { data } = await client.delete<Wire<PieceDetail>>(
    `pieces/${pieceId}/states/${stateId}/`,
  );
  return mapPieceDetail(data);
}

export type UpdatePiecePayload = {
  name?: string;
  current_location?: string;
  thumbnail?: Thumbnail | null;
  shared?: boolean;
  is_editable?: boolean;
  tags?: string[];
  showcase_story?: string;
  showcase_fields?: string[];
};

export async function moveImage(
  imageId: string,
  fromStateId: string,
  toStateId: string,
): Promise<PieceDetail> {
  const { data } = await client.patch<Wire<PieceDetail>>(
    `images/${imageId}/piece_state/${fromStateId}/`,
    { piece_state_id: toStateId },
  );
  return mapPieceDetail(data);
}

export async function updateImageCrop(
  imageId: string,
  crop: ImageCrop,
): Promise<PieceDetail> {
  const { data } = await client.patch<Wire<PieceDetail>>(
    `images/${imageId}/crop/`,
    crop,
  );
  return mapPieceDetail(data);
}

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
  const { data } = await client.get<Wire<GlazeCombinationImageEntry>[]>(
    "analysis/glaze-combination-images/",
  );
  return data.map((entry) => ({
    glaze_combination: entry.glaze_combination,
    pieces: entry.pieces.map(
      (p): GlazeCombinationImagePiece => ({
        id: p.id,
        name: p.name,
        state: p.state,
        images: p.images.map(mapImage),
      }),
    ),
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

export async function getImageCropRuns(
  imageId: string,
  options?: { latest?: boolean },
): Promise<CropRun[]> {
  const params = options?.latest ? "?latest=1" : "";
  const { data } = await client.get<Wire<CropRun>[]>(
    `images/${imageId}/crop-runs/${params}`,
  );
  return data.map(mapCropRun);
}

export async function createHumanCropRun(payload: {
  piece_state_image_id: number;
  crop: ImageCrop;
  notes?: string;
}): Promise<CropRun> {
  const { data } = await client.post<Wire<CropRun>>("crop-runs/", payload);
  return mapCropRun(data);
}

/**
 * Extracts a human-readable error message from a backend response or Error object.
 * Handles Axios errors, DRF non_field_errors, and generic field errors.
 */
export function extractErrorMessage(
  error: unknown,
  defaultMessage = "An unexpected error occurred.",
): string {
  if (axios.isAxiosError(error) && error.response?.data) {
    const data = error.response.data;
    if (typeof data === "string") return data;
    if (typeof data === "object" && data !== null) {
      const d = data as Record<string, unknown>;
      // DRF non_field_errors
      if (Array.isArray(d.non_field_errors) && d.non_field_errors.length > 0) {
        return String(d.non_field_errors[0]);
      }
      // Check for other field errors (return the first one found)
      const firstError = Object.values(d).flat()[0];
      if (firstError) return String(firstError);
    }
  }
  if (error instanceof Error) return error.message;
  return defaultMessage;
}
