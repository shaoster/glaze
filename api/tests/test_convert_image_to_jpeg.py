"""Tests for the convert_image_to_jpeg Celery task and its HTTP endpoints."""

import io
import re
import uuid
from unittest import mock
from unittest.mock import AsyncMock, MagicMock

import pytest
from PIL import Image as PILImage

R2_ENV = {
    "R2_ACCOUNT_ID": "test-account",
    "R2_ACCESS_KEY_ID": "test-key",
    "R2_SECRET_ACCESS_KEY": "test-secret",
    "R2_BUCKET_NAME": "test-bucket",
    "R2_PUBLIC_URL": "https://media.example.com",
}

CONVERT_ENDPOINT = "/api/uploads/r2/convert-image/"


def _make_tiny_jpeg() -> bytes:
    img = PILImage.new("RGB", (4, 4), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_tiny_png() -> bytes:
    img = PILImage.new("RGB", (4, 4), color=(32, 64, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def r2_env(monkeypatch):
    for key, value in R2_ENV.items():
        monkeypatch.setenv(key, value)


# ---------------------------------------------------------------------------
# convert_image_to_jpeg task
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConvertImageToJpegTask:
    def _make_task(self, user, key):
        from api.models import AsyncTask

        return AsyncTask.objects.create(
            user=user,
            task_type="convert_image_to_jpeg",
            input_params={"key": key},
        )

    def _mock_modal(self, monkeypatch, *, width=4, height=4):
        """Mock _modal_function and r2.generate_presigned_put for convert task."""
        modal_calls = []

        def _mock_fn(app_name, fn_name):
            fn_mock = MagicMock()
            fn_mock.remote = MagicMock()
            fn_mock.remote.aio = AsyncMock(
                return_value={"width": width, "height": height},
                side_effect=lambda *a, **kw: modal_calls.append(a)
                or {"width": width, "height": height},
            )
            return fn_mock

        monkeypatch.setattr("api.tasks._modal_function", _mock_fn)
        monkeypatch.setattr(
            "api.r2.generate_presigned_put",
            lambda key, content_type, **kwargs: f"https://presigned.example.com/{key}",
        )
        monkeypatch.setattr(
            "api.r2.public_url_for_key",
            lambda k: f"https://media.example.com/{k}",
        )
        return modal_calls

    def test_converts_png_to_jpeg_and_keeps_original(self, user, r2_env, monkeypatch):
        from api.models import Image
        from api.tasks import convert_image_to_jpeg

        key = f"images/{user.id}/{uuid.uuid4()}.png"
        modal_calls = self._mock_modal(monkeypatch)

        task = self._make_task(user, key)
        result = convert_image_to_jpeg(task)

        assert result["status"] == "success"
        assert result["key"].endswith(".jpg")
        assert re.fullmatch(rf"images/{user.id}/[0-9a-f-]{{36}}\.jpg", result["key"])
        # Return value includes dimensions from Modal.
        assert result["width"] == 4
        assert result["height"] == 4
        # Modal was called with the source public URL and a presigned PUT URL.
        assert len(modal_calls) == 1
        source_public_url, presigned_put = modal_calls[0]
        assert source_public_url == f"https://media.example.com/{key}"
        assert result["key"] in presigned_put

        # A new JPEG Image row is created with lineage; the source is kept.
        jpeg_img = Image.objects.get(r2_key=result["key"])
        assert jpeg_img.derived_type == "jpeg_conversion"
        assert jpeg_img.derived_from is not None
        # Source Image row must also exist (created by the task).
        source_img = Image.objects.get(url=f"https://media.example.com/{key}")
        assert source_img.r2_key == key
        assert jpeg_img.derived_from_id == source_img.id

    def test_skips_when_r2_not_configured(self, user, monkeypatch):
        from api.tasks import convert_image_to_jpeg

        for k in R2_ENV:
            monkeypatch.delenv(k, raising=False)

        task = self._make_task(user, "images/x/a.heic")
        result = convert_image_to_jpeg(task)
        assert result["status"] == "skipped"

    def test_raises_on_missing_key(self, user, r2_env):
        from api.models import AsyncTask
        from api.tasks import convert_image_to_jpeg

        task = AsyncTask.objects.create(
            user=user,
            task_type="convert_image_to_jpeg",
            input_params={},
        )
        with pytest.raises(ValueError, match="Missing key"):
            convert_image_to_jpeg(task)

    def test_creates_jpeg_image_row_with_lineage_when_image_id_provided(
        self, user, r2_env, monkeypatch
    ):
        from api.models import AsyncTask, Image
        from api.tasks import convert_image_to_jpeg

        source_image = Image.objects.create(
            user=user,
            url=f"https://media.example.com/images/{user.id}/orig.png",
            r2_key=f"images/{user.id}/orig.png",
        )
        key = source_image.r2_key
        self._mock_modal(monkeypatch)

        task = AsyncTask.objects.create(
            user=user,
            task_type="convert_image_to_jpeg",
            input_params={"key": key, "image_id": str(source_image.id)},
        )
        result = convert_image_to_jpeg(task)

        # Source Image row must be unchanged.
        source_image.refresh_from_db()
        assert source_image.url == f"https://media.example.com/{key}"
        assert source_image.r2_key == key

        # A new JPEG Image row must have been created with lineage.
        jpeg_image = Image.objects.get(url=result["url"])
        assert jpeg_image.r2_key.endswith(".jpg")
        assert jpeg_image.derived_from_id == source_image.id
        assert jpeg_image.derived_type == "jpeg_conversion"


# ---------------------------------------------------------------------------
# POST /api/uploads/r2/convert-image/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestR2ConvertImageEndpoint:
    def test_returns_401_unauthenticated(self, client, r2_env):
        client.force_authenticate(user=None)
        response = client.post(
            CONVERT_ENDPOINT,
            {"key": "images/1/abc.png"},
            format="json",
        )
        assert response.status_code == 401

    def test_returns_503_when_not_configured(self, client, monkeypatch):
        for k in R2_ENV:
            monkeypatch.delenv(k, raising=False)
        response = client.post(
            CONVERT_ENDPOINT, {"key": "images/1/abc.png"}, format="json"
        )
        assert response.status_code == 503

    def test_returns_400_for_missing_key(self, client, r2_env):
        response = client.post(CONVERT_ENDPOINT, {}, format="json")
        assert response.status_code == 400

    def test_returns_403_for_other_users_key(self, client, user, r2_env):
        other_id = uuid.uuid4()
        response = client.post(
            CONVERT_ENDPOINT,
            {"key": f"images/{other_id}/abc.png"},
            format="json",
        )
        assert response.status_code == 403

    def test_returns_no_task_for_jpeg(self, client, user, r2_env):
        response = client.post(
            CONVERT_ENDPOINT,
            {"key": f"images/{user.id}/abc.jpg"},
            format="json",
        )
        assert response.status_code == 200
        body = response.json()
        assert body["needs_conversion"] is False
        assert body["task_id"] is None

    def test_enqueues_task_for_non_jpeg(self, client, user, r2_env):
        with mock.patch("api.tasks.get_task_interface") as mock_iface:
            mock_iface.return_value.submit = mock.Mock()
            response = client.post(
                CONVERT_ENDPOINT,
                {"key": f"images/{user.id}/{uuid.uuid4()}.heic"},
                format="json",
            )

        assert response.status_code == 202
        body = response.json()
        assert body["needs_conversion"] is True
        assert body["task_id"] is not None
        mock_iface.return_value.submit.assert_called_once()


# ---------------------------------------------------------------------------
# GET /api/uploads/r2/convert-image/<task_id>/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestR2ConvertImageStatusEndpoint:
    def _make_task(self, user, status="pending", result=None):
        from api.models import AsyncTask

        return AsyncTask.objects.create(
            user=user,
            task_type="convert_image_to_jpeg",
            status=status,
            result=result,
            input_params={"key": f"images/{user.id}/abc.heic"},
        )

    def test_returns_pending_status(self, client, user):
        task = self._make_task(user, status="pending")
        response = client.get(f"{CONVERT_ENDPOINT}{task.id}/")
        assert response.status_code == 200
        assert response.json()["status"] == "pending"
        assert response.json()["result"] is None

    def test_returns_result_on_success(self, client, user):
        result = {
            "url": "https://media.example.com/images/1/new.jpg",
            "key": "images/1/new.jpg",
            "width": 400,
            "height": 300,
        }
        task = self._make_task(user, status="success", result=result)
        response = client.get(f"{CONVERT_ENDPOINT}{task.id}/")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "success"
        assert body["result"]["url"] == result["url"]

    def test_returns_404_for_other_users_task(self, client, other_user):
        from api.models import AsyncTask

        task = AsyncTask.objects.create(
            user=other_user,
            task_type="convert_image_to_jpeg",
            input_params={"key": f"images/{other_user.id}/abc.heic"},
        )
        response = client.get(f"{CONVERT_ENDPOINT}{task.id}/")
        assert response.status_code == 404

    def test_returns_404_for_wrong_task_type(self, client, user):
        from api.models import AsyncTask

        task = AsyncTask.objects.create(
            user=user,
            task_type="generate_cropped_image",
            input_params={"image_id": str(uuid.uuid4()), "crop": {}},
        )
        response = client.get(f"{CONVERT_ENDPOINT}{task.id}/")
        assert response.status_code == 404
