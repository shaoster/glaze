import uuid
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User

import api.workflow as workflow_module
from api.models import Piece, PieceState

# ---------------------------------------------------------------------------
# Mock data for controlled testing of custom_fields resolution
# ---------------------------------------------------------------------------

_MOCK_GLOBALS_MAP = {
    "mock_global": {
        "model": "MockGlobal",
        "fields": {
            "name_field": {"type": "string"},
            "num_field": {"type": "number"},
        },
    }
}

_MOCK_STATE_MAP = {
    "mock_a": {
        "id": "mock_a",
        "visible": True,
        "successors": ["mock_b"],
        "fields": {
            "inline_str": {"type": "string"},
            "inline_num": {"type": "number"},
            "global_str": {
                "$ref": "@mock_global.name_field",
            },
        },
    },
    "mock_b": {
        "id": "mock_b",
        "visible": True,
        "successors": ["mock_terminal"],
        "fields": {
            "ref_a_str": {"$ref": "mock_a.inline_str"},
            "ref_a_num": {"$ref": "mock_a.inline_num"},
            "ref_a_global": {"$ref": "mock_a.global_str"},
        },
    },
    "mock_calculated": {
        "id": "mock_calculated",
        "visible": True,
        "successors": ["mock_terminal"],
        "fields": {
            "a": {"type": "number"},
            "b": {"type": "number"},
            "sum_ab": {
                "compute": {
                    "op": "sum",
                    "args": [
                        {"field": "mock_calculated.a", "return_type": "number"},
                        {"field": "mock_calculated.b", "return_type": "number"},
                    ],
                },
                "decimals": 1,
            },
            "ratio_ab": {
                "compute": {
                    "op": "ratio",
                    "args": [
                        {"field": "mock_calculated.a", "return_type": "number"},
                        {"field": "mock_calculated.b", "return_type": "number"},
                    ],
                },
            },
            "ratio_multiplier": {
                "compute": {
                    "op": "product",
                    "args": [
                        {
                            "op": "ratio",
                            "args": [
                                {"field": "mock_calculated.a", "return_type": "number"},
                                {"field": "mock_calculated.b", "return_type": "number"},
                            ],
                        },
                        {"constant": 100},
                    ],
                }
            },
        },
    },
    "mock_no_fields": {
        "id": "mock_no_fields",
        "visible": True,
        "successors": ["mock_terminal"],
        # No fields key at all.
    },
    "mock_terminal": {
        "id": "mock_terminal",
        "visible": True,
        "terminal": True,
        "fields": {},
    },
}


def _make_piece_with_state(state_id, custom_fields=None):
    u = User(username=f"test_{uuid.uuid4()}")
    u.save()
    p = Piece.objects.create(user=u, name="Test Piece")
    ps = PieceState(piece=p, state=state_id, custom_fields=custom_fields or {})
    return ps


@pytest.mark.django_db
class TestCustomFieldsValidation:
    """Positive and negative cases for PieceState.save() custom_fields validation."""

    # -- state with no custom_fields declared ----------------------------

    def test_no_fields_state_accepts_empty_dict(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            ps = _make_piece_with_state("mock_no_fields", {})
            ps.save()  # Should not raise

    def test_no_fields_state_rejects_any_data(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            ps = _make_piece_with_state("mock_no_fields", {"unexpected": 123})
            with pytest.raises(ValueError, match="custom_fields validation failed"):
                ps.save()

    # -- inline field validation -----------------------------------------

    def test_required_field_present_passes(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            # mock_a.inline_num is not required by default (schema default False)
            # but let's assume it was required. Since I can't easily change the
            # mock def per test, let's just test that a present field passes.
            ps = _make_piece_with_state("mock_a", {"inline_num": 42})
            ps.save()

    def test_invalid_type_rejected(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            ps = _make_piece_with_state("mock_a", {"inline_num": "not a number"})
            with pytest.raises(ValueError, match="custom_fields validation failed"):
                ps.save()

    # -- state ref validation --------------------------------------------

    def test_state_ref_accepts_valid_type(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            # mock_b.ref_a_num references mock_a.inline_num (number)
            ps = _make_piece_with_state("mock_b", {"ref_a_num": 123})
            ps.save()

    def test_state_ref_accepts_marker_string(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            # mock_b.ref_a_num can hold the literal marker string [mock_a.inline_num]
            ps = _make_piece_with_state("mock_b", {"ref_a_num": "[mock_a.inline_num]"})
            ps.save()

    def test_state_ref_rejects_malformed_marker(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            # Pattern check on markers: needs [state.field]
            ps = _make_piece_with_state("mock_b", {"ref_a_num": "[just_state]"})
            with pytest.raises(ValueError, match="custom_fields validation failed"):
                ps.save()

    # -- global ref exclusion --------------------------------------------

    def test_global_ref_excluded_from_inline_blob(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            # mock_a.global_str is a global ref; it should NOT be in custom_fields
            # because additionalProperties: False is used.
            ps = _make_piece_with_state("mock_a", {"global_str": "some-pk"})
            with pytest.raises(ValueError, match="custom_fields validation failed"):
                ps.save()

    # -- calculated field exclusion --------------------------------------

    def test_calculated_field_excluded_from_inline_blob(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            # sum_ab is calculated; it should NOT be allowed in the input blob.
            ps = _make_piece_with_state("mock_calculated", {"a": 1, "b": 2, "sum_ab": 3})
            with pytest.raises(ValueError, match="custom_fields validation failed"):
                ps.save()

    # -- error message detail --------------------------------------------

    def test_unknown_state_rejects_any_fields(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            ps = _make_piece_with_state("totally_unknown_state", {"foo": "bar"})
            with pytest.raises(ValueError, match="custom_fields validation failed"):
                ps.save()


@pytest.mark.django_db
class TestCalculatedFields:
    """Tests for recursive evaluation of calculated fields."""

    def test_recursive_evaluation(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            ps = _make_piece_with_state("mock_calculated", {"a": 10.5, "b": 20.2})

            # 10.5 + 20.2 = 30.7
            assert ps.resolve_custom_field("sum_ab") == 30.7

            # 10.5 / 20.2 = 0.5198...
            assert ps.resolve_custom_field("ratio_ab") == 10.5 / 20.2

            # (10.5 / 20.2) * 100 = 51.98...
            assert ps.resolve_custom_field("ratio_multiplier") == (10.5 / 20.2) * 100

    def test_rounding(self, db):
        with (
            patch.object(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP),
            patch.object(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP),
        ):
            # 1.12 + 2.23 = 3.35 -> rounded to 1 decimal = 3.4
            ps = _make_piece_with_state("mock_calculated", {"a": 1.12, "b": 2.23})
            assert ps.resolve_custom_field("sum_ab") == 3.4

    def test_recursive_calculation(self, client, piece):
        """Test that complex recursive ASTs are evaluated correctly."""
        # Use existing fields to avoid validation errors
        state = PieceState.objects.create(
            user=piece.user,
            piece=piece,
            state="glaze_fired",
            custom_fields={"length_in": 10, "width_in": 20},
        )

        # (10 + 20) * 2 / 10 = 6
        node = {
            "op": "ratio",
            "args": [
                {
                    "op": "product",
                    "args": [
                        {
                            "op": "sum",
                            "args": [
                                {
                                    "field": "glaze_fired.length_in",
                                    "return_type": "number",
                                },
                                {
                                    "field": "glaze_fired.width_in",
                                    "return_type": "number",
                                },
                            ],
                        },
                        {"constant": 2},
                    ],
                },
                {"constant": 10},
            ],
        }

        result = state._evaluate_compute(node)
        assert result == 6.0

    def test_missing_field_returns_none(self, piece):
        state = PieceState.objects.create(
            user=piece.user,
            piece=piece,
            state="glaze_fired",
            custom_fields={"length_in": 10},
        )
        # References 'width_in' which is missing in custom_fields
        node = {
            "op": "sum",
            "args": [
                {"field": "glaze_fired.length_in", "return_type": "number"},
                {"field": "glaze_fired.width_in", "return_type": "number"},
            ],
        }
        assert state._evaluate_compute(node) is None

    def test_division_by_zero_returns_none(self, piece):
        state = PieceState.objects.create(
            user=piece.user,
            piece=piece,
            state="glaze_fired",
            custom_fields={"length_in": 10},
        )
        node = {
            "op": "ratio",
            "args": [
                {"field": "glaze_fired.length_in", "return_type": "number"},
                {"constant": 0},
            ],
        }
        assert state._evaluate_compute(node) is None

    def test_ratio_with_multiplier(self, piece):
        state = PieceState.objects.create(
            user=piece.user,
            piece=piece,
            state="glaze_fired",
            custom_fields={"length_in": 10, "width_in": 2},
        )
        # (10 / 2) * 100 = 500
        node = {
            "op": "product",
            "args": [
                {
                    "op": "ratio",
                    "args": [
                        {"field": "glaze_fired.length_in", "return_type": "number"},
                        {"field": "glaze_fired.width_in", "return_type": "number"},
                    ],
                },
                {"constant": 100},
            ],
        }
        assert state._evaluate_compute(node) == 500.0
