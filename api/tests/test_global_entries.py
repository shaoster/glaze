import pytest

from api.models import Location


@pytest.mark.django_db
class TestGlobalEntries:
    def test_get_returns_entries(self, client, user):
        Location.objects.create(user=user, name='Kiln A')
        Location.objects.create(user=user, name='Kiln B')
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

    def test_post_reuses_existing(self, client, user):
        Location.objects.create(user=user, name='Kiln Room')
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

    def test_does_not_leak_other_users_entries(self, client, other_user):
        Location.objects.create(user=other_user, name='Other User Kiln')
        response = client.get('/api/globals/location/')
        assert response.status_code == 200
        assert response.json() == []
