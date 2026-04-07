import hashlib

import pytest


@pytest.mark.django_db
class TestCloudinaryUploadSignature:
    def test_returns_503_when_not_configured(self, client, monkeypatch):
        monkeypatch.delenv('CLOUDINARY_CLOUD_NAME', raising=False)
        monkeypatch.delenv('CLOUDINARY_API_KEY', raising=False)
        monkeypatch.delenv('CLOUDINARY_API_SECRET', raising=False)

        response = client.post('/api/uploads/cloudinary/signature/', {}, format='json')

        assert response.status_code == 503
        assert response.json()['detail'] == 'Cloudinary is not configured on the server.'

    def test_returns_signed_upload_payload(self, client, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'public-api-key')
        monkeypatch.setenv('CLOUDINARY_API_SECRET', 'super-secret')
        monkeypatch.setenv('CLOUDINARY_UPLOAD_FOLDER', 'glaze')
        monkeypatch.setenv('CLOUDINARY_UPLOAD_PRESET', 'glaze_signed')

        with monkeypatch.context() as m:
            m.setattr('api.views.time.time', lambda: 1_700_000_000)
            response = client.post('/api/uploads/cloudinary/signature/', {}, format='json')

        assert response.status_code == 200
        data = response.json()

        expected_signing_string = 'folder=glaze&timestamp=1700000000&upload_preset=glaze_signed'
        expected_signature = hashlib.sha1(
            f'{expected_signing_string}super-secret'.encode('utf-8')
        ).hexdigest()

        assert data == {
            'cloud_name': 'demo-cloud',
            'api_key': 'public-api-key',
            'timestamp': 1700000000,
            'signature': expected_signature,
            'upload_url': 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
            'folder': 'glaze',
            'upload_preset': 'glaze_signed',
        }
