import pytest

from api.models import Location


@pytest.mark.django_db
class TestGlobalEntries:
    def test_get_returns_entries(self, client):
        Location.objects.create(name='Kiln A')
        Location.objects.create(name='Kiln B')
        response = client.get('/api/globals/location/')
        assert response.status_code == 200
        names = [entry['name'] for entry in response.json()]
        assert names == sorted(names)
        assert 'Kiln A' in names

    def test_post_creates_entry(self, client):
        response = client.post(
            '/api/globals/location/',
            {'field': 'name', 'value': 'New Shelf'},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['name'] == 'New Shelf'
        assert Location.objects.filter(name='New Shelf').exists()

    def test_post_reuses_existing(self, client):
        Location.objects.create(name='Kiln Room')
        response = client.post(
            '/api/globals/location/',
            {'field': 'name', 'value': 'Kiln Room'},
            format='json',
        )
        assert response.status_code == 200
        assert Location.objects.filter(name='Kiln Room').count() == 1

    def test_unknown_global_returns_404(self, client):
        response = client.get('/api/globals/unknown/')
        assert response.status_code == 404

    def test_invalid_field(self, client):
        response = client.post(
            '/api/globals/location/',
            {'field': 'unknown', 'value': 'x'},
            format='json',
        )
        assert response.status_code == 400

    def test_missing_value(self, client):
        response = client.post(
            '/api/globals/location/',
            {'field': 'name', 'value': ''},
            format='json',
        )
        assert response.status_code == 400
