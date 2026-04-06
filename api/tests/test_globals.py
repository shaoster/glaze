import pytest

from api.models import ClayBody


@pytest.mark.django_db
class TestGlobalEntries:
    def test_fetch_clay_body_entries(self, client, user):
        ClayBody.objects.create(user=user, name='Stoneware')
        ClayBody.objects.create(user=user, name='Porcelain')
        response = client.get('/api/globals/clay_body/')
        assert response.status_code == 200
        names = [entry['name'] for entry in response.json()]
        assert names == ['Porcelain', 'Stoneware']

    def test_create_clay_body_entry(self, client):
        response = client.post(
            '/api/globals/clay_body/',
            {'field': 'name', 'value': 'Custom Clay'},
            format='json',
        )
        assert response.status_code == 201
        assert ClayBody.objects.filter(name='Custom Clay').exists()

    def test_get_unknown_global_returns_404(self, client):
        response = client.get('/api/globals/does_not_exist/')
        assert response.status_code == 404
