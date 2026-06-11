import uuid

import pytest
from rest_framework.exceptions import ValidationError

from api.models import (
    _MISSING,
    ENTRY_STATE,
    SUCCESSORS,
    ClayBody,
    GlazeCombination,
    GlazeType,
    Location,
    Piece,
    PieceState,
)
from api.serializers import (
    PieceStateCreateSerializer,
    PieceStateSerializer,
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
            f"/api/pieces/{piece.id}/states/",
            {"state": next_state},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["current_state"]["state"] == next_state

    def test_validate_state_allows_first_state_when_piece_has_no_current_state(
        self, user
    ):
        piece = Piece.objects.create(user=user, name="No State Yet")
        serializer = PieceStateCreateSerializer(
            data={"state": ENTRY_STATE},
            context={"piece": piece},
        )

        assert serializer.is_valid(), serializer.errors

    def test_create_first_state_with_images_when_piece_has_no_current_state(self, user):
        piece = Piece.objects.create(user=user, name="First State Images")
        serializer = PieceStateCreateSerializer(
            data={
                "state": ENTRY_STATE,
                "images": [
                    {"url": "https://example.com/first.jpg", "caption": "first"}
                ],
            },
            context={"piece": piece},
        )

        assert serializer.is_valid(), serializer.errors
        state = serializer.save()

        assert state.images[0]["url"] == "https://example.com/first.jpg"
        assert "created" in state.images[0]

    def test_invalid_transition(self, client, piece):
        # 'recycled' is not a direct successor of the entry state
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "recycled"},
            format="json",
        )
        assert response.status_code == 400

    def test_history_grows(self, client, piece):
        next_state = SUCCESSORS[ENTRY_STATE][0]
        client.post(
            f"/api/pieces/{piece.id}/states/", {"state": next_state}, format="json"
        )
        data = client.get(f"/api/pieces/{piece.id}/").json()
        assert len(data["history"]) == 2

    def test_notes_persisted(self, client, piece):
        next_state = SUCCESSORS[ENTRY_STATE][0]
        client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": next_state, "notes": "Looks good"},
            format="json",
        )
        data = client.get(f"/api/pieces/{piece.id}/").json()
        cs = data["current_state"]
        assert cs["notes"] == "Looks good"

    def test_custom_fields_recorded(self, client, piece, user):
        kiln = Location.objects.create(user=user, name="Kiln A")
        client.post(
            f"/api/pieces/{piece.id}/states/", {"state": "wheel_thrown"}, format="json"
        )
        client.post(
            f"/api/pieces/{piece.id}/states/", {"state": "trimmed"}, format="json"
        )
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {
                "state": "submitted_to_bisque_fire",
                "custom_fields": {"kiln_location": str(kiln.pk)},
            },
            format="json",
        )
        assert response.status_code == 201
        cs = response.json()["current_state"]
        assert cs["state"] == "submitted_to_bisque_fire"
        assert cs["custom_fields"]["kiln_location"] == {
            "id": str(kiln.pk),
            "name": "Kiln A",
        }

    def test_create_records_images_and_global_ref_field(self, client, piece, user):
        clay = ClayBody.objects.create(user=user, name="Speckled Stoneware")

        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {
                "state": "wheel_thrown",
                "images": [
                    {"url": "https://example.com/throwing.jpg", "caption": "throwing"}
                ],
                "custom_fields": {
                    "clay_weight_lbs": 2.5,
                    "clay_body": str(clay.pk),
                },
            },
            format="json",
        )

        assert response.status_code == 201
        current = response.json()["current_state"]
        assert current["images"][0]["url"] == "https://example.com/throwing.jpg"
        assert "created" in current["images"][0]
        assert current["custom_fields"]["clay_weight_lbs"] == 2.5
        assert current["custom_fields"]["clay_body"] == {
            "id": str(clay.pk),
            "name": "Speckled Stoneware",
        }

    def test_create_records_images_with_dimensions(self, client, piece):
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {
                "state": "wheel_thrown",
                "images": [
                    {
                        "url": "https://example.com/throwing.jpg",
                        "caption": "throwing",
                        "width": 1200,
                        "height": 900,
                    }
                ],
            },
            format="json",
        )
        assert response.status_code == 201
        current = response.json()["current_state"]
        image_data = current["images"][0]
        assert image_data["url"] == "https://example.com/throwing.jpg"
        assert image_data["width"] == 1200
        assert image_data["height"] == 900

    def test_create_returns_validation_error_for_invalid_inline_field(
        self, client, piece
    ):
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {
                "state": "wheel_thrown",
                "custom_fields": {"clay_weight_lbs": "heavy"},
            },
            format="json",
        )

        assert response.status_code == 400
        assert "custom_fields" in response.json()

    def test_invalid_custom_fields_returns_400(self, client, piece):
        # custom_fields must be a JSON object — passing a list should fail validation
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {
                "state": SUCCESSORS[ENTRY_STATE][0],
                "custom_fields": ["not", "an", "object"],
            },
            format="json",
        )
        assert response.status_code == 400

    def test_new_state_has_empty_custom_fields_when_no_source(
        self, client, piece, user
    ):
        # If the source field for a state ref was never set, the new state's
        # custom_fields should not include that ref field.
        clay = ClayBody.objects.create(user=user, name="Stoneware")
        client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "wheel_thrown", "custom_fields": {"clay_body": str(clay.pk)}},
            format="json",
        )
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "trimmed"},
            format="json",
        )
        assert response.status_code == 201
        # clay_weight_lbs was not recorded in wheel_thrown, so pre_trim_weight_lbs
        # should not be auto-populated.
        assert response.json()["current_state"]["custom_fields"] == {}

    def test_state_ref_fields_auto_populated_on_transition(self, client, piece):
        # When wheel_thrown.clay_weight_lbs is recorded, transitioning to trimmed
        # should carry it forward into pre_trim_weight_lbs automatically.
        client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "wheel_thrown", "custom_fields": {"clay_weight_lbs": 1000}},
            format="json",
        )
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "trimmed"},
            format="json",
        )
        assert response.status_code == 201
        assert (
            response.json()["current_state"]["custom_fields"]["pre_trim_weight_lbs"]
            == 1000
        )

    def test_state_ref_client_value_ignored(self, client, piece):
        # Fields defined as state-refs are read-only: client input is ignored
        # and the marker is always used.
        client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "wheel_thrown", "custom_fields": {"clay_weight_lbs": 1000}},
            format="json",
        )
        response = client.post(
            f"/api/pieces/{piece.id}/states/",
            {"state": "trimmed", "custom_fields": {"pre_trim_weight_lbs": 999}},
            format="json",
        )
        assert response.status_code == 201
        # It should resolve to 1000 (from ancestor) NOT 999 (client input)
        assert (
            response.json()["current_state"]["custom_fields"]["pre_trim_weight_lbs"]
            == 1000
        )

    def test_global_ref_state_ref_auto_populated_on_transition(self, client, piece):
        glaze = GlazeType.objects.create(user=None, name="Copper Blue")
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
        assert response.json()["current_state"]["custom_fields"][
            "glaze_combination"
        ] == {"id": str(combo.pk), "name": "Copper Blue"}

    def test_piece_not_found(self, client, db):
        response = client.post(
            f"/api/pieces/{uuid.uuid4()}/states/",
            {"state": ENTRY_STATE},
            format="json",
        )
        assert response.status_code == 404

    def test_non_owner_cannot_add_state_to_shared_piece(self, client, other_user):
        foreign_piece = Piece.objects.create(
            user=other_user,
            name="Shared Foreign Piece",
            shared=True,
        )
        from api.models import PieceState

        PieceState.objects.create(
            user=other_user, piece=foreign_piece, state=ENTRY_STATE
        )

        response = client.post(
            f"/api/pieces/{foreign_piece.id}/states/",
            {"state": SUCCESSORS[ENTRY_STATE][0]},
            format="json",
        )

        assert response.status_code == 404

    def test_summary_serializer_asserts_piece_has_current_state(self, user):
        piece = Piece.objects.create(user=user, name="Broken Summary")
        serializer = PieceSummarySerializer()

        with pytest.raises(AssertionError, match="has no states"):
            serializer.get_current_state(piece)

    def test_write_global_ref_rows_rejects_missing_global_id(self, piece):
        state = piece.current_state

        with pytest.raises(ValidationError) as exc:
            _write_global_ref_rows(
                state,
                {"kiln_location": "location"},
                {"kiln_location": "00000000-0000-0000-0000-000000000000"},
            )

        assert exc.value.detail == {
            "custom_fields.kiln_location": "Invalid location id: '00000000-0000-0000-0000-000000000000'"
        }


class TestPieceStateSerializerNavigation:
    def test_navigation_with_prefetched_states_missing_obj(self, user):
        piece = Piece.objects.create(user=user, name="Prefetch Test")
        s1 = PieceState.objects.create(piece=piece, state="designed", order=1)
        s2 = PieceState.objects.create(piece=piece, state="trimmed", order=2)

        # Simulate prefetching but exclude s2 from the list
        piece._prefetched_objects_cache = {"states": [s1]}

        serializer = PieceStateSerializer()
        # Should return None if the state isn't in the prefetched list
        assert serializer.get_previous_state(s2) is None
        assert serializer.get_next_state(s2) is None

    def test_prefetched_state_returns_missing_sentinel_when_not_prefetched(self, user):
        piece = Piece.objects.create(user=user, name="Missing Prefetch Test")

        assert piece._prefetched_state("designed") is _MISSING

    def test_prefetched_state_returns_none_when_no_state_matches(self, user):
        piece = Piece.objects.create(user=user, name="No Match Prefetch Test")
        state = PieceState.objects.create(piece=piece, state="designed", order=1)
        piece._prefetched_objects_cache = {"states": [state]}

        assert piece._prefetched_state("trimmed") is None

    def test_current_state_returns_none_for_empty_prefetched_list(self, user):
        piece = Piece.objects.create(user=user, name="Empty Prefetch Test")
        piece._prefetched_objects_cache = {"states": []}

        assert piece.current_state is None

    def test_last_modified_uses_fields_timestamp_when_no_states(self, user):
        piece = Piece.objects.create(user=user, name="No States Last Modified")

        assert piece.last_modified == piece.fields_last_modified

    def test_thumbnail_crop_returns_none_without_thumbnail(self, user):
        piece = Piece.objects.create(user=user, name="No Thumbnail")

        assert piece.get_thumbnail_crop() is None

    def test_thumbnail_crop_returns_link_crop_from_history(self, user):
        piece = Piece.objects.create(user=user, name="With Thumbnail")
        state = PieceState.objects.create(piece=piece, state="designed", order=1)
        from api.models import Image, PieceStateImage

        image = Image.objects.create(
            user=user,
            url="https://example.com/thumb.jpg",
        )
        piece.thumbnail = image
        piece.save(update_fields=["thumbnail"])
        PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            order=0,
            crop={"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4},
        )

        assert piece.get_thumbnail_crop() == {
            "x": 0.1,
            "y": 0.2,
            "width": 0.3,
            "height": 0.4,
        }

    def test_piece_str_returns_name(self, user):
        piece = Piece.objects.create(user=user, name="Label Test")

        assert str(piece) == "Label Test"

    def test_workflow_version_matches_piece(self, user):
        piece = Piece.objects.create(user=user, name="Workflow Version Test")

        assert (
            PieceState(piece=piece, state="designed").workflow_version
            == piece.workflow_version
        )

    def test_piece_sort_key_orders_unordered_states_last(self, user):
        piece = Piece.objects.create(user=user, name="Sort Key Test")
        ordered = PieceState.objects.create(piece=piece, state="designed", order=2)
        unordered = PieceState(piece=piece, state="trimmed", order=None)
        unordered.created = ordered.created

        assert Piece._state_sort_key(ordered) == (True, 2, ordered.created)
        assert Piece._state_sort_key(unordered) == (False, -1, unordered.created)

    def test_navigation_without_order(self, user):
        piece = Piece.objects.create(user=user, name="No Order Test")
        # Ensure distinct 'created' times by saving explicitly if needed,
        # but usually separate creates are enough.
        s1 = PieceState.objects.create(piece=piece, state="designed", order=None)
        s2 = PieceState.objects.create(piece=piece, state="trimmed", order=None)
        s1.order = None
        s2.order = None

        serializer = PieceStateSerializer()
        assert serializer.get_previous_state(s2) == "designed"
        assert serializer.get_next_state(s1) == "trimmed"
        assert serializer.get_previous_state(s1) is None
        assert serializer.get_next_state(s2) is None

    def test_editable_insert_prefers_predecessor_order(self, user):
        piece = Piece.objects.create(user=user, name="Editable Pred")
        piece.is_editable = True
        piece.save(update_fields=["is_editable"])
        PieceState.objects.create(piece=piece, state="wheel_thrown", order=1)
        PieceState.objects.create(piece=piece, state="glazed", order=3)

        serializer = PieceStateCreateSerializer(context={"piece": piece})
        state = serializer.create(
            {"state": "trimmed", "custom_fields": {}, "images": []}
        )

        assert state.order == 2
        assert list(piece.states.order_by("order").values_list("state", flat=True)) == [
            "wheel_thrown",
            "trimmed",
            "glazed",
        ]

    def test_editable_insert_uses_successor_order_when_no_predecessor(self, user):
        piece = Piece.objects.create(user=user, name="Editable Succ")
        piece.is_editable = True
        piece.save(update_fields=["is_editable"])
        PieceState.objects.create(piece=piece, state="glazed", order=3)

        serializer = PieceStateCreateSerializer(context={"piece": piece})
        state = serializer.create(
            {"state": "wheel_thrown", "custom_fields": {}, "images": []}
        )

        assert state.order == 3
        assert list(piece.states.order_by("order").values_list("state", flat=True)) == [
            "wheel_thrown",
            "glazed",
        ]
