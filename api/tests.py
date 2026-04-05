import uuid

import pytest
from rest_framework.test import APIClient

from .models import ENTRY_STATE, SUCCESSORS, Piece, PieceState


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def piece(db):
    p = Piece.objects.create(name='Test Bowl')
    PieceState.objects.create(piece=p, state=ENTRY_STATE)
    return p


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
        assert keys == {'id', 'name', 'created', 'last_modified', 'thumbnail', 'current_state'}


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
        assert {'state', 'notes', 'created', 'last_modified', 'location', 'images'} <= cs.keys()


# ---------------------------------------------------------------------------
# POST /api/pieces/{id}/states/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPieceStates:
    def test_valid_transition(self, client, piece):
        next_state = SUCCESSORS[ENTRY_STATE][0]
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': next_state},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['current_state']['state'] == next_state

    def test_invalid_transition(self, client, piece):
        # 'recycled' is not a direct successor of the entry state
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'recycled'},
            format='json',
        )
        assert response.status_code == 400

    def test_history_grows(self, client, piece):
        next_state = SUCCESSORS[ENTRY_STATE][0]
        client.post(f'/api/pieces/{piece.id}/states/', {'state': next_state}, format='json')
        data = client.get(f'/api/pieces/{piece.id}/').json()
        assert len(data['history']) == 2

    def test_notes_and_location_persisted(self, client, piece):
        next_state = SUCCESSORS[ENTRY_STATE][0]
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': next_state, 'notes': 'Looks good', 'location': 'Studio A'},
            format='json',
        )
        data = client.get(f'/api/pieces/{piece.id}/').json()
        cs = data['current_state']
        assert cs['notes'] == 'Looks good'
        assert cs['location'] == 'Studio A'

    def test_piece_not_found(self, client, db):
        response = client.post(
            f'/api/pieces/{uuid.uuid4()}/states/',
            {'state': ENTRY_STATE},
            format='json',
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Model: PieceState sealed-state invariant
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSealedState:
    def test_cannot_modify_past_state(self, piece):
        initial_state = piece.current_state
        PieceState.objects.create(piece=piece, state=SUCCESSORS[ENTRY_STATE][0])
        initial_state.refresh_from_db()
        initial_state.notes = 'Retroactive edit'
        with pytest.raises(ValueError, match='sealed'):
            initial_state.save()

    def test_can_modify_current_state(self, piece):
        current = piece.current_state
        current.notes = 'Updated'
        current.save()  # should not raise
        current.refresh_from_db()
        assert current.notes == 'Updated'

    def test_bypass_with_allow_sealed_edit(self, piece):
        initial_state = piece.current_state
        PieceState.objects.create(piece=piece, state=SUCCESSORS[ENTRY_STATE][0])
        initial_state.refresh_from_db()
        initial_state.notes = 'Admin override'
        initial_state.save(allow_sealed_edit=True)  # should not raise
        initial_state.refresh_from_db()
        assert initial_state.notes == 'Admin override'
