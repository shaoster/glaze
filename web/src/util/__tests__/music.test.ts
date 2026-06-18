import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRACK_ID,
  MUSIC_CATALOG,
  getTrack,
} from "../music";

describe("MUSIC_CATALOG", () => {
  it("is non-empty", () => {
    expect(MUSIC_CATALOG.length).toBeGreaterThan(0);
  });

  it("contains no duplicate IDs", () => {
    const ids = MUSIC_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each track has required string fields", () => {
    for (const track of MUSIC_CATALOG) {
      expect(typeof track.id).toBe("string");
      expect(typeof track.title).toBe("string");
      expect(typeof track.artist).toBe("string");
      expect(typeof track.license).toBe("string");
    }
  });
});

describe("DEFAULT_TRACK_ID", () => {
  it("exists as an ID in the catalog", () => {
    const ids = new Set(MUSIC_CATALOG.map((t) => t.id));
    expect(ids.has(DEFAULT_TRACK_ID)).toBe(true);
  });
});

describe("getTrack", () => {
  it("returns the track for a known ID", () => {
    const track = getTrack("adventures-a-himitsu");
    expect(track).toBeDefined();
    expect(track?.id).toBe("adventures-a-himitsu");
    expect(track?.title).toBe("Adventures");
    expect(track?.artist).toBe("A Himitsu");
  });

  it("returns undefined for an unknown ID", () => {
    expect(getTrack("not-a-real-track")).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(getTrack(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(getTrack(undefined)).toBeUndefined();
  });
});
