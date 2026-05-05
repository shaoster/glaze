import json

import pytest

from api.admin import (
    CloudinaryImageWidget,
    _cloudinary_lightbox_url,
    _cloudinary_preview_url,
    _cloudinary_public_id,
    _image_url,
)

HEIC_URL = (
    'https://res.cloudinary.com/demo-cloud/image/upload'
    '/v1776304349/glaze_public/eyy9whpmb5wajybtfk3p.heic'
)
HEIC_PUBLIC_ID = 'glaze_public/eyy9whpmb5wajybtfk3p'

HEIC_IMAGE_DICT = {'url': HEIC_URL, 'cloudinary_public_id': HEIC_PUBLIC_ID}


class TestCloudinaryPublicId:
    def test_extracts_public_id_with_version(self):
        assert _cloudinary_public_id(HEIC_URL) == HEIC_PUBLIC_ID

    def test_extracts_public_id_without_version(self):
        url = 'https://res.cloudinary.com/demo/image/upload/glaze_public/img.jpg'
        assert _cloudinary_public_id(url) == 'glaze_public/img'

    def test_returns_none_for_non_cloudinary_url(self):
        assert _cloudinary_public_id('https://example.com/img.jpg') is None

    def test_returns_none_for_empty_string(self):
        assert _cloudinary_public_id('') is None


class TestImageUrl:
    def test_extracts_url_from_dict(self):
        assert _image_url({'url': 'https://example.com/img.jpg', 'cloudinary_public_id': 'img'}) == 'https://example.com/img.jpg'

    def test_returns_string_unchanged(self):
        assert _image_url('https://example.com/img.jpg') == 'https://example.com/img.jpg'

    def test_returns_empty_string_for_none(self):
        assert _image_url(None) == ''

    def test_returns_empty_string_for_empty_dict(self):
        assert _image_url({}) == ''


class TestCloudinaryPreviewUrl:
    def test_returns_jpg_thumbnail_url_from_string(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        result = _cloudinary_preview_url(HEIC_URL)
        assert result.endswith('.jpg')
        assert 'w_200' in result
        assert 'h_200' in result
        assert 'c_fill' in result
        assert result.startswith('https://')

    def test_returns_jpg_thumbnail_url_from_dict(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        result = _cloudinary_preview_url(HEIC_IMAGE_DICT)
        assert result.endswith('.jpg')
        assert 'w_200' in result
        # public_id used directly from dict — no URL parsing needed
        assert HEIC_PUBLIC_ID.split('/')[-1] in result

    def test_dict_uses_stored_public_id_not_url_parse(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        img = {'url': HEIC_URL, 'cloudinary_public_id': 'explicit/public-id'}
        result = _cloudinary_preview_url(img)
        assert 'explicit' in result

    def test_returns_original_when_no_cloud_name(self, monkeypatch):
        monkeypatch.delenv('CLOUDINARY_CLOUD_NAME', raising=False)
        assert _cloudinary_preview_url(HEIC_URL) == HEIC_URL

    def test_returns_empty_for_none(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        assert _cloudinary_preview_url(None) == ''

    def test_returns_empty_for_empty_string(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        assert _cloudinary_preview_url('') == ''

    def test_returns_original_for_non_cloudinary_url(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        url = 'https://example.com/img.jpg'
        assert _cloudinary_preview_url(url) == url


class TestCloudinaryLightboxUrl:
    def test_returns_jpg_url_without_size_constraint_from_string(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        result = _cloudinary_lightbox_url(HEIC_URL)
        assert result.endswith('.jpg')
        assert 'w_200' not in result
        assert result.startswith('https://')

    def test_returns_jpg_url_from_dict(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        result = _cloudinary_lightbox_url(HEIC_IMAGE_DICT)
        assert result.endswith('.jpg')
        assert result.startswith('https://')

    def test_dict_value_must_include_public_id_key(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        with pytest.raises(AssertionError, match='cloudinary_public_id'):
            _cloudinary_lightbox_url({'url': HEIC_URL})

    def test_returns_original_when_no_cloud_name(self, monkeypatch):
        monkeypatch.delenv('CLOUDINARY_CLOUD_NAME', raising=False)
        assert _cloudinary_lightbox_url(HEIC_URL) == HEIC_URL


class TestCloudinaryImageWidgetFormatValue:
    def test_dict_value_encoded_as_json_string(self):
        widget = CloudinaryImageWidget()
        result = widget.format_value({'url': HEIC_URL, 'cloudinary_public_id': HEIC_PUBLIC_ID})
        parsed = json.loads(result)
        assert parsed['url'] == HEIC_URL
        assert parsed['cloudinary_public_id'] == HEIC_PUBLIC_ID

    def test_none_value_returned_as_none(self):
        assert CloudinaryImageWidget().format_value(None) is None

    def test_string_value_returned_unchanged(self):
        assert CloudinaryImageWidget().format_value(HEIC_URL) == HEIC_URL


class TestCloudinaryImageWidgetRender:
    def test_no_cloudinary_config_returns_plain_input(self, monkeypatch):
        monkeypatch.delenv('CLOUDINARY_CLOUD_NAME', raising=False)
        monkeypatch.delenv('CLOUDINARY_API_KEY', raising=False)
        monkeypatch.delenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', raising=False)

        html = CloudinaryImageWidget().render('image_url', None, attrs={'id': 'id_image_url'})

        assert 'Upload Image' not in html
        assert 'cloudinary' not in html.lower()

    def test_cloudinary_configured_no_folder_renders_disabled_button(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.delenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', raising=False)

        html = CloudinaryImageWidget().render('image_url', None, attrs={'id': 'id_image_url'})

        assert 'disabled' in html
        assert 'CLOUDINARY_PUBLIC_UPLOAD_FOLDER must be set' in html
        assert 'cloudinary-upload-btn' not in html

    def test_cloudinary_configured_with_folder_renders_enabled_button(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.setenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', 'glaze-public')

        html = CloudinaryImageWidget().render('image_url', None, attrs={'id': 'id_image_url'})

        assert 'cloudinary-upload-btn' in html
        assert 'disabled' not in html
        assert 'CLOUDINARY_PUBLIC_UPLOAD_FOLDER must be set' not in html
        assert 'data-cloudinary-folder="glaze-public"' in html

    def test_folder_passed_as_data_attribute(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.setenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', 'my-folder')

        html = CloudinaryImageWidget().render('image_url', None, attrs={'id': 'id_image_url'})

        assert 'data-cloudinary-folder="my-folder"' in html

    def test_whitespace_only_folder_treated_as_unset(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.setenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', '   ')

        html = CloudinaryImageWidget().render('image_url', None, attrs={'id': 'id_image_url'})

        assert 'disabled' in html
        assert 'CLOUDINARY_PUBLIC_UPLOAD_FOLDER must be set' in html

    def test_dict_value_renders_jpg_preview(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.setenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', 'glaze-public')

        html = CloudinaryImageWidget().render(
            'test_tile_image', HEIC_IMAGE_DICT, attrs={'id': 'id_test_tile_image'}
        )

        assert 'cloudinary-preview' in html
        assert 'w_200' in html
        assert 'data-full-url' in html
        assert '.heic' not in html.split('src=')[1].split('"')[1]

    def test_dict_value_stored_as_json_in_input(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.setenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', 'glaze-public')

        html = CloudinaryImageWidget().render(
            'test_tile_image', HEIC_IMAGE_DICT, attrs={'id': 'id_test_tile_image'}
        )

        # The input's value attribute should be the JSON-encoded dict.
        import re
        match = re.search(r'value="([^"]*)"', html)
        assert match is not None
        stored = json.loads(match.group(1).replace('&quot;', '"'))
        assert stored['url'] == HEIC_URL
        assert stored['cloudinary_public_id'] == HEIC_PUBLIC_ID

    def test_preview_hidden_when_value_is_none(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.setenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', 'glaze-public')

        html = CloudinaryImageWidget().render('test_tile_image', None, attrs={'id': 'id_test_tile_image'})

        assert 'display:none' in html

    def test_preview_shown_when_dict_value_present(self, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'api-key')
        monkeypatch.setenv('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', 'glaze-public')

        html = CloudinaryImageWidget().render(
            'test_tile_image', HEIC_IMAGE_DICT, attrs={'id': 'id_test_tile_image'}
        )

        assert 'display:block' in html
