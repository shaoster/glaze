import uuid

import pytest

from api.models import ENTRY_STATE, SUCCESSORS


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

    def test_notes_persisted(self, client, piece):
        next_state = SUCCESSORS[ENTRY_STATE][0]
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': next_state, 'notes': 'Looks good'},
            format='json',
        )
        data = client.get(f'/api/pieces/{piece.id}/').json()
        cs = data['current_state']
        assert cs['notes'] == 'Looks good'

    def test_additional_fields_recorded(self, client, piece):
        client.post(f'/api/pieces/{piece.id}/states/', {'state': 'wheel_thrown'}, format='json')
        client.post(f'/api/pieces/{piece.id}/states/', {'state': 'trimmed'}, format='json')
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {
                'state': 'submitted_to_bisque_fire',
                'additional_fields': {'kiln_location': 'Kiln A'},
            },
            format='json',
        )
        assert response.status_code == 201
        cs = response.json()['current_state']
        assert cs['state'] == 'submitted_to_bisque_fire'
        assert cs['additional_fields']['kiln_location'] == 'Kiln A'

    def test_invalid_additional_fields_returns_400(self, client, piece):
        # additional_fields must be a JSON object — passing a list should fail validation
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': SUCCESSORS[ENTRY_STATE][0], 'additional_fields': ['not', 'an', 'object']},
            format='json',
        )
        assert response.status_code == 400

    def test_new_state_has_empty_additional_fields(self, client, piece):
        # Transition to a state with additional_fields set, then transition again.
        # The new state must start with an empty additional_fields dict.
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'wheel_thrown', 'additional_fields': {'clay_body': 'Stoneware'}},
            format='json',
        )
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'trimmed'},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['current_state']['additional_fields'] == {}

    def test_piece_not_found(self, client, db):
        response = client.post(
            f'/api/pieces/{uuid.uuid4()}/states/',
            {'state': ENTRY_STATE},
            format='json',
        )
        assert response.status_code == 404
