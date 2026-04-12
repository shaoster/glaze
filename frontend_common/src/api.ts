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
import axios from 'axios'
import type { CaptionedImage, PieceDetail, PieceSummary, PieceState, State, StateSummary } from './types'

export type AuthUser = {
    id: number
    email: string
    first_name: string
    last_name: string
    openid_subject: string
    profile_image_url: string
}

const client = axios.create({ baseURL: '/api/' })
client.defaults.withCredentials = true
client.defaults.xsrfCookieName = 'csrftoken'
client.defaults.xsrfHeaderName = 'X-CSRFToken'
const expoBaseUrl = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.EXPO_PUBLIC_API_BASE_URL
if (expoBaseUrl) {
    client.defaults.baseURL = expoBaseUrl
}

export type CloudinaryWidgetConfig = {
    cloud_name: string
    api_key: string
    folder?: string
    upload_preset?: string
}

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
        : T[K]
}

// ---------------------------------------------------------------------------
// Mappers: wire → domain
// ---------------------------------------------------------------------------

function mapImage(raw: Wire<CaptionedImage>): CaptionedImage {
    return {
        url: raw.url,
        caption: raw.caption,
        created: new Date(raw.created ?? ''),
        cloudinary_public_id: raw.cloudinary_public_id ?? null,
    }
}

function mapStateSummary(raw: Wire<StateSummary>): StateSummary {
    return { state: raw.state as State }
}

function mapPieceState(raw: Wire<PieceState>): PieceState {
    return {
        state: raw.state as State,
        notes: raw.notes,
        created: new Date(raw.created ?? ''),
        last_modified: new Date(raw.last_modified ?? ''),
        images: raw.images.map(mapImage),
        previous_state: raw.previous_state as State | null,
        next_state: raw.next_state as State | null,
        additional_fields: raw.additional_fields ?? {},
    }
}

function mapPieceSummary(raw: Wire<PieceSummary>): PieceSummary {
    return {
        id: raw.id,
        name: raw.name,
        created: new Date(raw.created ?? ''),
        last_modified: new Date(raw.last_modified ?? ''),
        thumbnail: raw.thumbnail,
        current_state: mapStateSummary(raw.current_state),
        current_location: raw.current_location ?? '',
    }
}

function mapPieceDetail(raw: Wire<PieceDetail>): PieceDetail {
    return {
        ...mapPieceSummary(raw),
        current_state: mapPieceState(raw.current_state),
        history: raw.history.map(mapPieceState),
    }
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function fetchPieces(): Promise<PieceSummary[]> {
    const { data } = await client.get<Wire<PieceSummary>[]>('pieces/')
    return data.map(mapPieceSummary)
}

export async function ensureCsrfCookie(): Promise<void> {
    await client.get('auth/csrf/')
}

export async function loginWithEmail(email: string, password: string): Promise<AuthUser> {
    await ensureCsrfCookie()
    const { data } = await client.post<AuthUser>('auth/login/', { email, password })
    return data
}

export async function registerWithEmail(payload: {
    email: string
    password: string
    first_name?: string
    last_name?: string
}): Promise<AuthUser> {
    await ensureCsrfCookie()
    const { data } = await client.post<AuthUser>('auth/register/', payload)
    return data
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
    try {
        const { data } = await client.get<AuthUser>('auth/me/')
        return data
    } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            return null
        }
        throw error
    }
}

export async function loginWithGoogle(credential: string): Promise<AuthUser> {
    await ensureCsrfCookie()
    const { data } = await client.post<AuthUser>('auth/google/', { credential })
    return data
}

export async function logoutUser(): Promise<void> {
    await ensureCsrfCookie()
    await client.post('auth/logout/', {})
}

export async function fetchPiece(id: string): Promise<PieceDetail> {
    const { data } = await client.get<Wire<PieceDetail>>(`pieces/${id}/`)
    return mapPieceDetail(data)
}

export type CreatePiecePayload = {
    name: string
    thumbnail?: string
    notes?: string
    current_location?: string
}

// New pieces always start in the `designed` state — the backend enforces this.
export async function createPiece(payload: CreatePiecePayload): Promise<PieceDetail> {
    const { data } = await client.post<Wire<PieceDetail>>('pieces/', payload)
    return mapPieceDetail(data)
}

export type AddStatePayload = {
    state: State
    notes?: string
    images?: Wire<CaptionedImage>[]
    additional_fields?: Record<string, string | number | boolean>
}

export async function addPieceState(pieceId: string, payload: AddStatePayload): Promise<PieceDetail> {
    const { data } = await client.post<Wire<PieceDetail>>(`pieces/${pieceId}/states/`, payload)
    return mapPieceDetail(data)
}

export type UpdateStatePayload = {
    notes?: string
    images?: Array<{ url: string; caption: string; cloudinary_public_id?: string | null }>
    additional_fields?: Record<string, string | number | boolean>
}

export async function updateCurrentState(pieceId: string, payload: UpdateStatePayload): Promise<PieceDetail> {
    const { data } = await client.patch<Wire<PieceDetail>>(`pieces/${pieceId}/state/`, payload)
    return mapPieceDetail(data)
}

export type UpdatePiecePayload = {
    current_location?: string
}

export async function updatePiece(pieceId: string, payload: UpdatePiecePayload): Promise<PieceDetail> {
    const { data } = await client.patch<Wire<PieceDetail>>(`pieces/${pieceId}/`, payload)
    return mapPieceDetail(data)
}

export async function fetchGlobalEntries(globalName: string): Promise<string[]> {
    const { data } = await client.get<Array<{ id: string; name: string }>>(`globals/${globalName}/`)
    return data.map((entry) => entry.name)
}

export async function createGlobalEntry(globalName: string, field: string, value: string): Promise<string> {
    const { data } = await client.post<{ id: string; name: string }>(`globals/${globalName}/`, {
        field,
        value,
    })
    return data.name
}

export async function fetchCloudinaryWidgetConfig(): Promise<CloudinaryWidgetConfig> {
    const { data } = await client.get<CloudinaryWidgetConfig>('uploads/cloudinary/widget-config/')
    return data
}

export async function signCloudinaryWidgetParams(paramsToSign: Record<string, unknown>): Promise<string> {
    const { data } = await client.post<{ signature: string }>('uploads/cloudinary/widget-signature/', {
        params_to_sign: paramsToSign,
    })
    return data.signature
}
