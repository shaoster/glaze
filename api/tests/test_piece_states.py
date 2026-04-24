import uuid

import pytest

from api.models import ENTRY_STATE, SUCCESSORS, ClayBody, Location

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

    def test_additional_fields_recorded(self, client, piece, user):
        kiln = Location.objects.create(user=user, name='Kiln A')
        client.post(f'/api/pieces/{piece.id}/states/', {'state': 'wheel_thrown'}, format='json')
        client.post(f'/api/pieces/{piece.id}/states/', {'state': 'trimmed'}, format='json')
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {
                'state': 'submitted_to_bisque_fire',
                'additional_fields': {'kiln_location': str(kiln.pk)},
            },
            format='json',
        )
        assert response.status_code == 201
        cs = response.json()['current_state']
        assert cs['state'] == 'submitted_to_bisque_fire'
        assert cs['additional_fields']['kiln_location'] == {'id': str(kiln.pk), 'name': 'Kiln A'}

    def test_invalid_additional_fields_returns_400(self, client, piece):
        # additional_fields must be a JSON object — passing a list should fail validation
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': SUCCESSORS[ENTRY_STATE][0], 'additional_fields': ['not', 'an', 'object']},
            format='json',
        )
        assert response.status_code == 400

    def test_new_state_has_empty_additional_fields_when_no_source(self, client, piece, user):
        # If the source field for a state ref was never set, the new state's
        # additional_fields should not include that ref field.
        clay = ClayBody.objects.create(user=user, name='Stoneware')
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'wheel_thrown', 'additional_fields': {'clay_body': str(clay.pk)}},
            format='json',
        )
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'trimmed'},
            format='json',
        )
        assert response.status_code == 201
        # clay_weight_grams was not recorded in wheel_thrown, so pre_trim_weight_grams
        # should not be auto-populated.
        assert response.json()['current_state']['additional_fields'] == {}

    def test_state_ref_fields_auto_populated_on_transition(self, client, piece):
        # When wheel_thrown.clay_weight_grams is recorded, transitioning to trimmed
        # should carry it forward into pre_trim_weight_grams automatically.
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'wheel_thrown', 'additional_fields': {'clay_weight_grams': 1000}},
            format='json',
        )
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'trimmed'},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['current_state']['additional_fields']['pre_trim_weight_grams'] == 1000

    def test_state_ref_client_value_not_overridden(self, client, piece):
        # If the client explicitly supplies a value for a state ref field, the
        # auto-population should not override it.
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'wheel_thrown', 'additional_fields': {'clay_weight_grams': 1000}},
            format='json',
        )
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'trimmed', 'additional_fields': {'pre_trim_weight_grams': 999}},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['current_state']['additional_fields']['pre_trim_weight_grams'] == 999

    def test_piece_not_found(self, client, db):
        response = client.post(
            f'/api/pieces/{uuid.uuid4()}/states/',
            {'state': ENTRY_STATE},
            format='json',
        )
        assert response.status_code == 404
