"""Tests for the gc_derived_images management command."""

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command

from api.models import ENTRY_STATE, Image, Piece, PieceState, PieceStateImage


@pytest.fixture
def user(db):
    return User.objects.create(username="gc@example.com", email="gc@example.com")


def _source_image(user, url="https://media.example.com/src.png", r2_key="src.png"):
    return Image.objects.create(user=user, url=url, r2_key=r2_key)


def _derived_image(user, source, derived_type="jpeg_conversion", r2_key="derived.jpg"):
    return Image.objects.create(
        user=user,
        url=f"https://media.example.com/{r2_key}",
        r2_key=r2_key,
        derived_from=source,
        derived_type=derived_type,
    )


def _piece_with_state(user):
    piece = Piece.objects.create(user=user, name="Mug", is_editable=True)
    state = PieceState.objects.create(
        piece=piece, user=user, state=ENTRY_STATE, order=1
    )
    return piece, state


@pytest.fixture
def mock_r2_delete(monkeypatch):
    deleted = []
    monkeypatch.setattr("api.r2.delete_object", lambda key: deleted.append(key))
    return deleted


@pytest.mark.django_db
class TestGcDerivedImages:
    def test_orphan_deleted(self, user, mock_r2_delete):
        src = _source_image(user)
        orphan = _derived_image(user, src)
        orphan_id = orphan.id

        call_command("gc_derived_images")

        assert not Image.objects.filter(id=orphan_id).exists()
        assert "derived.jpg" in mock_r2_delete

    def test_image_fk_reference_skips(self, user, mock_r2_delete):
        src = _source_image(user)
        derived = _derived_image(user, src)
        _, state = _piece_with_state(user)
        PieceStateImage.objects.create(piece_state=state, image=derived, order=0)

        call_command("gc_derived_images")

        assert Image.objects.filter(id=derived.id).exists()
        assert mock_r2_delete == []

    def test_cropped_image_fk_reference_skips(self, user, mock_r2_delete):
        src = _source_image(user)
        base = _source_image(user, url="https://media.example.com/base.png", r2_key="base.png")
        crop_derivative = _derived_image(
            user, src, derived_type="crop", r2_key="crop.jpg"
        )
        _, state = _piece_with_state(user)
        PieceStateImage.objects.create(
            piece_state=state, image=base, order=0, cropped_image=crop_derivative
        )

        call_command("gc_derived_images")

        assert Image.objects.filter(id=crop_derivative.id).exists()
        assert mock_r2_delete == []

    def test_thumbnail_fk_reference_skips(self, user, mock_r2_delete):
        src = _source_image(user)
        derived = _derived_image(user, src)
        piece, _ = _piece_with_state(user)
        piece.thumbnail = derived
        piece.save(update_fields=["thumbnail"])

        call_command("gc_derived_images")

        assert Image.objects.filter(id=derived.id).exists()
        assert mock_r2_delete == []

    def test_dry_run_no_op(self, user, mock_r2_delete):
        src = _source_image(user)
        orphan = _derived_image(user, src)

        call_command("gc_derived_images", "--dry-run")

        assert Image.objects.filter(id=orphan.id).exists()
        assert mock_r2_delete == []

    def test_idempotent(self, user, mock_r2_delete):
        src = _source_image(user)
        _derived_image(user, src)

        call_command("gc_derived_images")
        call_command("gc_derived_images")  # second run must not raise

        assert mock_r2_delete == ["derived.jpg"]

    def test_limit(self, user, mock_r2_delete):
        src = _source_image(user)
        for i in range(5):
            _derived_image(user, src, r2_key=f"derived_{i}.jpg")

        call_command("gc_derived_images", "--limit", "3")

        assert len(mock_r2_delete) == 3
        assert Image.objects.filter(derived_from=src).count() == 2
