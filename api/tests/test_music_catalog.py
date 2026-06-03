"""Tests for the showcase music catalog (issue #746)."""

import jsonschema
import pytest
from jsonschema import Draft202012Validator

from api.showcase import (
    DEFAULT_TRACK_ID,
    MUSIC_CATALOG_SCHEMA,
    MusicTrack,
    get_catalog,
    get_track,
    resolve_track_id,
)
from api.showcase.music import _RAW_CATALOG


def test_catalog_loads_and_is_nonempty():
    catalog = get_catalog()
    assert catalog
    assert all(isinstance(track, MusicTrack) for track in catalog)


def test_raw_catalog_validates_against_schema():
    # The data file conforms to its contract, and the contract itself is valid.
    Draft202012Validator.check_schema(MUSIC_CATALOG_SCHEMA)
    jsonschema.validate(instance=_RAW_CATALOG, schema=MUSIC_CATALOG_SCHEMA)


def test_track_ids_are_stable_and_unique():
    ids = [track.track_id for track in get_catalog()]
    assert len(ids) == len(set(ids))


def test_every_track_serializes_with_attribution():
    for track in get_catalog():
        data = track.to_dict()
        # Attribution is a licensing obligation — it must always be present.
        assert data["attribution"].strip()
        assert data["audio"]["format"] in {"flac", "wav"}
        assert data["audio"]["url"]


def test_default_track_is_a_real_track():
    assert get_track(DEFAULT_TRACK_ID) is not None


def test_resolve_track_id_applies_default_for_none():
    assert resolve_track_id(None) == DEFAULT_TRACK_ID


def test_resolve_track_id_passes_through_valid_id():
    valid = get_catalog()[0].track_id
    assert resolve_track_id(valid) == valid


def test_resolve_track_id_rejects_unknown():
    with pytest.raises(ValueError):
        resolve_track_id("bogus-track")


def test_get_track_returns_none_for_unknown_or_none():
    assert get_track(None) is None
    assert get_track("bogus-track") is None
