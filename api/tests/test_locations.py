import pytest

from api.models import Location


# ---------------------------------------------------------------------------
# GET /api/locations/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLocationsList:
    def test_empty(self, client):
        response = client.get('/api/locations/')
        assert response.status_code == 200
        assert response.json() == []

    def test_returns_locations(self, client, db):
        Location.objects.create(name='Studio A')
        Location.objects.create(name='Kiln Room')
        response = client.get('/api/locations/')
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        names = {item['name'] for item in data}
        assert names == {'Studio A', 'Kiln Room'}

    def test_location_shape(self, client, db):
        Location.objects.create(name='Test Loc')
        data = client.get('/api/locations/').json()
        assert set(data[0].keys()) == {'id', 'name'}


# ---------------------------------------------------------------------------
# POST /api/locations/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLocationsCreate:
    def test_create(self, client, db):
        response = client.post('/api/locations/', {'name': 'New Shelf'}, format='json')
        assert response.status_code == 201
        data = response.json()
        assert data['name'] == 'New Shelf'
        assert Location.objects.filter(name='New Shelf').exists()

    def test_create_returns_existing(self, client, db):
        Location.objects.create(name='Kiln Room')
        response = client.post('/api/locations/', {'name': 'Kiln Room'}, format='json')
        assert response.status_code == 200
        assert response.json()['name'] == 'Kiln Room'
        assert Location.objects.filter(name='Kiln Room').count() == 1

    def test_create_missing_name(self, client, db):
        response = client.post('/api/locations/', {}, format='json')
        assert response.status_code == 400
