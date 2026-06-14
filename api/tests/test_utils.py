import pytest

from api.models import (
    AsyncTask,
    CropRun,
    GlazeCombination,
    GlazeType,
    Image,
    Piece,
    PieceState,
    PieceStateImage,
)
from api.utils import (
    _is_crop_task_failed,
    crop_to_dict,
    replace_piece_state_images,
    sync_glaze_type_singleton_combination,
)


class TestCropToDict:
    def test_crop_to_dict_rejects_missing_and_invalid_values(self):
        assert crop_to_dict(None) is None
        assert crop_to_dict({"x": 0, "y": 0, "width": 0, "height": 1}) is None
        assert crop_to_dict({"x": "bad", "y": 0, "width": 1, "height": 1}) is None

    def test_crop_to_dict_clamps_relative_values(self):
        assert crop_to_dict({"x": -0.2, "y": 1.2, "width": 1.5, "height": 0.5}) == {
            "x": 0.0,
            "y": 1.0,
            "width": 1.0,
            "height": 0.5,
        }


@pytest.mark.django_db
class TestSyncGlazeTypeSingletonCombination:
    def test_creates_singleton_combination_for_public_glaze_type(self):
        glaze_type = GlazeType.objects.create(
            user=None,
            name="Floating Blue",
            runs=True,
            is_food_safe=False,
        )

        sync_glaze_type_singleton_combination(glaze_type)

        combo = GlazeCombination.objects.get(user=None, name="Floating Blue")
        assert combo.runs is True
        assert combo.is_food_safe is False
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["Floating Blue"]

    def test_renames_existing_singleton_combination(self):
        glaze_type = GlazeType.objects.create(user=None, name="New Name", runs=False)
        combo = GlazeCombination.objects.create(user=None, name="Old Name")

        sync_glaze_type_singleton_combination(glaze_type, old_name="Old Name")

        combo.refresh_from_db()
        assert combo.name == "New Name"
        assert combo.runs is False
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["New Name"]

    def test_updates_existing_singleton_properties_without_replacing_matching_layer(
        self,
    ):
        glaze_type = GlazeType.objects.create(
            user=None, name="Tenmoku", runs=False, is_food_safe=None
        )
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[glaze_type]
        )
        original_layer_id = combo.layers.get().id

        glaze_type.runs = True
        glaze_type.is_food_safe = True
        sync_glaze_type_singleton_combination(glaze_type)

        combo.refresh_from_db()
        assert combo.runs is True
        assert combo.is_food_safe is True
        assert combo.layers.get().id == original_layer_id


class TestUtilsCoverage:
    def test_get_rss_error_path(self, monkeypatch):
        from api.utils import get_rss

        # Mock open to raise FileNotFoundError
        def mock_open(*args, **kwargs):
            raise FileNotFoundError()

        monkeypatch.setattr("builtins.open", mock_open)
        assert get_rss() == 0.0

    def test_calculate_subject_mask_remote_no_url(self, settings):
        from api.utils import calculate_subject_mask_remote

        settings.REMOTE_REMBG_URL = None
        assert calculate_subject_mask_remote(image_bytes=b"data") is None

    def test_calculate_subject_mask_remote_request_failure(self, monkeypatch, settings):
        from api.utils import calculate_subject_mask_remote

        settings.REMOTE_REMBG_URL = "http://remote"

        class MockResponse:
            def raise_for_status(self):
                import requests

                raise requests.exceptions.HTTPError("error")

        def mock_post(*args, **kwargs):
            return MockResponse()

        monkeypatch.setattr("requests.post", mock_post)
        assert calculate_subject_mask_remote(image_bytes=b"data") is None

    def test_calculate_subject_mask_remote_adds_auth_header(
        self, monkeypatch, settings
    ):
        from api.utils import calculate_subject_mask_remote

        settings.REMOTE_REMBG_URL = "http://remote"
        settings.MODAL_AUTH_TOKEN = "secret"

        captured = {}

        class MockResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {"mask": None}

        def mock_post(*args, **kwargs):
            captured["kwargs"] = kwargs
            return MockResponse()

        monkeypatch.setattr("requests.post", mock_post)
        assert calculate_subject_mask_remote(image_bytes=b"data") == {"mask": None}
        assert captured["kwargs"]["headers"]["X-API-Key"] == "secret"
        assert (
            captured["kwargs"]["headers"]["Content-Type"] == "application/octet-stream"
        )

    def test_calculate_subject_mask_remote_missing_input_returns_none(self, settings):
        from api.utils import calculate_subject_mask_remote

        settings.REMOTE_REMBG_URL = "http://remote"
        assert calculate_subject_mask_remote() is None

    def test_upload_mask_to_r2_uses_r2_helpers(self, monkeypatch):
        from api.utils import upload_mask_to_r2

        upload_calls = {}

        monkeypatch.setattr("api.r2.is_r2_configured", lambda: True)

        def mock_upload_bytes(key, data, content_type):
            upload_calls["upload"] = {
                "key": key,
                "data": data,
                "content_type": content_type,
            }
            return f"https://media.example.com/{key}"

        monkeypatch.setattr("api.r2.upload_bytes", mock_upload_bytes)

        class DummyImage:
            id = "image-1"

        result = upload_mask_to_r2(b"mask-bytes", DummyImage())
        assert result == {
            "r2_key": "crop-masks/image-1.png",
            "url": "https://media.example.com/crop-masks/image-1.png",
        }
        assert upload_calls["upload"]["data"] == b"mask-bytes"
        assert upload_calls["upload"]["content_type"] == "image/png"

    def test_upload_mask_to_r2_requires_config(self, monkeypatch):
        from api.utils import upload_mask_to_r2

        monkeypatch.setattr("api.r2.is_r2_configured", lambda: False)

        class DummyImage:
            id = "image-1"

        with pytest.raises(ValueError):
            upload_mask_to_r2(b"mask-bytes", DummyImage())


@pytest.mark.django_db
class TestReplacePieceStateImages:
    def test_nulls_crop_run_fk_when_replacing_images(self, django_user_model):
        user = django_user_model.objects.create(
            username="test@example.com", email="test@example.com"
        )
        image = Image.objects.create(
            url="https://media.example.com/images/1/test.jpg",
            r2_key="images/1/test.jpg",
            user=user,
        )
        piece = Piece.objects.create(user=user, name="Test Piece", thumbnail=image)
        state = PieceState.objects.create(piece=piece, state="designed", order=1)
        psi = PieceStateImage.objects.create(piece_state=state, image=image, order=0)
        crop_run = CropRun.objects.create(
            image=image,
            piece_state_image=psi,
            source={
                "type": "automated",
                "backend": "rembg-u2net",
                "deployment": "modal",
                "version": None,
            },
            status=CropRun.Status.SUCCESS,
        )

        replace_piece_state_images(state, [])

        assert not PieceStateImage.objects.filter(pk=psi.pk).exists()
        crop_run.refresh_from_db()
        assert crop_run.piece_state_image is None


CROP_A = {"x": 0.1, "y": 0.2, "width": 0.6, "height": 0.5}
CROP_B = {"x": 0.0, "y": 0.0, "width": 0.5, "height": 0.5}


@pytest.mark.django_db
class TestIsCropTaskFailed:
    def _make_image(self, user):
        return Image.objects.create(
            user=user,
            url="https://media.example.com/images/1/test.jpg",
            r2_key="images/1/test.jpg",
        )

    def _make_task(self, user, image, crop, status):
        return AsyncTask.objects.create(
            user=user,
            task_type="generate_cropped_image",
            input_params={"image_id": str(image.id), "crop": crop},
            status=status,
        )

    def test_false_when_no_task_exists(self, user):
        image = self._make_image(user)
        assert not _is_crop_task_failed(image.id, image.r2_key, CROP_A)

    def test_true_when_latest_task_for_exact_crop_failed(self, user):
        image = self._make_image(user)
        self._make_task(user, image, CROP_A, AsyncTask.Status.FAILURE)
        assert _is_crop_task_failed(image.id, image.r2_key, CROP_A)

    def test_false_when_failure_is_for_different_crop_on_same_image(self, user):
        """Bug regression: old failure for CROP_B must not block CROP_A."""
        image = self._make_image(user)
        self._make_task(user, image, CROP_B, AsyncTask.Status.FAILURE)
        assert not _is_crop_task_failed(image.id, image.r2_key, CROP_A)

    def test_false_when_latest_task_is_pending_after_earlier_failure(self, user):
        """A new PENDING task after a previous FAILURE should clear the failed state."""
        image = self._make_image(user)
        self._make_task(user, image, CROP_A, AsyncTask.Status.FAILURE)
        self._make_task(user, image, CROP_A, AsyncTask.Status.PENDING)
        assert not _is_crop_task_failed(image.id, image.r2_key, CROP_A)

    def test_false_when_r2_key_is_none(self, user):
        image = self._make_image(user)
        self._make_task(user, image, CROP_A, AsyncTask.Status.FAILURE)
        assert not _is_crop_task_failed(image.id, None, CROP_A)

    def test_false_when_crop_is_none(self, user):
        image = self._make_image(user)
        self._make_task(user, image, CROP_A, AsyncTask.Status.FAILURE)
        assert not _is_crop_task_failed(image.id, image.r2_key, None)
