"""Tests for the showcase music catalog (issue #746)."""

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


def test_catalog_loads_and_is_nonempty():
    # Importing the module schema-validates the raw catalog at load time, so a
    # successful, non-empty load proves the data file conforms to the contract.
    catalog = get_catalog()
    assert catalog
    assert all(isinstance(track, MusicTrack) for track in catalog)


def test_schema_document_is_valid_draft_2020_12():
    Draft202012Validator.check_schema(MUSIC_CATALOG_SCHEMA)


def test_track_ids_are_stable_and_unique():
    ids = [track.track_id for track in get_catalog()]
    assert len(ids) == len(set(ids))


def test_every_track_serializes_with_attribution():
    for track in get_catalog():
        data = track.to_dict()
        # Attribution is a licensing obligation — it must always be present.
        assert data["attribution"].strip()
        # format is the target lossless container; url may be null until hosted.
        assert data["audio"]["format"] in {"flac", "wav"}
        assert data["audio"]["url"] is None or data["audio"]["url"]


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
