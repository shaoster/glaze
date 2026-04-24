import io
import json

import pytest
from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from api.models import GlazeCombination, GlazeType

URL = '/api/admin/manual-square-crop-import/'


def _png_upload(name: str = 'crop.png') -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new('RGBA', (16, 16), (255, 0, 0, 0)).save(buf, format='PNG')
    return SimpleUploadedFile(name, buf.getvalue(), content_type='image/png')


@pytest.mark.django_db
class TestManualSquareCropImport:
    def test_requires_admin_user(self):
        user = User.objects.create(username='potter@example.com', email='potter@example.com')
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(URL, {'payload': json.dumps({'records': []})})

        assert response.status_code == 403

    def test_creates_public_glaze_type_and_single_layer_combination(self, monkeypatch):
        admin = User.objects.create(username='admin@example.com', email='admin@example.com', is_staff=True)
        client = APIClient()
        client.force_authenticate(user=admin)

        upload_calls = []

        def fake_upload(file_obj, **kwargs):
            upload_calls.append(kwargs)
            return {
                'secure_url': 'https://example.com/manual-square-crop/type.png',
                'public_id': 'manual-square-crop/type',
            }

        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'demo-key')
        monkeypatch.setenv('CLOUDINARY_API_SECRET', 'demo-secret')
        monkeypatch.setattr('api.manual_tile_imports.cloudinary.uploader.upload', fake_upload)

        payload = {
            'records': [
                {
                    'client_id': 'rec-1',
                    'filename': 'dragon-green.png',
                    'reviewed': True,
                    'parsed_fields': {
                        'name': 'Dragon Green',
                        'kind': 'glaze_type',
                        'first_glaze': '',
                        'second_glaze': '',
                        'runs': None,
                        'is_food_safe': None,
                    },
                },
            ],
        }

        response = client.post(
            URL,
            {
                'payload': json.dumps(payload),
                'crop_image__rec-1': _png_upload(),
            },
            format='multipart',
        )

        assert response.status_code == 200
        body = response.json()
        assert body['summary'] == {
            'created_glaze_types': 1,
            'created_glaze_combinations': 0,
            'skipped_duplicates': 0,
            'errors': 0,
        }
        assert body['results'][0]['status'] == 'created'
        glaze_type = GlazeType.objects.get(user=None, name='Dragon Green')
        assert glaze_type.test_tile_image == 'https://example.com/manual-square-crop/type.png'
        assert glaze_type.runs is None
        assert glaze_type.is_food_safe is None
        combo = GlazeCombination.objects.get(user=None, name='Dragon Green')
        assert list(combo.layers.order_by('order').values_list('glaze_type__name', flat=True)) == ['Dragon Green']
        assert len(upload_calls) == 1

    def test_runs_and_food_safe_written_to_created_glaze_type(self, monkeypatch):
        admin = User.objects.create(username='admin3@example.com', email='admin3@example.com', is_staff=True)
        client = APIClient()
        client.force_authenticate(user=admin)

        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'demo-key')
        monkeypatch.setenv('CLOUDINARY_API_SECRET', 'demo-secret')
        monkeypatch.setattr(
            'api.manual_tile_imports.cloudinary.uploader.upload',
            lambda *a, **kw: {'secure_url': 'https://example.com/caution.png', 'public_id': 'caution'},
        )

        payload = {
            'records': [
                {
                    'client_id': 'rec-runs',
                    'filename': 'caution.png',
                    'reviewed': True,
                    'parsed_fields': {
                        'name': 'Caution Drip',
                        'kind': 'glaze_type',
                        'first_glaze': '',
                        'second_glaze': '',
                        'runs': True,
                        'is_food_safe': False,
                    },
                },
            ],
        }

        response = client.post(
            URL,
            {'payload': json.dumps(payload), 'crop_image__rec-runs': _png_upload('caution.png')},
            format='multipart',
        )

        assert response.status_code == 200
        glaze_type = GlazeType.objects.get(user=None, name='Caution Drip')
        assert glaze_type.runs is True
        assert glaze_type.is_food_safe is False

    def test_skips_duplicate_public_glaze_type_without_uploading(self, monkeypatch):
        admin = User.objects.create(username='admin2@example.com', email='admin2@example.com', is_staff=True)
        existing = GlazeType.objects.create(user=None, name='Celadon', test_tile_image='https://example.com/existing.png')
        client = APIClient()
        client.force_authenticate(user=admin)

        def fail_upload(*args, **kwargs):
            raise AssertionError('upload should not be called for duplicates')

        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'demo-key')
        monkeypatch.setenv('CLOUDINARY_API_SECRET', 'demo-secret')
        monkeypatch.setattr('api.manual_tile_imports.cloudinary.uploader.upload', fail_upload)

        payload = {
            'records': [
                {
                    'client_id': 'rec-dup',
                    'filename': 'celadon.png',
                    'reviewed': True,
                    'parsed_fields': {
                        'name': 'Celadon',
                        'kind': 'glaze_type',
                        'first_glaze': '',
                        'second_glaze': '',
                    },
                },
            ],
        }

        response = client.post(
            URL,
            {
                'payload': json.dumps(payload),
                'crop_image__rec-dup': _png_upload('celadon.png'),
            },
            format='multipart',
        )

        assert response.status_code == 200
        body = response.json()
        assert body['summary']['skipped_duplicates'] == 1
        assert body['results'][0]['status'] == 'skipped_duplicate'
        assert body['results'][0]['object_id'] == str(existing.pk)

    def test_rejects_missing_payload(self):
        admin = User.objects.create(username='admin4@example.com', email='admin4@example.com', is_staff=True)
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(URL, {}, format='multipart')

        assert response.status_code == 400
        assert response.json() == {'detail': 'payload is required.'}

    def test_rejects_invalid_json_payload(self):
        admin = User.objects.create(username='admin5@example.com', email='admin5@example.com', is_staff=True)
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(URL, {'payload': '{not-json'}, format='multipart')

        assert response.status_code == 400
        assert response.json() == {'detail': 'payload must be valid JSON.'}

    def test_rejects_unreviewed_records(self):
        admin = User.objects.create(username='admin6@example.com', email='admin6@example.com', is_staff=True)
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(
            URL,
            {'payload': json.dumps({'records': [{'client_id': 'rec-1', 'reviewed': False}]})},
            format='multipart',
        )

        assert response.status_code == 400
        assert response.json() == {'detail': 'All records must be reviewed before import.'}

    def test_rejects_record_without_client_id(self):
        admin = User.objects.create(username='admin7@example.com', email='admin7@example.com', is_staff=True)
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(
            URL,
            {'payload': json.dumps({'records': [{'reviewed': True}]})},
            format='multipart',
        )

        assert response.status_code == 400
        assert response.json() == {'detail': 'Each record must include client_id.'}
