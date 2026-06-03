/**
 * Web interface to the music_catalog.yml configuration.
 *
 * The showcase video wizard lets the potter pick a royalty-free track for a
 * Keepsake video. The catalog is static data defined in `music_catalog.yml` at
 * the repo root and shared with the backend (`api/showcase/music.py`). This
 * module is the single frontend source of track metadata — derive the track
 * list and default from the exports here rather than duplicating them.
 */
import catalog from "../../../music_catalog.yml";

export interface MusicTrackAudio {
  format: "flac" | "wav";
  url: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  genre: string;
  mood: string;
  license: string;
  license_url: string | null;
  artist_url: string;
  source_url: string;
  download_url: string;
  attribution: string;
  audio: MusicTrackAudio;
}

interface RawCatalog {
  version: string;
  default_track_id: string;
  tracks: Record<string, Omit<MusicTrack, "id">>;
}

const rawCatalog = catalog as unknown as RawCatalog;

/** All catalog tracks in declaration order. */
export const MUSIC_CATALOG: MusicTrack[] = Object.entries(rawCatalog.tracks).map(
  ([id, track]) => ({ id, ...track }),
);

/** Track applied when the potter has not chosen one (deterministic default). */
export const DEFAULT_TRACK_ID: string = rawCatalog.default_track_id;

const byId = new Map(MUSIC_CATALOG.map((track) => [track.id, track]));

/** Return the track for `id`, or undefined if it is not in the catalog. */
export function getTrack(id: string | null | undefined): MusicTrack | undefined {
  if (!id) return undefined;
  return byId.get(id);
}
