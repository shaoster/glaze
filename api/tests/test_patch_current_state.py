import uuid

import pytest
from django.apps import apps
from django.contrib.auth.models import User
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

import api.workflow as workflow_module
from api.models import (
    ENTRY_STATE,
    SUCCESSORS,
    GlazeCombination,
    GlazeType,
    Location,
    Piece,
    PieceState,
)
from api.serializers import PieceStateUpdateSerializer

# ---------------------------------------------------------------------------
# PATCH /api/pieces/{id}/state/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPatchCurrentState:
    def test_update_notes(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"notes": "Updated notes"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["current_state"]["notes"] == "Updated notes"

    def test_update_notes_preserves_trailing_spaces(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"notes": "Updated notes  "},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["current_state"]["notes"] == "Updated notes  "

    def test_update_images(self, client, piece):
        crop = {"x": 0.1, "y": 0.2, "width": 0.7, "height": 0.6}
        images = [
            {
                "url": "http://example.com/img.jpg",
                "caption": "Test",
                "crop": crop,
                "created": "2024-01-01T00:00:00Z",
            }
        ]
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"images": images},
            format="json",
        )
        assert response.status_code == 200
        result_images = response.json()["current_state"]["images"]
        assert len(result_images) == 1
        assert result_images[0]["url"] == "http://example.com/img.jpg"
        assert result_images[0]["crop"] == crop

    def test_update_images_empty_caption(self, client, piece):
        images = [{"url": "http://example.com/img.jpg", "caption": ""}]
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"images": images},
            format="json",
        )
        assert response.status_code == 200
        result_images = response.json()["current_state"]["images"]
        assert len(result_images) == 1
        assert result_images[0]["caption"] == ""

    def test_update_images_missing_caption(self, client, piece):
        images = [{"url": "http://example.com/img.jpg"}]
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"images": images},
            format="json",
        )
        assert response.status_code == 200
        result_images = response.json()["current_state"]["images"]
        assert len(result_images) == 1
        assert result_images[0]["caption"] == ""

    def test_patch_images_without_created(self, client, piece):
        images = [{"url": "http://example.com/img.jpg", "caption": "Test"}]
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"images": images},
            format="json",
        )
        assert response.status_code == 200
        result_images = response.json()["current_state"]["images"]
        assert len(result_images) == 1
        assert result_images[0]["url"] == "http://example.com/img.jpg"
        assert "created" in result_images[0]

    def test_partial_update_leaves_other_fields(self, client, piece):
        # Set notes first — assign to a variable so save() is called on the same object
        state = piece.current_state
        state.notes = "Original notes"
        state.save()
        # Now patch only images
        images = [{"url": "http://example.com/piece.jpg", "caption": "Updated"}]
        client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"images": images},
            format="json",
        )
        data = client.get(f"/api/pieces/{piece.id}/").json()
        assert data["current_state"]["notes"] == "Original notes"
        result_images = data["current_state"]["images"]
        assert any(
            img["url"] == "http://example.com/piece.jpg" for img in result_images
        )

    def test_piece_not_found(self, client, db):
        response = client.patch(
            f"/api/pieces/{uuid.uuid4()}/state/",
            {"notes": "x"},
            format="json",
        )
        assert response.status_code == 404

    def test_non_owner_cannot_patch_shared_piece_state(self, client, other_user):
        foreign_piece = Piece.objects.create(
            user=other_user,
            name="Shared Foreign Piece",
            shared=True,
        )
        PieceState.objects.create(
            user=other_user,
            piece=foreign_piece,
            state=ENTRY_STATE,
        )

        response = client.patch(
            f"/api/pieces/{foreign_piece.id}/state/",
            {"notes": "Nope"},
            format="json",
        )

        assert response.status_code == 404

    def test_piece_with_no_states_returns_404(self, client, user):
        from api.models import Piece

        piece = Piece.objects.create(user=user, name="No History Yet")
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"notes": "x"},
            format="json",
        )
        assert response.status_code == 404
        assert response.json() == {"detail": "Piece has no states."}

    def test_invalid_custom_fields_returns_400(self, client, piece):
        # custom_fields must be a JSON object — passing a list should fail validation
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"custom_fields": ["not", "an", "object"]},
            format="json",
        )
        assert response.status_code == 400

    def test_null_global_ref_custom_field_clears_junction_row(self, client, piece):
        glaze = GlazeType.objects.create(user=None, name="Iron Red")
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[glaze]
        )
        state = piece.current_state
        state.state = "glazed"
        state.save()
        ref_model = apps.get_model("api", "PieceStateGlazeCombinationRef")
        ref_model.objects.create(
            piece_state=state,
            field_name="glaze_combination",
            glaze_combination=combo,
        )

        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"custom_fields": {"glaze_combination": None}},
            format="json",
        )

        assert response.status_code == 200
        assert (
            "glaze_combination" not in response.json()["current_state"]["custom_fields"]
        )
        assert not ref_model.objects.filter(
            piece_state=state,
            field_name="glaze_combination",
        ).exists()

    def test_global_ref_state_ref_auto_populated_on_update(self, client, piece):
        glaze = GlazeType.objects.create(user=None, name="Floating Blue")
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[glaze]
        )
        for state in [
            "wheel_thrown",
            "trimmed",
            "submitted_to_bisque_fire",
            "bisque_fired",
        ]:
            response = client.post(
                f"/api/pieces/{piece.id}/states/", {"state": state}, format="json"
            )
            assert response.status_code == 201
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {
                "state": "glazed",
                "custom_fields": {"glaze_combination": str(combo.pk)},
            },
            format="json",
        )
        assert response.status_code == 201
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "submitted_to_glaze_fire"},
            format="json",
        )
        assert response.status_code == 201
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "glaze_fired"},
            format="json",
        )
        assert response.status_code == 201
        ref_model = apps.get_model("api", "PieceStateGlazeCombinationRef")
        current = piece.current_state
        ref_model.objects.filter(
            piece_state=current,
            field_name="glaze_combination",
        ).delete()

        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"custom_fields": {}},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["current_state"]["custom_fields"]["glaze_combination"][
            "id"
        ] == str(combo.pk)
        # With lazy resolution, no junction row is created for state-refs.
        assert not ref_model.objects.filter(
            piece_state=current,
            field_name="glaze_combination",
        ).exists()

    def test_update_validation_error_when_custom_fields_save_fails(
        self, piece, monkeypatch
    ):
        state = piece.current_state

        def fail_save(*args, **kwargs):
            raise ValueError("bad additional fields")

        monkeypatch.setattr(state, "save", fail_save)
        serializer = PieceStateUpdateSerializer()

        with pytest.raises(ValidationError) as exc:
            serializer.update(state, {"custom_fields": {"unexpected": "value"}})

        assert exc.value.detail == {"custom_fields": "bad additional fields"}

    def test_update_validation_error_when_plain_save_fails(self, piece, monkeypatch):
        state = piece.current_state

        def fail_save(*args, **kwargs):
            raise ValueError("bad plain save")

        monkeypatch.setattr(state, "save", fail_save)
        serializer = PieceStateUpdateSerializer()

        with pytest.raises(ValidationError) as exc:
            serializer.update(state, {"notes": "changed"})

        assert exc.value.detail == {"custom_fields": "bad plain save"}

    def test_cannot_patch_past_state_via_endpoint(self, client, piece):
        """Transitioning seals the old state; PATCH endpoint targets the new current state."""
        next_state = SUCCESSORS[ENTRY_STATE][0]
        client.post(
            f"/api/pieces/{piece.id}/states/", {"state": next_state}, format="json"
        )
        # PATCH now updates the new current state, not the original
        response = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"notes": "On the new state"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["current_state"]["notes"] == "On the new state"


# ---------------------------------------------------------------------------
# _write_global_ref_rows – clear_fields path
# ---------------------------------------------------------------------------

_MOCK_STATE_MAP_REF = {
    "entry_state": {
        "id": "entry_state",
        "visible": True,
        "successors": ["state_with_global"],
    },
    "state_with_global": {
        "id": "state_with_global",
        "visible": True,
        "successors": ["terminal_state"],
        "fields": {"loc_ref": {"$ref": "@location.name"}},
    },
    "terminal_state": {"id": "terminal_state", "visible": True, "terminal": True},
}

_MOCK_GLOBALS_MAP_REF = {
    "location": {"model": "Location", "fields": {"name": {"type": "string"}}}
}


@pytest.mark.django_db
class TestWriteGlobalRefRowsClearFields:
    """Verify that passing clear_fields to _write_global_ref_rows deletes the junction row."""

    def test_clear_fields_deletes_junction_row(self, monkeypatch):
        monkeypatch.setattr(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP_REF)
        monkeypatch.setattr(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP_REF)

        user = User.objects.create(
            username="ref_clear@example.com", email="ref_clear@example.com"
        )
        loc = Location.objects.create(user=user, name="Studio")
        piece = Piece.objects.create(user=user, name="Ref Piece")
        PieceState.objects.create(piece=piece, state="entry_state", user=user)
        piece_state = PieceState.objects.create(
            piece=piece, state="state_with_global", user=user
        )
        ref_model = apps.get_model("api", "PieceStateLocationRef")
        ref_model.objects.create(
            piece_state=piece_state, field_name="loc_ref", location=loc
        )
        assert ref_model.objects.filter(piece_state=piece_state).count() == 1

        from api.serializers import _write_global_ref_rows

        _write_global_ref_rows(
            piece_state,
            {"loc_ref": "location"},
            {},
            clear_fields={"loc_ref"},
        )

        assert ref_model.objects.filter(piece_state=piece_state).count() == 0

    def test_patch_null_global_ref_removes_junction_row(self, monkeypatch):
        """Sending null for a global-ref field in PATCH removes the junction row."""
        monkeypatch.setattr(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP_REF)
        monkeypatch.setattr(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP_REF)
        monkeypatch.setattr(
            workflow_module,
            "SUCCESSORS",
            {
                "entry_state": ["state_with_global"],
                "state_with_global": ["terminal_state"],
            },
        )
        monkeypatch.setattr(
            workflow_module,
            "VALID_STATES",
            {"entry_state", "state_with_global", "terminal_state"},
        )
        monkeypatch.setattr(workflow_module, "ENTRY_STATE", "entry_state")

        user = User.objects.create(
            username="patch_ref@example.com", email="patch_ref@example.com"
        )
        loc = Location.objects.create(user=user, name="Garage")
        piece = Piece.objects.create(user=user, name="Patch Ref Piece")
        PieceState.objects.create(piece=piece, state="entry_state", user=user)
        piece_state = PieceState.objects.create(
            piece=piece, state="state_with_global", user=user
        )
        ref_model = apps.get_model("api", "PieceStateLocationRef")
        ref_model.objects.create(
            piece_state=piece_state, field_name="loc_ref", location=loc
        )

        c = APIClient()
        c.force_authenticate(user=user)
        resp = c.patch(
            f"/api/pieces/{piece.id}/state/",
            {"custom_fields": {"loc_ref": None}},
            format="json",
        )
        assert resp.status_code == 200
        assert ref_model.objects.filter(piece_state=piece_state).count() == 0
