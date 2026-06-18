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


def _gc(**kwargs):
    """Run gc_derived_images with min-age-minutes=0 so age guard doesn't block tests."""
    call_command("gc_derived_images", min_age_minutes=0, **kwargs)


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

        _gc()

        assert not Image.objects.filter(id=orphan_id).exists()
        assert "derived.jpg" in mock_r2_delete

    def test_image_fk_reference_skips(self, user, mock_r2_delete):
        src = _source_image(user)
        derived = _derived_image(user, src)
        _, state = _piece_with_state(user)
        PieceStateImage.objects.create(piece_state=state, image=derived, order=0)

        _gc()

        assert Image.objects.filter(id=derived.id).exists()
        assert mock_r2_delete == []

    def test_cropped_image_fk_reference_skips(self, user, mock_r2_delete):
        src = _source_image(user)
        base = _source_image(
            user, url="https://media.example.com/base.png", r2_key="base.png"
        )
        crop_derivative = _derived_image(
            user, src, derived_type="crop", r2_key="crop.jpg"
        )
        _, state = _piece_with_state(user)
        PieceStateImage.objects.create(
            piece_state=state, image=base, order=0, cropped_image=crop_derivative
        )

        _gc()

        assert Image.objects.filter(id=crop_derivative.id).exists()
        assert mock_r2_delete == []

    def test_thumbnail_fk_reference_skips(self, user, mock_r2_delete):
        src = _source_image(user)
        derived = _derived_image(user, src)
        piece, _ = _piece_with_state(user)
        piece.thumbnail = derived
        piece.save(update_fields=["thumbnail"])

        _gc()

        assert Image.objects.filter(id=derived.id).exists()
        assert mock_r2_delete == []

    def test_dry_run_no_op(self, user, mock_r2_delete):
        src = _source_image(user)
        orphan = _derived_image(user, src)

        _gc(dry_run=True)

        assert Image.objects.filter(id=orphan.id).exists()
        assert mock_r2_delete == []

    def test_idempotent(self, user, mock_r2_delete):
        src = _source_image(user)
        _derived_image(user, src)

        _gc()
        _gc()  # second run must not raise

        # Both the jpeg_conversion derivative and its unreferenced source are deleted.
        assert set(mock_r2_delete) == {"derived.jpg", "src.png"}

    def test_limit(self, user, mock_r2_delete):
        src = _source_image(user)
        # Use crop derivatives so src is not a jpeg_conversion source candidate.
        for i in range(5):
            _derived_image(user, src, derived_type="crop", r2_key=f"derived_{i}.jpg")

        _gc(limit=3)

        assert len(mock_r2_delete) == 3
        assert Image.objects.filter(derived_from=src).count() == 2

    def test_min_age_skips_recent(self, user, mock_r2_delete):
        """Images newer than --min-age-minutes are left alone."""
        src = _source_image(user)
        _derived_image(user, src)

        # Default min-age is 60 minutes; freshly created image is not old enough.
        call_command("gc_derived_images")

        assert Image.objects.filter(derived_from=src).count() == 1
        assert mock_r2_delete == []

    def test_conversion_source_deleted(self, user, mock_r2_delete):
        """An unreferenced jpeg_conversion source (derived_from=NULL) is also GC'd."""
        heic = _source_image(
            user, url="https://media.example.com/orig.heic", r2_key="orig.heic"
        )
        # jpeg_conversion derivative — the JPEG is NOT saved to any piece
        _derived_image(user, heic, derived_type="jpeg_conversion", r2_key="jpeg.jpg")

        _gc()

        # Both the JPEG derivative and the unreferenced HEIC source are deleted
        assert not Image.objects.filter(r2_key="orig.heic").exists()
        assert not Image.objects.filter(r2_key="jpeg.jpg").exists()
        assert set(mock_r2_delete) == {"orig.heic", "jpeg.jpg"}

    def test_conversion_source_skipped_when_piece_references_jpeg(
        self, user, mock_r2_delete
    ):
        """When a piece references the JPEG derivative, the source must NOT be deleted."""
        heic = _source_image(
            user, url="https://media.example.com/orig.heic", r2_key="orig.heic"
        )
        jpeg = _derived_image(
            user, heic, derived_type="jpeg_conversion", r2_key="jpeg.jpg"
        )
        _, state = _piece_with_state(user)
        PieceStateImage.objects.create(piece_state=state, image=jpeg, order=0)

        _gc()

        assert Image.objects.filter(r2_key="orig.heic").exists()
        assert Image.objects.filter(r2_key="jpeg.jpg").exists()
        assert mock_r2_delete == []

    def test_global_image_fk_skips(self, user, mock_r2_delete):
        """Images referenced by a global-model image field are not deleted."""
        from api.workflow import (
            get_global_model_and_field,
            get_global_names,
            get_image_fields_for_global_model,
        )

        # Find a global model that has at least one image field
        global_with_image = None
        image_field_name = None
        for name in get_global_names():
            try:
                model_cls, _, _ = get_global_model_and_field(name)
            except KeyError:
                continue
            fields = get_image_fields_for_global_model(model_cls)
            if fields:
                global_with_image = model_cls
                image_field_name = fields[0]
                break

        if global_with_image is None:
            pytest.skip("No global model with an image field in this workflow")

        # Create a derived image that is only referenced by the global model
        src = _source_image(user)
        derived = _derived_image(user, src)
        global_obj = global_with_image.objects.first()
        if global_obj is None:
            pytest.skip("No global model instances available")
        setattr(global_obj, image_field_name, derived)
        global_obj.save(update_fields=[image_field_name])

        _gc()

        assert Image.objects.filter(id=derived.id).exists()
        assert mock_r2_delete == []
