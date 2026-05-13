"""Tests for retroactive state editing (editable mode) — Issue #307."""

import pytest
from rest_framework.test import APIClient

from api.models import ENTRY_STATE, SUCCESSORS, Piece, PieceState

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _advance(client, piece_id, state):
    """Advance a piece to the given state via the API."""
    response = client.post(
        f"/api/pieces/{piece_id}/states/",
        {"state": state},
        format="json",
    )
    assert response.status_code == 201, response.json()
    return response.json()


# ---------------------------------------------------------------------------
# can_reach() — workflow helper
# ---------------------------------------------------------------------------


def test_can_reach_direct_successor():
    from api.workflow import can_reach

    assert can_reach("designed", "wheel_thrown") is True


def test_can_reach_transitive():
    from api.workflow import can_reach

    assert can_reach("designed", "bisque_fired") is True


def test_can_reach_same_state():
    from api.workflow import can_reach

    assert can_reach("designed", "designed") is True


def test_can_reach_impossible():
    from api.workflow import can_reach

    # Cannot go backwards in the workflow.
    assert can_reach("bisque_fired", "designed") is False


# ---------------------------------------------------------------------------
# is_editable toggle
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEditableModeToggle:
    def test_default_not_editable(self, client, piece):
        response = client.get(f"/api/pieces/{piece.id}/")
        assert response.json()["is_editable"] is False

    def test_can_enable_editable_mode(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"is_editable": True},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["is_editable"] is True

    def test_can_seal_piece(self, client, piece):
        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        response = client.patch(
            f"/api/pieces/{piece.id}/", {"is_editable": False}, format="json"
        )
        assert response.status_code == 200
        assert response.json()["is_editable"] is False

    def test_cannot_enable_editable_on_shared_piece(self, client, piece):
        """A shared piece cannot enter editable mode without unsharing first."""
        # Put piece in a terminal state so it can be shared.
        piece.states.all().delete()
        PieceState.objects.create(piece=piece, state="completed", order=1)
        client.patch(f"/api/pieces/{piece.id}/", {"shared": True}, format="json")

        response = client.patch(
            f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json"
        )
        assert response.status_code == 400

    def test_cannot_share_editable_piece(self, client, piece):
        """An editable piece cannot be shared without sealing first."""
        piece.states.all().delete()
        PieceState.objects.create(piece=piece, state="completed", order=1)
        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")

        response = client.patch(
            f"/api/pieces/{piece.id}/", {"shared": True}, format="json"
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Retroactive state insertion and ordering
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestRetroactiveStateInsertion:
    def test_normal_transition_sets_order(self, client, piece):
        """Advancing normally assigns sequential order values."""
        next_state = SUCCESSORS[ENTRY_STATE][0]
        data = _advance(client, piece.id, next_state)

        history = data["history"]
        assert history[0]["state"] == ENTRY_STATE
        assert history[1]["state"] == next_state
        piece.refresh_from_db()
        orders = list(piece.states.order_by("order").values_list("order", flat=True))
        assert orders == [1, 2]

    def test_retroactive_insert_between_states_blocked_by_api(self, client, piece):
        """POST /states/ is blocked while piece is in editable mode."""
        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        piece.refresh_from_db()
        for state in [
            "wheel_thrown",
            "trimmed",
            "submitted_to_bisque_fire",
            "bisque_fired",
        ]:
            PieceState.objects.create(
                piece=piece, state=state, order=piece.states.count() + 1
            )
        PieceState.objects.create(
            piece=piece, state="glazed", order=piece.states.count() + 1
        )

        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "waxed", "notes": "forgotten step"},
            format="json",
        )
        assert response.status_code == 400

    def test_normal_transition_does_not_set_has_been_edited(self, client, piece):
        next_state = SUCCESSORS[ENTRY_STATE][0]
        response = _advance(client, piece.id, next_state)
        history = response["history"]
        new_state = next(ps for ps in history if ps["state"] == next_state)
        assert new_state["has_been_edited"] is False

    def test_state_transition_blocked_when_editable(self, client, piece):
        """POST /states/ is rejected when piece.is_editable, regardless of state validity."""
        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "bisque_fired"},
            format="json",
        )
        assert response.status_code == 400

    def test_state_transition_blocked_when_editable_error_message(self, client, piece):
        """Blocked transition returns an informative error message."""
        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": SUCCESSORS[ENTRY_STATE][0]},
            format="json",
        )
        assert response.status_code == 400
        assert "editable mode" in str(response.json()).lower()

    def test_successor_validation_enforced_when_not_editable(self, client, piece):
        """Non-sequential state insertion is rejected when piece is not editable."""
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "bisque_fired"},
            format="json",
        )
        assert response.status_code == 400

    def test_current_state_reflects_highest_order(self, client, piece):
        """current_state returns the state with the highest order in the ORM-built history."""
        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        piece.refresh_from_db()
        PieceState.objects.create(piece=piece, state="bisque_fired", order=2)
        PieceState.objects.create(piece=piece, state="glazed", order=3)

        response = client.get(f"/api/pieces/{piece.id}/")
        assert response.status_code == 200
        assert response.json()["current_state"]["state"] == "glazed"


# ---------------------------------------------------------------------------
# Past state PATCH endpoint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPastStatePatch:
    def test_returns_403_when_not_editable(self, client, piece):
        state_id = piece.current_state.pk
        response = client.patch(
            f"/api/pieces/{piece.id}/states/{state_id}/",
            {"notes": "retroactive notes"},
            format="json",
        )
        assert response.status_code == 403

    def test_can_patch_past_state_when_editable(self, client, piece):
        initial_state = piece.current_state
        next_state = SUCCESSORS[ENTRY_STATE][0]
        _advance(client, piece.id, next_state)

        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        piece.refresh_from_db()

        response = client.patch(
            f"/api/pieces/{piece.id}/states/{initial_state.pk}/",
            {"notes": "retroactive edit"},
            format="json",
        )
        assert response.status_code == 200
        history = response.json()["history"]
        first = next(ps for ps in history if ps["state"] == ENTRY_STATE)
        assert first["notes"] == "retroactive edit"

    def test_patch_past_state_sets_has_been_edited(self, client, piece):
        initial_state = piece.current_state
        next_state = SUCCESSORS[ENTRY_STATE][0]
        _advance(client, piece.id, next_state)

        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        piece.refresh_from_db()

        client.patch(
            f"/api/pieces/{piece.id}/states/{initial_state.pk}/",
            {"notes": "retroactive edit"},
            format="json",
        )
        initial_state.refresh_from_db()
        assert initial_state.has_been_edited is True

    def test_patch_past_state_returns_403_after_sealing(self, client, piece):
        initial_state = piece.current_state
        next_state = SUCCESSORS[ENTRY_STATE][0]
        _advance(client, piece.id, next_state)

        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": True}, format="json")
        client.patch(f"/api/pieces/{piece.id}/", {"is_editable": False}, format="json")

        response = client.patch(
            f"/api/pieces/{piece.id}/states/{initial_state.pk}/",
            {"notes": "blocked"},
            format="json",
        )
        assert response.status_code == 403

    def test_non_owner_cannot_patch_past_state(self, client, piece, other_user):
        initial_state = piece.current_state
        piece.is_editable = True
        piece.save()

        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.patch(
            f"/api/pieces/{piece.id}/states/{initial_state.pk}/",
            {"notes": "not my piece"},
            format="json",
        )
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Shared piece visibility when editable
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEditableSharedVisibility:
    def _make_shared_terminal(self, user):
        p = Piece.objects.create(user=user, name="Shared Piece")
        PieceState.objects.create(piece=p, state="completed", order=1)
        p.shared = True
        p.save()
        return p

    def test_editable_piece_invisible_to_non_owner(self, piece, other_user):
        piece.states.all().delete()
        PieceState.objects.create(piece=piece, state="completed", order=1)
        piece.shared = True
        piece.is_editable = True
        piece.save()

        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.get(f"/api/pieces/{piece.id}/")
        assert response.status_code == 404

    def test_editable_piece_still_visible_to_owner(self, client, piece):
        piece.is_editable = True
        piece.save()

        response = client.get(f"/api/pieces/{piece.id}/")
        assert response.status_code == 200

    def test_sealed_piece_visible_to_non_owner_again(self, piece, other_user):
        piece.states.all().delete()
        PieceState.objects.create(piece=piece, state="completed", order=1)
        piece.shared = True
        piece.is_editable = True
        piece.save()

        # Seal the piece.
        piece.is_editable = False
        piece.save()

        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.get(f"/api/pieces/{piece.id}/")
        assert response.status_code == 200


# ---------------------------------------------------------------------------
# Glaze combination images analysis — editable pieces excluded
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGlazeCombinationImagesExcludesEditable:
    def test_editable_piece_excluded(self, client, piece, user):
        from django.apps import apps

        from api.models import GlazeCombination, Image, PieceStateImage

        gc = GlazeCombination.objects.create(user=user, name="Test Glaze")
        GlazeCombinationRef = apps.get_model("api", "PieceStateGlazeCombinationRef")

        piece.states.all().delete()
        glazed = PieceState.objects.create(piece=piece, state="glazed", order=1)
        GlazeCombinationRef.objects.create(
            piece_state=glazed, field_name="glaze_combination", glaze_combination=gc
        )
        img = Image.objects.create(user=user, url="https://example.com/img.jpg")
        PieceStateImage.objects.create(piece_state=glazed, image=img, order=1)

        # Without editable: appears in analysis.
        response = client.get("/api/analysis/glaze-combination-images/")
        assert response.status_code == 200
        combo_ids = {entry["glaze_combination"]["id"] for entry in response.json()}
        assert str(gc.pk) in combo_ids

        # Enable editable mode: disappears from analysis.
        piece.is_editable = True
        piece.save()
        response = client.get("/api/analysis/glaze-combination-images/")
        combo_ids_editable = {
            entry["glaze_combination"]["id"] for entry in response.json()
        }
        assert str(gc.pk) not in combo_ids_editable

        # Seal: reappears.
        piece.is_editable = False
        piece.save()
        response = client.get("/api/analysis/glaze-combination-images/")
        combo_ids_sealed = {
            entry["glaze_combination"]["id"] for entry in response.json()
        }
        assert str(gc.pk) in combo_ids_sealed
