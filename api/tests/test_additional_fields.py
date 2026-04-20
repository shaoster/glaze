import uuid
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User

import api.workflow as workflow_module
from api.models import Piece, PieceState


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
        'fields': {
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
        'fields': {
            # State ref — resolves to mock_typed.required_num (number, inline)
            'carried_num': {
                '$ref': 'mock_typed.required_num',
                'description': 'Carried forward from mock_typed.',
            },
            # Global ref — stored in a junction table, NOT in the JSON blob.
            # The inline schema for this state excludes it entirely.
            'global_str': {
                '$ref': '@mock_global.name_field',
            },
        },
    },
    'mock_no_fields': {
        'id': 'mock_no_fields',
        'visible': True,
        'successors': ['mock_terminal'],
        # No fields key at all.
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
    user = User.objects.create(
        username=f'user_{state_id}_{uuid.uuid4().hex[:8]}',
        email=f'user_{state_id}_{uuid.uuid4().hex[:8]}@example.com',
    )
    p = Piece.objects.create(user=user, name='Test Piece')
    ps = PieceState(piece=p, state=state_id, additional_fields=additional_fields or {})
    return ps


@pytest.mark.django_db
class TestAdditionalFieldsValidation:
    """Positive and negative cases for PieceState.save() additional_fields validation."""

    # -- state with no additional_fields declared ----------------------------

    def test_no_fields_state_accepts_empty_dict(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_no_fields', {})
            ps.save()  # must not raise

    def test_no_fields_state_rejects_extra_keys(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_no_fields', {'unexpected': 'value'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- required field present / absent ------------------------------------

    def test_required_field_present_passes(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 42.5})
            ps.save()  # must not raise

    def test_required_field_absent_fails(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- type checking -------------------------------------------------------

    def test_number_field_wrong_type_fails(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 'not-a-number'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_optional_string_field_accepts_string(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'optional_str': 'hello'})
            ps.save()  # must not raise

    def test_optional_string_field_wrong_type_fails(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'optional_str': 99})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_integer_field_accepts_integer(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'int_field': 7})
            ps.save()  # must not raise

    def test_integer_field_rejects_float(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'int_field': 7.5})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_boolean_field_accepts_bool(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'bool_field': True})
            ps.save()  # must not raise

    # -- enum field ----------------------------------------------------------

    def test_enum_field_valid_value_passes(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'enum_field': 'beta'})
            ps.save()  # must not raise

    def test_enum_field_invalid_value_fails(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'enum_field': 'delta'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- unknown / extra keys ------------------------------------------------

    def test_extra_key_fails(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_typed', {'required_num': 1, 'undeclared': 'x'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    # -- state ref ($ref to another state's field) ---------------------------

    def test_state_ref_valid_value_passes(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            # carried_num is a state ref to an inline field — stays in the blob.
            ps = _make_piece_with_state('mock_with_ref', {'carried_num': 3.14})
            ps.save()  # must not raise

    def test_state_ref_wrong_type_fails(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('mock_with_ref', {'carried_num': 'not-a-number'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_state_ref_empty_blob_passes(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            # Empty blob is also valid — state refs are optional by default.
            ps = _make_piece_with_state('mock_with_ref', {})
            ps.save()  # must not raise

    # -- global ref ($ref to a globals entry) --------------------------------
    # Global ref fields are stored in junction tables — they are excluded from
    # the inline JSON schema entirely.  Putting a global-ref value in the blob
    # is now an error (additionalProperties: false on the inline schema).

    def test_global_ref_in_blob_fails(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            # global_str is a global ref — it must NOT appear in the blob.
            ps = _make_piece_with_state('mock_with_ref', {'global_str': 'Kiln Room'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()

    def test_global_ref_absent_from_blob_passes(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            # Blob without global_str is valid; the FK is handled by the serializer.
            ps = _make_piece_with_state('mock_with_ref', {'carried_num': 3.14})
            ps.save()  # must not raise

    # -- unknown state (not in _STATE_MAP) -----------------------------------

    def test_unknown_state_accepts_empty_dict(self, db):
        """States not in _STATE_MAP get an empty schema — only {} is valid."""
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('totally_unknown_state', {})
            ps.save()  # must not raise

    def test_unknown_state_rejects_any_fields(self, db):
        with patch.object(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP), \
             patch.object(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP):
            ps = _make_piece_with_state('totally_unknown_state', {'foo': 'bar'})
            with pytest.raises(ValueError, match='additional_fields validation failed'):
                ps.save()
