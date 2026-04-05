import uuid
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

import api.models as models_module
from .models import ENTRY_STATE, SUCCESSORS, Location, Piece, PieceState


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

    def test_update_location_creates_location(self, client, piece):
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'location': 'Shelf B'},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['current_state']['location'] == 'Shelf B'
        assert Location.objects.filter(name='Shelf B').exists()

    def test_update_location_reuses_existing(self, client, piece):
        Location.objects.create(name='Kiln Room')
        client.patch(f'/api/pieces/{piece.id}/state/', {'location': 'Kiln Room'}, format='json')
        assert Location.objects.filter(name='Kiln Room').count() == 1

    def test_clear_location(self, client, piece):
        piece.current_state.location = Location.objects.create(name='Shelf C')
        piece.current_state.save()
        response = client.patch(
            f'/api/pieces/{piece.id}/state/',
            {'location': ''},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['current_state']['location'] == ''

    def test_update_images(self, client, piece):
        import datetime
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

    def test_partial_update_leaves_other_fields(self, client, piece):
        # Set notes first — assign to a variable so save() is called on the same object
        state = piece.current_state
        state.notes = 'Original notes'
        state.save()
        # Now patch only location
        client.patch(f'/api/pieces/{piece.id}/state/', {'location': 'Shelf D'}, format='json')
        data = client.get(f'/api/pieces/{piece.id}/').json()
        assert data['current_state']['notes'] == 'Original notes'
        assert data['current_state']['location'] == 'Shelf D'

    def test_piece_not_found(self, client, db):
        response = client.patch(
            f'/api/pieces/{uuid.uuid4()}/state/',
            {'notes': 'x'},
            format='json',
        )
        assert response.status_code == 404

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


# ---------------------------------------------------------------------------
# GET /api/locations/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLocationsList:
    def test_empty(self, client):
        response = client.get('/api/locations/')
        assert response.status_code == 200
        assert response.json() == []

    def test_returns_locations(self, client, db):
        Location.objects.create(name='Studio A')
        Location.objects.create(name='Kiln Room')
        response = client.get('/api/locations/')
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        names = {item['name'] for item in data}
        assert names == {'Studio A', 'Kiln Room'}

    def test_location_shape(self, client, db):
        Location.objects.create(name='Test Loc')
        data = client.get('/api/locations/').json()
        assert set(data[0].keys()) == {'id', 'name'}


# ---------------------------------------------------------------------------
# POST /api/locations/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestLocationsCreate:
    def test_create(self, client, db):
        response = client.post('/api/locations/', {'name': 'New Shelf'}, format='json')
        assert response.status_code == 201
        data = response.json()
        assert data['name'] == 'New Shelf'
        assert Location.objects.filter(name='New Shelf').exists()

    def test_create_returns_existing(self, client, db):
        Location.objects.create(name='Kiln Room')
        response = client.post('/api/locations/', {'name': 'Kiln Room'}, format='json')
        assert response.status_code == 200
        assert response.json()['name'] == 'Kiln Room'
        assert Location.objects.filter(name='Kiln Room').count() == 1

    def test_create_missing_name(self, client, db):
        response = client.post('/api/locations/', {}, format='json')
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Images without `created` field
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestImagesWithoutCreated:
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


# ---------------------------------------------------------------------------
# Model: PieceState.additional_fields schema validation
#
# All tests in this class patch api.models._STATE_MAP and api.models._GLOBALS_MAP
# so they are decoupled from the real workflow.yml contents.
# ---------------------------------------------------------------------------

# Mock state map used across additional_fields tests.
_MOCK_STATE_MAP = {
    'mock_entry': {
        'id': 'mock_entry',
        'visible': True,
        'successors': ['mock_typed', 'mock_terminal'],
    },
    'mock_typed': {
        'id': 'mock_typed',
        'visible': True,
        'successors': ['mock_with_ref', 'mock_terminal'],
        'additional_fields': {
            'required_num': {'type': 'number', 'required': True},
            'optional_str': {'type': 'string'},
            'enum_field': {'type': 'string', 'enum': ['alpha', 'beta', 'gamma']},
            'int_field': {'type': 'integer'},
            'bool_field': {'type': 'boolean'},
        },
    },
    'mock_with_ref': {
        'id': 'mock_with_ref',
        'visible': True,
        'successors': ['mock_terminal'],
        'additional_fields': {
            # State ref — resolves to mock_typed.required_num (number)
            'carried_num': {
                '$ref': 'mock_typed.required_num',
                'description': 'Carried forward from mock_typed.',
            },
            # Global ref — resolves to mock_global.name_field (string)
            'global_str': {
                '$ref': '@mock_global.name_field',
            },
        },
    },
    'mock_no_fields': {
        'id': 'mock_no_fields',
        'visible': True,
        'successors': ['mock_terminal'],
        # No additional_fields key at all.
    },
    'mock_terminal': {
        'id': 'mock_terminal',
        'visible': True,
        'terminal': True,
    },
}

_MOCK_GLOBALS_MAP = {
    'mock_global': {
        'model': 'Location',
        'fields': {
            'name_field': {'type': 'string'},
        },
    },
}


def _make_piece_with_state(state_id: str, additional_fields: dict | None = None) -> PieceState:
    """ORM-only helper: create a Piece + PieceState, bypassing view-level validation."""
    p = Piece.objects.create(name='Test Piece')
    ps = PieceState(piece=p, state=state_id, additional_fields=additional_fields or {})
    return ps


@pytest.mark.django_db
class TestAdditionalFieldsValidation:
    """Positive and negative cases for PieceState.save() additional_fields validation."""

    # -- state with no additional_fields declared ----------------------------

    def test_no_fields_state_accepts_empty_dict(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_no_fields', {})
            ps.save()  # must not raise

    def test_no_fields_state_rejects_extra_keys(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_no_fields', {'unexpected': 'value'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- required field present / absent ------------------------------------

    def test_required_field_present_passes(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 42.5})
            ps.save()  # must not raise

    def test_required_field_absent_fails(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- type checking -------------------------------------------------------

    def test_number_field_wrong_type_fails(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 'not-a-number'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_optional_string_field_accepts_string(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'optional_str': 'hello'})
            ps.save()  # must not raise

    def test_optional_string_field_wrong_type_fails(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'optional_str': 99})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_integer_field_accepts_integer(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'int_field': 7})
            ps.save()  # must not raise

    def test_integer_field_rejects_float(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'int_field': 7.5})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_boolean_field_accepts_bool(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'bool_field': True})
            ps.save()  # must not raise

    # -- enum field ----------------------------------------------------------

    def test_enum_field_valid_value_passes(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'enum_field': 'beta'})
            ps.save()  # must not raise

    def test_enum_field_invalid_value_fails(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'enum_field': 'delta'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- unknown / extra keys ------------------------------------------------

    def test_extra_key_fails(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'undeclared': 'x'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- state ref ($ref to another state's field) ---------------------------

    def test_state_ref_valid_value_passes(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            # carried_num resolves to number type
            ps = _make_piece_with_state('mock_with_ref', {'carried_num': 3.14})
            ps.save()  # must not raise

    def test_state_ref_wrong_type_fails(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_with_ref', {'carried_num': 'not-a-number'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- global ref ($ref to a globals entry) --------------------------------

    def test_global_ref_valid_value_passes(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            # global_str resolves to string type
            ps = _make_piece_with_state('mock_with_ref', {'global_str': 'Kiln Room'})
            ps.save()  # must not raise

    def test_global_ref_wrong_type_fails(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_with_ref', {'global_str': 123})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- unknown state (not in _STATE_MAP) -----------------------------------

    def test_unknown_state_accepts_empty_dict(self, db):
        """States not in _STATE_MAP get an empty schema — only {} is valid."""
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('totally_unknown_state', {})
            ps.save()  # must not raise

    def test_unknown_state_rejects_any_fields(self, db):
        with patch.object(models_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(models_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('totally_unknown_state', {'foo': 'bar'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()
