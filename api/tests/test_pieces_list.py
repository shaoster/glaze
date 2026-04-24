import pytest

from api.models import ENTRY_STATE, Piece, PieceState, Tag

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
        hidden = Piece.objects.create(user=other_user, name='Hidden Piece')
        PieceState.objects.create(piece=hidden, state=ENTRY_STATE)
        response = client.get('/api/pieces/')
        assert response.status_code == 200
        assert response.json() == []

    def test_filters_by_all_tag_ids_and_deduplicates_results(self, client, piece, user):
        second_piece = Piece.objects.create(user=user, name='Second Bowl')
        PieceState.objects.create(piece=second_piece, state=ENTRY_STATE)
        first_tag = Tag.objects.create(user=user, name='Functional')
        second_tag = Tag.objects.create(user=user, name='Gift')
        third_tag = Tag.objects.create(user=user, name='Sale')

        client.patch(
            f'/api/pieces/{piece.id}/',
            {'tags': [str(first_tag.id), str(second_tag.id), str(third_tag.id)]},
            format='json',
        )
        client.patch(
            f'/api/pieces/{second_piece.id}/',
            {'tags': [str(first_tag.id)]},
            format='json',
        )

        response = client.get(
            '/api/pieces/',
            {'tag_ids': f'{first_tag.id}, {second_tag.id}'},
        )

        assert response.status_code == 200
        data = response.json()
        assert [entry['id'] for entry in data] == [str(piece.id)]
