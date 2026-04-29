import pytest


@pytest.mark.django_db
class TestGlobalEntries:
    def test_piece_global_uses_registered_rich_serializer_without_glaze_hack(
        self, client, piece
    ):
        response = client.get('/api/globals/piece/')

        assert response.status_code == 200
        assert response.json() == [
            {
                'id': str(piece.id),
                'name': 'Test Bowl',
                'created': piece.created.isoformat().replace('+00:00', 'Z'),
                'last_modified': piece.last_modified.isoformat().replace(
                    '+00:00', 'Z'
                ),
                'thumbnail': None,
                'current_state': {'state': 'designed'},
                'current_location': None,
                'tags': [],
            }
        ]
