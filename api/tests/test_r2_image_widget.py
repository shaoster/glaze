"""Tests for the admin R2 image widget, form field, and preview helpers."""

import json
import re
import uuid
from pathlib import Path

import pytest

from api.admin import (
    R2ImageFormField,
    R2ImageWidget,
    _admin_image_preview,
    _image_url,
    _json_image_payload,
)

ADMIN_WIDGET_JS = Path(__file__).parents[1] / "static/admin/js/r2_image_widget.js"

IMAGE_URL = "https://media.example.com/images/public/tile.heic"
IMAGE_DICT = {"url": IMAGE_URL}
IMAGE_JSON = json.dumps({"url": IMAGE_URL, "r2_key": "images/public/tile.heic"})


def _set_r2_env(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com")


def _clear_r2_env(monkeypatch):
    for var in (
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_PUBLIC_URL",
    ):
        monkeypatch.delenv(var, raising=False)


class TestImageUrl:
    def test_extracts_url_from_dict(self):
        assert _image_url(IMAGE_DICT) == IMAGE_URL

    def test_returns_string_unchanged(self):
        assert (
            _image_url("https://example.com/img.jpg") == "https://example.com/img.jpg"
        )

    def test_extracts_url_from_prepared_json_string(self):
        assert _image_url(IMAGE_JSON) == IMAGE_URL

    def test_returns_empty_string_for_none(self):
        assert _image_url(None) == ""

    def test_returns_empty_string_for_empty_dict(self):
        assert _image_url({}) == ""

    def test_falls_back_to_dict_url_when_image_to_dict_returns_none(self, monkeypatch):
        monkeypatch.setattr("api.admin.image_to_dict", lambda value: None)
        assert (
            _image_url({"url": "https://example.com/fallback.jpg"})
            == "https://example.com/fallback.jpg"
        )


class TestJsonImagePayload:
    def test_invalid_json_returns_none(self):
        assert _json_image_payload("not json") is None


class TestR2ImageWidgetFormatValue:
    def test_dict_value_rendered_as_bare_url(self):
        assert R2ImageWidget().format_value(IMAGE_DICT) == IMAGE_URL

    def test_none_value_returned_as_none(self):
        assert R2ImageWidget().format_value(None) is None

    def test_url_string_returned_unchanged(self):
        assert R2ImageWidget().format_value(IMAGE_URL) == IMAGE_URL

    def test_legacy_json_string_collapses_to_url(self):
        assert R2ImageWidget().format_value(IMAGE_JSON) == IMAGE_URL


class TestR2ImageWidgetRender:
    def test_unconfigured_r2_returns_plain_input(self, monkeypatch):
        _clear_r2_env(monkeypatch)

        html = R2ImageWidget().render("image_url", None, attrs={"id": "id_image_url"})

        assert "Upload Image" not in html
        assert "r2-upload-btn" not in html

    def test_configured_r2_renders_upload_button_and_file_input(self, monkeypatch):
        _set_r2_env(monkeypatch)

        html = R2ImageWidget().render("image_url", None, attrs={"id": "id_image_url"})

        assert "r2-upload-btn" in html
        assert 'data-file-id="file-id_image_url"' in html
        assert 'type="file"' in html

    def test_value_renders_preview_with_original_url(self, monkeypatch):
        _set_r2_env(monkeypatch)

        html = R2ImageWidget().render(
            "test_tile_image", IMAGE_DICT, attrs={"id": "id_test_tile_image"}
        )

        assert "r2-image-preview" in html
        assert IMAGE_URL in html
        assert "data-full-url" in html
        assert "display:block" in html

    def test_value_stored_as_bare_url_in_input(self, monkeypatch):
        _set_r2_env(monkeypatch)

        html = R2ImageWidget().render(
            "test_tile_image", IMAGE_DICT, attrs={"id": "id_test_tile_image"}
        )

        match = re.search(r'value="([^"]*)"', html)
        assert match is not None
        assert match.group(1) == IMAGE_URL

    def test_preview_hidden_when_value_is_none(self, monkeypatch):
        _set_r2_env(monkeypatch)

        html = R2ImageWidget().render(
            "test_tile_image", None, attrs={"id": "id_test_tile_image"}
        )

        assert "display:none" in html


@pytest.mark.django_db
class TestR2ImageFormField:
    def test_prepare_value_returns_none_for_missing_uuid_lookup(self):
        field = R2ImageFormField()
        assert field.prepare_value(uuid.uuid4()) is None

    def test_prepare_value_returns_url_for_image_row(self, monkeypatch):
        from api.models import Image

        image = Image.objects.create(url=IMAGE_URL, r2_key="images/public/tile.heic")
        field = R2ImageFormField()
        assert field.prepare_value(image.pk) == IMAGE_URL

    def test_clean_url_string_returns_image_row(self):
        field = R2ImageFormField(required=False)
        image = field.clean(f"  {IMAGE_URL}  ")
        assert image is not None
        assert image.url == IMAGE_URL

    def test_clean_legacy_json_payload_returns_image_row(self):
        field = R2ImageFormField(required=False)
        image = field.clean(json.dumps({"url": IMAGE_URL}))
        assert image is not None
        assert image.url == IMAGE_URL

    def test_clean_empty_value_returns_none(self):
        field = R2ImageFormField(required=False)
        assert field.clean("") is None


class TestR2ImageWidgetJavascript:
    def test_upload_writes_bare_public_url_into_input(self):
        script = ADMIN_WIDGET_JS.read_text()

        assert "/api/uploads/r2/presigned-url/" in script
        assert "inp.value = publicUrl;" in script
        assert "method: 'POST'" in script
        assert "JSON.stringify" in script  # presign request body only


class TestAdminImagePreview:
    def test_returns_dash_for_none(self):
        assert _admin_image_preview(None) == "—"

    def test_returns_dash_for_empty_string(self):
        assert _admin_image_preview("") == "—"

    def test_renders_img_tag_with_original_url(self):
        html = _admin_image_preview(IMAGE_DICT)
        assert '<img src="' in html
        assert 'class="r2-image-preview"' in html
        assert f'data-full-url="{IMAGE_URL}"' in html
