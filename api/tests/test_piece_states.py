import uuid

import pytest
from rest_framework.exceptions import ValidationError

from api.models import (
    ENTRY_STATE,
    SUCCESSORS,
    ClayBody,
    GlazeCombination,
    GlazeType,
    Location,
    Piece,
)
from api.serializers import (
    PieceStateCreateSerializer,
    PieceSummarySerializer,
    _write_global_ref_rows,
)

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

    def test_validate_state_allows_first_state_when_piece_has_no_current_state(self, user):
        piece = Piece.objects.create(user=user, name='No State Yet')
        serializer = PieceStateCreateSerializer(
            data={'state': ENTRY_STATE},
            context={'piece': piece},
        )

        assert serializer.is_valid(), serializer.errors

    def test_create_first_state_with_images_when_piece_has_no_current_state(self, user):
        piece = Piece.objects.create(user=user, name='First State Images')
        serializer = PieceStateCreateSerializer(
            data={
                'state': ENTRY_STATE,
                'images': [{'url': 'https://example.com/first.jpg', 'caption': 'first'}],
            },
            context={'piece': piece},
        )

        assert serializer.is_valid(), serializer.errors
        state = serializer.save()

        assert state.images[0]['url'] == 'https://example.com/first.jpg'
        assert 'created' in state.images[0]

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

    def test_create_records_images_and_global_ref_field(self, client, piece, user):
        clay = ClayBody.objects.create(user=user, name='Speckled Stoneware')

        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {
                'state': 'wheel_thrown',
                'images': [{'url': 'https://example.com/throwing.jpg', 'caption': 'throwing'}],
                'additional_fields': {
                    'clay_weight_lbs': 2.5,
                    'clay_body': str(clay.pk),
                },
            },
            format='json',
        )

        assert response.status_code == 201
        current = response.json()['current_state']
        assert current['images'][0]['url'] == 'https://example.com/throwing.jpg'
        assert 'created' in current['images'][0]
        assert current['additional_fields']['clay_weight_lbs'] == 2.5
        assert current['additional_fields']['clay_body'] == {
            'id': str(clay.pk),
            'name': 'Speckled Stoneware',
        }

    def test_create_returns_validation_error_for_invalid_inline_field(self, client, piece):
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {
                'state': 'wheel_thrown',
                'additional_fields': {'clay_weight_lbs': 'heavy'},
            },
            format='json',
        )

        assert response.status_code == 400
        assert 'additional_fields' in response.json()

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
        # clay_weight_lbs was not recorded in wheel_thrown, so pre_trim_weight_lbs
        # should not be auto-populated.
        assert response.json()['current_state']['additional_fields'] == {}

    def test_state_ref_fields_auto_populated_on_transition(self, client, piece):
        # When wheel_thrown.clay_weight_lbs is recorded, transitioning to trimmed
        # should carry it forward into pre_trim_weight_lbs automatically.
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'wheel_thrown', 'additional_fields': {'clay_weight_lbs': 1000}},
            format='json',
        )
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'trimmed'},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['current_state']['additional_fields']['pre_trim_weight_lbs'] == 1000

    def test_state_ref_client_value_not_overridden(self, client, piece):
        # If the client explicitly supplies a value for a state ref field, the
        # auto-population should not override it.
        client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'wheel_thrown', 'additional_fields': {'clay_weight_lbs': 1000}},
            format='json',
        )
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'trimmed', 'additional_fields': {'pre_trim_weight_lbs': 999}},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['current_state']['additional_fields']['pre_trim_weight_lbs'] == 999

    def test_global_ref_state_ref_auto_populated_on_transition(self, client, piece):
        glaze = GlazeType.objects.create(user=None, name='Copper Blue')
        combo, _ = GlazeCombination.get_or_create_with_components(user=None, glaze_types=[glaze])
        for state in [
            'wheel_thrown',
            'trimmed',
            'submitted_to_bisque_fire',
            'bisque_fired',
        ]:
            response = client.post(f'/api/pieces/{piece.id}/states/', {'state': state}, format='json')
            assert response.status_code == 201
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {
                'state': 'glazed',
                'additional_fields': {'glaze_combination': str(combo.pk)},
            },
            format='json',
        )
        assert response.status_code == 201
        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'submitted_to_glaze_fire'},
            format='json',
        )
        assert response.status_code == 201

        response = client.post(
            f'/api/pieces/{piece.id}/states/',
            {'state': 'glaze_fired'},
            format='json',
        )

        assert response.status_code == 201
        assert response.json()['current_state']['additional_fields']['glaze_combination'] == {'id': str(combo.pk), 'name': 'Copper Blue'}

    def test_piece_not_found(self, client, db):
        response = client.post(
            f'/api/pieces/{uuid.uuid4()}/states/',
            {'state': ENTRY_STATE},
            format='json',
        )
        assert response.status_code == 404

    def test_non_owner_cannot_add_state_to_shared_piece(self, client, other_user):
        foreign_piece = Piece.objects.create(
            user=other_user,
            name='Shared Foreign Piece',
            shared=True,
        )
        from api.models import PieceState

        PieceState.objects.create(user=other_user, piece=foreign_piece, state=ENTRY_STATE)

        response = client.post(
            f'/api/pieces/{foreign_piece.id}/states/',
            {'state': SUCCESSORS[ENTRY_STATE][0]},
            format='json',
        )

        assert response.status_code == 404

    def test_summary_serializer_asserts_piece_has_current_state(self, user):
        piece = Piece.objects.create(user=user, name='Broken Summary')
        serializer = PieceSummarySerializer()

        with pytest.raises(AssertionError, match='has no states'):
            serializer.get_current_state(piece)

    def test_write_global_ref_rows_rejects_missing_global_id(self, piece):
        state = piece.current_state

        with pytest.raises(ValidationError) as exc:
            _write_global_ref_rows(
                state,
                {'kiln_location': 'location'},
                {'kiln_location': '00000000-0000-0000-0000-000000000000'},
            )

        assert exc.value.detail == {
            'additional_fields.kiln_location': "Invalid location id: '00000000-0000-0000-0000-000000000000'"
        }
