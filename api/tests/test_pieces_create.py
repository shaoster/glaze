import pytest

from api.models import ENTRY_STATE, Piece

# ---------------------------------------------------------------------------
# POST /api/pieces/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPiecesCreate:
    def test_create(self, client, db):
        response = client.post('/api/pieces/', {'name': 'Clay Mug'}, format='json')
        assert response.status_code == 201
        data = response.json()
        assert data['name'] == 'Clay Mug'
        assert data['current_state']['state'] == ENTRY_STATE
        assert Piece.objects.count() == 1

    def test_create_sets_entry_state(self, client, db):
        client.post('/api/pieces/', {'name': 'Bowl'}, format='json')
        piece = Piece.objects.get()
        assert piece.states.count() == 1
        assert piece.current_state.state == ENTRY_STATE

    def test_create_missing_name(self, client, db):
        response = client.post('/api/pieces/', {}, format='json')
        assert response.status_code == 400

    def test_create_detail_shape(self, client, db):
        data = client.post('/api/pieces/', {'name': 'Vase'}, format='json').json()
        assert 'history' in data
        assert len(data['history']) == 1

    def test_create_with_notes(self, client, db):
        response = client.post('/api/pieces/', {'name': 'Mug', 'notes': 'Wide handle'}, format='json')
        assert response.status_code == 201
        data = response.json()
        assert data['current_state']['notes'] == 'Wide handle'

    def test_create_notes_too_long(self, client, db):
        response = client.post('/api/pieces/', {'name': 'Mug', 'notes': 'x' * 301}, format='json')
        assert response.status_code == 400

    def test_create_notes_defaults_empty(self, client, db):
        response = client.post('/api/pieces/', {'name': 'Cup'}, format='json')
        assert response.status_code == 201
        data = response.json()
        assert data['current_state']['notes'] == ''
