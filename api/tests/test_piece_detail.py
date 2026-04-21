import uuid

import pytest

from api.models import Location, Tag


# ---------------------------------------------------------------------------
# GET /api/pieces/{id}/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPieceDetail:
    def test_get(self, client, piece):
        response = client.get(f'/api/pieces/{piece.id}/')
        assert response.status_code == 200
        data = response.json()
        assert data['name'] == 'Test Bowl'
        assert 'history' in data
        assert len(data['history']) == 1

    def test_not_found(self, client, db):
        response = client.get(f'/api/pieces/{uuid.uuid4()}/')
        assert response.status_code == 404

    def test_current_state_has_full_fields(self, client, piece):
        data = client.get(f'/api/pieces/{piece.id}/').json()
        cs = data['current_state']
        assert {'state', 'notes', 'created', 'last_modified', 'images', 'additional_fields'} <= cs.keys()

    def test_current_location_exposed(self, client, piece, user):
        location = Location.objects.create(user=user, name='Studio Q')
        piece.current_location = location
        piece.save()
        data = client.get(f'/api/pieces/{piece.id}/').json()
        assert data['current_location'] == 'Studio Q'

    def test_patch_updates_current_location(self, client, piece):
        response = client.patch(
            f'/api/pieces/{piece.id}/',
            {'current_location': 'Shelf Z'},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['current_location'] == 'Shelf Z'
        assert Location.objects.filter(name='Shelf Z').exists()

    def test_create_sets_initial_location(self, client):
        response = client.post(
            '/api/pieces/',
            {'name': 'New Mug', 'current_location': 'Kiln Garden'},
            format='json',
        )
        assert response.status_code == 201
        data = response.json()
        assert data['current_location'] == 'Kiln Garden'
        assert Location.objects.filter(name='Kiln Garden').exists()

    def test_patch_updates_name(self, client, piece):
        response = client.patch(
            f'/api/pieces/{piece.id}/',
            {'name': 'Revised Vase'},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['name'] == 'Revised Vase'
        piece.refresh_from_db()
        assert piece.name == 'Revised Vase'

    def test_patch_updates_ordered_tags(self, client, piece, user):
        first = Tag.objects.create(user=user, name='Functional', color='#E76F51')
        second = Tag.objects.create(user=user, name='Gift', color='#2A9D8F')

        response = client.patch(
            f'/api/pieces/{piece.id}/',
            {'tags': [str(second.id), str(first.id)]},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['tags'] == [
            {'id': str(second.id), 'name': 'Gift', 'color': '#2A9D8F'},
            {'id': str(first.id), 'name': 'Functional', 'color': '#E76F51'},
        ]

    def test_patch_name_empty_rejected(self, client, piece):
        response = client.patch(
            f'/api/pieces/{piece.id}/',
            {'name': ''},
            format='json',
        )
        assert response.status_code == 400

    def test_cannot_read_other_users_piece(self, client, other_user):
        from api.models import ENTRY_STATE, Piece, PieceState

        foreign_piece = Piece.objects.create(user=other_user, name='Other User Piece')
        PieceState.objects.create(piece=foreign_piece, state=ENTRY_STATE)
        response = client.get(f'/api/pieces/{foreign_piece.id}/')
        assert response.status_code == 404
