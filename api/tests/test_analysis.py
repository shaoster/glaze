"""Tests for GET /api/analysis/glaze-combination-images/.

Covers:
- Empty response when the user has no glazed pieces with images.
- Only combinations with at least one image on a qualifying piece state are included.
- Images from non-qualifying states (e.g. designed, bisque_fired) are excluded.
- Pieces from other users are not returned (user isolation).
- Images from multiple qualifying states on the same piece are aggregated.
- Correct ordering: pieces within a combo by last_modified desc; combos by
  most-recent qualifying piece last_modified desc.
- The glaze_combination entry matches GlazeCombinationEntrySerializer shape.
"""
from datetime import timedelta

import pytest
from django.apps import apps
from django.utils import timezone
from rest_framework.test import APIClient

from api.models import GlazeCombination, GlazeType, Piece, PieceState

URL = '/api/analysis/glaze-combination-images/'


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _glaze_type(name: str, user=None) -> GlazeType:
    return GlazeType.objects.create(user=user, name=name)


def _combo(user, *glaze_types) -> GlazeCombination:
    return GlazeCombination.get_or_create_with_components(
        user=user, glaze_types=list(glaze_types)
    )[0]


def _piece(user, name: str = 'Bowl') -> Piece:
    p = Piece.objects.create(user=user, name=name)
    PieceState.objects.create(user=user, piece=p, state='designed', notes='')
    return p


def _add_state(piece: Piece, state: str, images=None, notes: str = '') -> PieceState:
    """Append a new state to a piece (bypasses the transition validator)."""
    return PieceState.objects.create(
        user=piece.user,
        piece=piece,
        state=state,
        notes=notes,
        images=images or [],
    )


def _attach_combo(piece_state: PieceState, combo: GlazeCombination, field_name: str = 'glaze_combination') -> None:
    """Write a PieceStateGlazeCombinationRef row for the given state."""
    GlazeCombinationRef = apps.get_model('api', 'PieceStateGlazeCombinationRef')
    GlazeCombinationRef.objects.create(
        piece_state=piece_state,
        field_name=field_name,
        glaze_combination=combo,
    )


SAMPLE_IMAGE = {
    'url': 'https://example.com/img.jpg',
    'caption': 'Front view',
    'created': '2024-01-01T00:00:00Z',
    'cloudinary_public_id': None,
}


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def glaze_type(db):
    return _glaze_type('Ash')


@pytest.fixture
def combo(user, glaze_type, db):
    return _combo(user, glaze_type)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestEmptyResponse:
    def test_no_pieces(self, client):
        response = client.get(URL)
        assert response.status_code == 200
        assert response.json() == []

    def test_piece_without_glaze_combination(self, client, user):
        p = _piece(user)
        _add_state(p, 'wheel_thrown', images=[SAMPLE_IMAGE])
        response = client.get(URL)
        assert response.status_code == 200
        assert response.json() == []

    def test_glazed_piece_without_images(self, client, user, combo):
        p = _piece(user)
        glazed = _add_state(p, 'glazed')
        _attach_combo(glazed, combo)
        response = client.get(URL)
        assert response.status_code == 200
        assert response.json() == []

    def test_requires_authentication(self, db):
        c = APIClient()
        response = c.get(URL)
        assert response.status_code in (401, 403)


@pytest.mark.django_db
class TestQualifyingStateFilter:
    def test_images_from_glazed_state_included(self, client, user, combo):
        p = _piece(user)
        glazed = _add_state(p, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed, combo)
        response = client.get(URL)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert len(data[0]['pieces']) == 1
        assert len(data[0]['pieces'][0]['images']) == 1

    def test_images_from_glaze_fired_state_included(self, client, user, combo):
        p = _piece(user)
        glazed = _add_state(p, 'glazed')
        _attach_combo(glazed, combo)
        fired = _add_state(p, 'glaze_fired', images=[SAMPLE_IMAGE])
        _attach_combo(fired, combo, field_name='glaze_combination')
        response = client.get(URL)
        data = response.json()
        assert len(data) == 1
        assert len(data[0]['pieces'][0]['images']) == 1

    def test_images_from_completed_state_included(self, client, user, combo):
        p = _piece(user)
        glazed = _add_state(p, 'glazed')
        _attach_combo(glazed, combo)
        _add_state(p, 'completed', images=[SAMPLE_IMAGE])
        response = client.get(URL)
        data = response.json()
        assert len(data) == 1
        assert len(data[0]['pieces'][0]['images']) == 1

    def test_images_from_non_qualifying_state_excluded(self, client, user, combo):
        # Images on designed or wheel_thrown states should not appear.
        p = _piece(user)
        glazed = _add_state(p, 'glazed')
        _attach_combo(glazed, combo)
        # The designed state already exists; add a wheel_thrown state with images.
        # We directly create the PieceState to bypass transition validation.
        PieceState.objects.create(
            user=user, piece=p, state='wheel_thrown',
            images=[SAMPLE_IMAGE], notes=''
        )
        response = client.get(URL)
        data = response.json()
        # The piece has a glaze_combination but no images in qualifying states.
        assert data == []

    def test_images_from_multiple_qualifying_states_aggregated(self, client, user, combo):
        p = _piece(user)
        glazed = _add_state(p, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed, combo)
        fired = _add_state(p, 'glaze_fired', images=[SAMPLE_IMAGE])
        _attach_combo(fired, combo, field_name='glaze_combination')
        response = client.get(URL)
        data = response.json()
        assert len(data) == 1
        # Both images should be aggregated into the single piece entry.
        assert len(data[0]['pieces'][0]['images']) == 2


@pytest.mark.django_db
class TestUserIsolation:
    def test_other_users_pieces_excluded(self, client, user, other_user, combo, db):
        other_gt = _glaze_type('Shino')
        other_combo = _combo(other_user, other_gt)
        other_piece = _piece(other_user, 'Other Bowl')
        glazed = _add_state(other_piece, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed, other_combo)

        response = client.get(URL)
        assert response.json() == []

    def test_own_pieces_visible(self, client, user, combo):
        p = _piece(user)
        glazed = _add_state(p, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed, combo)
        response = client.get(URL)
        data = response.json()
        assert len(data) == 1


@pytest.mark.django_db
class TestOrdering:
    def test_pieces_sorted_by_last_modified_desc(self, client, user, combo):
        p1 = _piece(user, 'Old Bowl')
        glazed1 = _add_state(p1, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed1, combo)
        # Force an earlier timestamp on p1's glazed state.
        PieceState.objects.filter(pk=glazed1.pk).update(
            last_modified=timezone.now() - timedelta(hours=2)
        )

        p2 = _piece(user, 'New Bowl')
        glazed2 = _add_state(p2, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed2, combo)

        response = client.get(URL)
        data = response.json()
        pieces = data[0]['pieces']
        assert len(pieces) == 2
        assert pieces[0]['name'] == 'New Bowl'
        assert pieces[1]['name'] == 'Old Bowl'

    def test_combos_sorted_by_most_recent_piece_desc(self, client, user, db):
        gt1 = _glaze_type('Ash')
        gt2 = _glaze_type('Shino')
        combo1 = _combo(user, gt1)
        combo2 = _combo(user, gt2)

        p1 = _piece(user, 'Bowl A')
        glazed1 = _add_state(p1, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed1, combo1)
        PieceState.objects.filter(pk=glazed1.pk).update(
            last_modified=timezone.now() - timedelta(hours=2)
        )

        p2 = _piece(user, 'Bowl B')
        glazed2 = _add_state(p2, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed2, combo2)

        response = client.get(URL)
        data = response.json()
        assert len(data) == 2
        # combo2's piece was modified more recently, so combo2 appears first.
        assert data[0]['glaze_combination']['id'] == str(combo2.pk)
        assert data[1]['glaze_combination']['id'] == str(combo1.pk)


@pytest.mark.django_db
class TestResponseShape:
    def test_glaze_combination_entry_has_expected_fields(self, client, user, combo):
        p = _piece(user)
        glazed = _add_state(p, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed, combo)

        response = client.get(URL)
        data = response.json()
        gc = data[0]['glaze_combination']
        assert 'id' in gc
        assert 'name' in gc
        assert 'glaze_types' in gc
        assert 'is_public' in gc
        assert 'is_favorite' in gc

    def test_piece_entry_has_expected_fields(self, client, user, combo):
        p = _piece(user, 'My Mug')
        glazed = _add_state(p, 'glazed', images=[SAMPLE_IMAGE])
        _attach_combo(glazed, combo)

        response = client.get(URL)
        data = response.json()
        piece = data[0]['pieces'][0]
        assert piece['id'] == str(p.pk)
        assert piece['name'] == 'My Mug'
        assert piece['state'] == 'glazed'
        assert len(piece['images']) == 1
        assert piece['images'][0]['url'] == SAMPLE_IMAGE['url']
