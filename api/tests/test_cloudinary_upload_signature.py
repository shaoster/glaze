import hashlib

import pytest


@pytest.mark.django_db
class TestCloudinaryWidgetConfig:
    def test_returns_503_when_not_configured(self, client, monkeypatch):
        monkeypatch.delenv('CLOUDINARY_CLOUD_NAME', raising=False)
        monkeypatch.delenv('CLOUDINARY_API_KEY', raising=False)

        response = client.get('/api/uploads/cloudinary/widget-config/')

        assert response.status_code == 503
        assert response.json()['detail'] == 'Cloudinary is not configured on the server.'

    def test_returns_config_without_folder(self, client, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'public-api-key')
        monkeypatch.delenv('CLOUDINARY_UPLOAD_FOLDER', raising=False)

        response = client.get('/api/uploads/cloudinary/widget-config/')

        assert response.status_code == 200
        assert response.json() == {'cloud_name': 'demo-cloud', 'api_key': 'public-api-key'}

    def test_returns_config_with_folder(self, client, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
        monkeypatch.setenv('CLOUDINARY_API_KEY', 'public-api-key')
        monkeypatch.setenv('CLOUDINARY_UPLOAD_FOLDER', 'glaze')

        response = client.get('/api/uploads/cloudinary/widget-config/')

        assert response.status_code == 200
        assert response.json() == {'cloud_name': 'demo-cloud', 'api_key': 'public-api-key', 'folder': 'glaze'}


@pytest.mark.django_db
class TestCloudinaryWidgetSign:
    def test_returns_503_when_not_configured(self, client, monkeypatch):
        monkeypatch.delenv('CLOUDINARY_API_SECRET', raising=False)

        response = client.post(
            '/api/uploads/cloudinary/widget-signature/',
            {'params_to_sign': {}},
            format='json',
        )

        assert response.status_code == 503
        assert response.json()['detail'] == 'Cloudinary is not configured on the server.'

    def test_returns_signature(self, client, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_API_SECRET', 'super-secret')

        params = {'folder': 'glaze', 'timestamp': '1700000000'}
        response = client.post(
            '/api/uploads/cloudinary/widget-signature/',
            {'params_to_sign': params},
            format='json',
        )

        assert response.status_code == 200
        signing_string = 'folder=glaze&timestamp=1700000000'
        expected = hashlib.sha1(f'{signing_string}super-secret'.encode('utf-8')).hexdigest()
        assert response.json() == {'signature': expected}

    def test_returns_400_when_params_not_dict(self, client, monkeypatch):
        monkeypatch.setenv('CLOUDINARY_API_SECRET', 'super-secret')

        response = client.post(
            '/api/uploads/cloudinary/widget-signature/',
            {'params_to_sign': 'not-a-dict'},
            format='json',
        )

        assert response.status_code == 400
