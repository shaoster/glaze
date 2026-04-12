import pytest
from django.test import RequestFactory

from api.admin import CloudinaryImageWidget


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
