"""Tests for the deterministic Keepsake storyboard planner (issue #744)."""

import jsonschema
import pytest
from jsonschema import Draft202012Validator

from api.models import ENTRY_STATE, Image, Piece, PieceState, PieceStateImage
from api.showcase import (
    COVER_SLIDE_MS,
    DEFAULT_TRACK_ID,
    KEEPSAKE_STYLE,
    NOTE_SLIDE_MS,
    STORYBOARD_SCHEMA,
    Storyboard,
    build_keepsake_storyboard,
    get_catalog,
    validate_storyboard,
)
from api.showcase.storyboard import IMAGE_SLIDE_MS
from api.workflow import get_state_friendly_name

SECOND_STATE = "wheel_thrown"

# Two distinct real catalog track ids for hash-sensitivity assertions.
A_TRACK = DEFAULT_TRACK_ID
B_TRACK = next(t.track_id for t in get_catalog() if t.track_id != DEFAULT_TRACK_ID)


def _add_image(state, *, url, order, public_id=None, caption="", crop=None):
    img = Image.objects.create(
        user=state.user,
        url=url,
        cloudinary_public_id=public_id,
    )
    PieceStateImage.objects.create(
        piece_state=state,
        image=img,
        order=order,
        caption=caption,
        crop=crop,
    )
    return img


@pytest.fixture
def rich_piece(user, db):
    """A two-state piece with a thumbnail, several images, and notes."""
    piece = Piece.objects.create(
        user=user, name="Speckled Bowl", showcase_story="Made over a slow week."
    )
    s1 = PieceState.objects.create(
        piece=piece, state=ENTRY_STATE, order=1, notes="First sketch."
    )
    thumb = _add_image(
        s1,
        url="https://ex.com/cover.jpg",
        order=0,
        public_id="cover_pid",
        caption="The cover",
    )
    _add_image(s1, url="https://ex.com/a.jpg", order=1, public_id="a_pid", caption="A")
    s2 = PieceState.objects.create(
        piece=piece, state=SECOND_STATE, order=2, notes="Thrown on the wheel."
    )
    _add_image(s2, url="https://ex.com/b.jpg", order=0, public_id="b_pid", caption="B")
    piece.thumbnail = thumb
    piece.save()
    return piece


@pytest.mark.django_db
def test_normal_piece_cover_first_and_deterministic_durations(rich_piece):
    sb = build_keepsake_storyboard(rich_piece)

    assert isinstance(sb, Storyboard)
    assert sb.eligible is True
    assert sb.ineligible_reason is None
    assert sb.style == KEEPSAKE_STYLE

    # Cover is first, is the thumbnail image, and carries the piece name + story.
    cover = sb.slides[0]
    assert cover.kind == "cover"
    assert cover.duration_ms == COVER_SLIDE_MS
    assert cover.heading == "Speckled Bowl"
    assert cover.text == "Made over a slow week."
    assert cover.image["cloudinary_public_id"] == "cover_pid"
    assert cover.image["fit"] == "cover"

    kinds = [s.kind for s in sb.slides]
    # cover, then image A + note(s1), then image B + note(s2).
    assert kinds == ["cover", "image", "note", "image", "note"]

    # The cover image is not repeated as an image slide.
    image_pids = [
        s.image["cloudinary_public_id"] for s in sb.slides if s.kind == "image"
    ]
    assert image_pids == ["a_pid", "b_pid"]

    # Durations are derived from constants only.
    assert sb.total_duration_ms == (
        COVER_SLIDE_MS + IMAGE_SLIDE_MS + NOTE_SLIDE_MS + IMAGE_SLIDE_MS + NOTE_SLIDE_MS
    )
    assert sb.slide_count == len(sb.slides)


@pytest.mark.django_db
def test_state_labels_are_derived_not_hardcoded(rich_piece):
    sb = build_keepsake_storyboard(rich_piece)
    labels = {s.state_label for s in sb.slides}
    assert get_state_friendly_name(ENTRY_STATE) in labels
    assert get_state_friendly_name(SECOND_STATE) in labels


@pytest.mark.django_db
def test_excluded_images_and_notes_are_omitted(rich_piece):
    s2 = rich_piece.states.get(state=SECOND_STATE)
    # Image keys use the image UUID when present, mirroring the frontend picker.
    image_b_id = s2.image_links.get().image_id
    sb = build_keepsake_storyboard(
        rich_piece,
        excluded_image_keys=[f"{s2.id}:{image_b_id}"],
        excluded_note_keys=[str(s2.id)],
    )
    image_pids = [
        s.image["cloudinary_public_id"] for s in sb.slides if s.kind == "image"
    ]
    assert image_pids == ["a_pid"]  # b excluded
    note_keys = [s.key for s in sb.slides if s.kind == "note"]
    assert str(s2.id) not in note_keys


@pytest.mark.django_db
def test_thumbnail_cannot_be_excluded(rich_piece):
    s1 = rich_piece.states.get(state=ENTRY_STATE)
    cover_id = s1.image_links.get(image__cloudinary_public_id="cover_pid").image_id
    # Attempt to exclude the cover image's key; it must remain as the cover.
    sb = build_keepsake_storyboard(
        rich_piece, excluded_image_keys=[f"{s1.id}:{cover_id}"]
    )
    assert sb.eligible is True
    assert sb.slides[0].kind == "cover"
    assert sb.slides[0].image["cloudinary_public_id"] == "cover_pid"


@pytest.mark.django_db
def test_sparse_piece_without_images_is_ineligible(user, db):
    piece = Piece.objects.create(user=user, name="Empty")
    PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=1, notes="A note.")
    sb = build_keepsake_storyboard(piece)
    assert sb.eligible is False
    assert sb.ineligible_reason
    assert sb.slides == []
    assert sb.total_duration_ms == 0


@pytest.mark.django_db
def test_single_image_no_notes_is_degraded_but_valid(user, db):
    piece = Piece.objects.create(user=user, name="Solo")
    s1 = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=1)
    img = _add_image(s1, url="https://ex.com/only.jpg", order=0, public_id="only_pid")
    piece.thumbnail = img
    piece.save()
    sb = build_keepsake_storyboard(piece)
    assert sb.eligible is True
    assert [s.kind for s in sb.slides] == ["cover"]


@pytest.mark.django_db
def test_identical_inputs_produce_identical_storyboard(rich_piece):
    a = build_keepsake_storyboard(rich_piece, music_track_id=A_TRACK).to_dict()
    b = build_keepsake_storyboard(rich_piece, music_track_id=A_TRACK).to_dict()
    assert a == b
    assert a["music_track_id"] == A_TRACK


@pytest.mark.django_db
def test_slide_order_follows_state_order_not_creation_order(user, db):
    """States created out of timeline order still play back in `order` sequence,
    so data reordered at rest does not change the effective Storyboard."""
    piece = Piece.objects.create(user=user, name="Stable")
    # Create the later state first to decouple creation order from `order`.
    s2 = PieceState.objects.create(piece=piece, state=SECOND_STATE, order=2)
    s1 = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=1)
    thumb = _add_image(s1, url="https://ex.com/c.jpg", order=0, public_id="c_pid")
    _add_image(s2, url="https://ex.com/d.jpg", order=0, public_id="d_pid")
    piece.thumbnail = thumb
    piece.save()

    sb = build_keepsake_storyboard(piece)
    # Cover (s1 thumbnail) first, then the s2 image — ordered by `order`.
    image_pids = [
        s.image["cloudinary_public_id"] for s in sb.slides if s.kind == "image"
    ]
    assert image_pids == ["d_pid"]
    assert sb.slides[0].image["cloudinary_public_id"] == "c_pid"
    assert sb.slides[0].state_label == get_state_friendly_name(ENTRY_STATE)


@pytest.mark.django_db
def test_every_storyboard_validates_against_schema(rich_piece, user):
    cases = [
        build_keepsake_storyboard(rich_piece),
        build_keepsake_storyboard(rich_piece, music_track_id=A_TRACK),
        build_keepsake_storyboard(
            rich_piece, excluded_image_keys=["nope"], excluded_note_keys=["nope"]
        ),
    ]
    empty = Piece.objects.create(user=user, name="Empty2")
    PieceState.objects.create(piece=empty, state=ENTRY_STATE, order=1)
    cases.append(build_keepsake_storyboard(empty))

    for sb in cases:
        validate_storyboard(sb.to_dict())  # raises on failure


def test_schema_document_is_valid_draft_2020_12():
    Draft202012Validator.check_schema(STORYBOARD_SCHEMA)


def test_validate_storyboard_rejects_malformed():
    with pytest.raises(jsonschema.ValidationError):
        validate_storyboard({"storyboard_version": "1"})


@pytest.mark.django_db
def test_music_default_applied_when_omitted(rich_piece):
    sb = build_keepsake_storyboard(rich_piece)
    assert sb.music_track_id == DEFAULT_TRACK_ID
    assert sb.to_dict()["music_track_id"] == DEFAULT_TRACK_ID


@pytest.mark.django_db
def test_music_track_change_changes_storyboard(rich_piece):
    a = build_keepsake_storyboard(rich_piece, music_track_id=A_TRACK).to_dict()
    b = build_keepsake_storyboard(rich_piece, music_track_id=B_TRACK).to_dict()
    # Only the track differs; the hashed storyboard dict must differ with it.
    assert A_TRACK != B_TRACK
    assert a["music_track_id"] == A_TRACK
    assert b["music_track_id"] == B_TRACK
    assert a != b


@pytest.mark.django_db
def test_music_unknown_track_rejected(rich_piece):
    with pytest.raises(ValueError):
        build_keepsake_storyboard(rich_piece, music_track_id="not-a-real-track")
