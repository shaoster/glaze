import axios from 'axios'
import type { CaptionedImage, PieceDetail, PieceSummary, PieceState, State, StateSummary } from './types'

const client = axios.create({ baseURL: '/api/' })

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
        created: new Date(raw.created),
    }
}

function mapStateSummary(raw: Wire<StateSummary>): StateSummary {
    return { state: raw.state as State }
}

function mapPieceState(raw: Wire<PieceState>): PieceState {
    return {
        state: raw.state as State,
        notes: raw.notes,
        created: new Date(raw.created),
        last_modified: new Date(raw.last_modified),
        location: raw.location,
        images: raw.images.map(mapImage),
        previous_state: raw.previous_state as State | null,
        next_state: raw.next_state as State | null,
    }
}

function mapPieceSummary(raw: Wire<PieceSummary>): PieceSummary {
    return {
        id: raw.id,
        name: raw.name,
        created: new Date(raw.created),
        last_modified: new Date(raw.last_modified),
        thumbnail: raw.thumbnail,
        current_state: mapStateSummary(raw.current_state),
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

export async function fetchPiece(id: string): Promise<PieceDetail> {
    const { data } = await client.get<Wire<PieceDetail>>(`pieces/${id}/`)
    return mapPieceDetail(data)
}

export type CreatePiecePayload = {
    name: string
    thumbnail?: string
}

// New pieces always start in the `designed` state — the backend enforces this.
export async function createPiece(payload: CreatePiecePayload): Promise<PieceDetail> {
    const { data } = await client.post<Wire<PieceDetail>>('pieces/', payload)
    return mapPieceDetail(data)
}

export type AddStatePayload = {
    state: State
    notes?: string
    location?: string
    images?: Wire<CaptionedImage>[]
}

export async function addPieceState(pieceId: string, payload: AddStatePayload): Promise<PieceDetail> {
    const { data } = await client.post<Wire<PieceDetail>>(`pieces/${pieceId}/states/`, payload)
    return mapPieceDetail(data)
}
