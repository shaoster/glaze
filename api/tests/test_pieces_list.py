import pytest

from api.models import ENTRY_STATE


# ---------------------------------------------------------------------------
# GET /api/pieces/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPiecesList:
    def test_empty(self, client):
        response = client.get('/api/pieces/')
        assert response.status_code == 200
        assert response.json() == []

    def test_returns_pieces(self, client, piece):
        response = client.get('/api/pieces/')
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]['name'] == 'Test Bowl'
        assert data[0]['current_state']['state'] == ENTRY_STATE

    def test_summary_shape(self, client, piece):
        data = client.get('/api/pieces/').json()
        keys = set(data[0].keys())
        assert keys == {'id', 'name', 'created', 'current_location', 'last_modified', 'thumbnail', 'current_state', 'tags'}

    def test_does_not_include_other_users_pieces(self, client, other_user):
        from api.models import Piece, PieceState

        hidden = Piece.objects.create(user=other_user, name='Hidden Piece')
        PieceState.objects.create(piece=hidden, state=ENTRY_STATE)
        response = client.get('/api/pieces/')
        assert response.status_code == 200
        assert response.json() == []
