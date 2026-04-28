import uuid

import pytest
from django.apps import apps

from api.models import ENTRY_STATE, SUCCESSORS, GlazeCombination, GlazeType

# ---------------------------------------------------------------------------
# PATCH /api/pieces/{id}/state/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestPatchCurrentState:
    def test_update_notes(self, client, piece):
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'notes': 'Updated notes'},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['current_state']['notes'] == 'Updated notes'

    def test_update_images(self, client, piece):
        images = [{'url': 'http://example.com/img.jpg', 'caption': 'Test', 'created': '2024-01-01T00:00:00Z'}]
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'images': images},
            format='json',
        )
        assert response.status_code == 200
        result_images = response.json()['current_state']['images']
        assert len(result_images) == 1
        assert result_images[0]['url'] == 'http://example.com/img.jpg'

    def test_update_images_empty_caption(self, client, piece):
        images = [{'url': 'http://example.com/img.jpg', 'caption': ''}]
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'images': images},
            format='json',
        )
        assert response.status_code == 200
        result_images = response.json()['current_state']['images']
        assert len(result_images) == 1
        assert result_images[0]['caption'] == ''

    def test_update_images_missing_caption(self, client, piece):
        images = [{'url': 'http://example.com/img.jpg'}]
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'images': images},
            format='json',
        )
        assert response.status_code == 200
        result_images = response.json()['current_state']['images']
        assert len(result_images) == 1
        assert result_images[0]['caption'] == ''

    def test_patch_images_without_created(self, client, piece):
        images = [{'url': 'http://example.com/img.jpg', 'caption': 'Test'}]
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'images': images},
            format='json',
        )
        assert response.status_code == 200
        result_images = response.json()['current_state']['images']
        assert len(result_images) == 1
        assert result_images[0]['url'] == 'http://example.com/img.jpg'
        assert 'created' in result_images[0]

    def test_partial_update_leaves_other_fields(self, client, piece):
        # Set notes first — assign to a variable so save() is called on the same object
        state = piece.current_state
        state.notes = 'Original notes'
        state.save()
        # Now patch only images
        images = [{'url': 'http://example.com/piece.jpg', 'caption': 'Updated'}]
        client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'images': images},
            format='json',
        )
        data = client.get(f'/api/pieces/{piece.id}/').json()
        assert data['current_state']['notes'] == 'Original notes'
        result_images = data['current_state']['images']
        assert any(img['url'] == 'http://example.com/piece.jpg' for img in result_images)

    def test_piece_not_found(self, client, db):
        response = client.patch(
            f'/api/pieces/{uuid.uuid4()}/state/',
            {'notes': 'x'},
            format='json',
        )
        assert response.status_code == 404

    def test_piece_with_no_states_returns_404(self, client, user):
        from api.models import Piece

        piece = Piece.objects.create(user=user, name='No History Yet')
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'notes': 'x'},
            format='json',
        )
        assert response.status_code == 404
        assert response.json() == {'detail': 'Piece has no states.'}

    def test_invalid_additional_fields_returns_400(self, client, piece):
        # additional_fields must be a JSON object — passing a list should fail validation
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'additional_fields': ['not', 'an', 'object']},
            format='json',
        )
        assert response.status_code == 400

    def test_null_global_ref_additional_field_clears_junction_row(self, client, piece):
        glaze = GlazeType.objects.create(user=None, name='Iron Red')
        combo, _ = GlazeCombination.get_or_create_with_components(user=None, glaze_types=[glaze])
        state = piece.current_state
        state.state = 'glazed'
        state.save()
        ref_model = apps.get_model('api', 'PieceStateGlazeCombinationRef')
        ref_model.objects.create(
            piece_state=state,
            field_name='glaze_combination',
            glaze_combination=combo,
        )

        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'additional_fields': {'glaze_combination': None}},
            format='json',
        )

        assert response.status_code == 200
        assert 'glaze_combination' not in response.json()['current_state']['additional_fields']
        assert not ref_model.objects.filter(
            piece_state=state,
            field_name='glaze_combination',
        ).exists()

    def test_cannot_patch_past_state_via_endpoint(self, client, piece):
        """Transitioning seals the old state; PATCH endpoint targets the new current state."""
        next_state = SUCCESSORS[ENTRY_STATE][0]
        client.post(f'/api/pieces/{piece.id}/states/', {'state': next_state}, format='json')
        # PATCH now updates the new current state, not the original
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'notes': 'On the new state'},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['current_state']['notes'] == 'On the new state'
