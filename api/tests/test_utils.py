import pytest

from api.models import GlazeCombination, GlazeType
from api.utils import (
    cloudinary_getinfo_url,
    crop_to_dict,
    fetch_cloudinary_auto_crop,
    parse_cloudinary_getinfo_crop,
    sync_glaze_type_singleton_combination,
)


class TestCloudinaryCropParsing:
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

    def test_normalizes_pixel_coordinates_from_getinfo(self):
        payload = {
            "input": {"width": 1000, "height": 800},
            "g_auto_info": {"x": 100, "y": 80, "width": 500, "height": 400},
        }

        assert parse_cloudinary_getinfo_crop(payload) == {
            "x": 0.1,
            "y": 0.1,
            "width": 0.5,
            "height": 0.5,
        }

    def test_accepts_nested_w_h_crop_coordinates(self):
        payload = {
            "info": {
                "coordinates": [
                    {"ignored": True},
                    {"x": 0.2, "y": 0.3, "w": 0.4, "h": 0.5},
                ]
            }
        }

        assert parse_cloudinary_getinfo_crop(payload) == {
            "x": 0.2,
            "y": 0.3,
            "width": 0.4,
            "height": 0.5,
        }

    def test_returns_none_when_getinfo_has_no_crop(self):
        assert parse_cloudinary_getinfo_crop({"input": {"width": 100}}) is None

    def test_cloudinary_getinfo_url_uses_documented_transform(self):
        assert cloudinary_getinfo_url("demo", "pieces/mug") == (
            "https://res.cloudinary.com/demo/image/upload/"
            "c_crop,g_auto,w_750/fl_getinfo/v1/pieces/mug"
        )
        assert cloudinary_getinfo_url("", "pieces/mug") is None
        assert cloudinary_getinfo_url("demo", "") is None

    def test_fetch_cloudinary_auto_crop_uses_getinfo_url(self, monkeypatch):
        calls = []

        class Response:
            def raise_for_status(self):
                calls.append("raise_for_status")

            def json(self):
                return {"crop": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}}

        def fake_get(url, timeout):
            calls.append((url, timeout))
            return Response()

        monkeypatch.setattr("api.utils.requests.get", fake_get)

        assert fetch_cloudinary_auto_crop("demo", "pieces/mug", timeout=3) == {
            "x": 0.1,
            "y": 0.2,
            "width": 0.3,
            "height": 0.4,
        }
        assert calls == [
            (cloudinary_getinfo_url("demo", "pieces/mug"), 3),
            "raise_for_status",
        ]

    def test_fetch_cloudinary_auto_crop_skips_missing_identity(self, monkeypatch):
        calls = []
        monkeypatch.setattr("api.utils.requests.get", lambda *args: calls.append(args))

        assert fetch_cloudinary_auto_crop("", "pieces/mug") is None
        assert fetch_cloudinary_auto_crop("demo", "") is None
        assert calls == []

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

    def test_upload_mask_to_cloudinary_uses_cloudinary_sdk(self, monkeypatch, settings):
        import sys
        import types

        from api.utils import upload_mask_to_cloudinary

        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
        monkeypatch.setenv("CLOUDINARY_UPLOAD_FOLDER", "uploads")

        cloudinary = types.ModuleType("cloudinary")
        uploader = types.ModuleType("cloudinary.uploader")
        upload_calls = {}

        def mock_config(**kwargs):
            upload_calls["config"] = kwargs

        def mock_upload(mask_bytes, public_id, folder, overwrite, resource_type):
            upload_calls["upload"] = {
                "mask_bytes": mask_bytes,
                "public_id": public_id,
                "folder": folder,
                "overwrite": overwrite,
                "resource_type": resource_type,
            }
            return {"cloud_name": "demo", "public_id": "mask-public-id"}

        cloudinary.config = mock_config
        uploader.upload = mock_upload
        cloudinary.uploader = uploader

        monkeypatch.setitem(sys.modules, "cloudinary", cloudinary)
        monkeypatch.setitem(sys.modules, "cloudinary.uploader", uploader)

        class DummyImage:
            id = "image-1"

        result = upload_mask_to_cloudinary(b"mask-bytes", DummyImage())
        assert result == {
            "cloud_name": "demo",
            "cloudinary_public_id": "mask-public-id",
        }
        assert upload_calls["config"]["cloud_name"] == "demo"
        assert upload_calls["upload"]["folder"] == "uploads/crop-masks"
        assert upload_calls["upload"]["public_id"] == "image-1"

    def test_upload_mask_to_cloudinary_requires_env(self, monkeypatch):
        from api.utils import upload_mask_to_cloudinary

        monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_SECRET", raising=False)

        class DummyImage:
            id = "image-1"

        with pytest.raises(ValueError):
            upload_mask_to_cloudinary(b"mask-bytes", DummyImage())
