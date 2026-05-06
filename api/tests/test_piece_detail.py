import uuid

import pytest
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from api.models import Location, PieceState, Tag
from api.serializers import _replace_piece_tags

# ---------------------------------------------------------------------------
# GET /api/pieces/{id}/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPieceDetail:
    def test_get(self, client, piece):
        response = client.get(f"/api/pieces/{piece.id}/")
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Bowl"
        assert data["shared"] is False
        assert data["can_edit"] is True
        assert "history" in data
        assert len(data["history"]) == 1

    def test_not_found(self, client, db):
        response = client.get(f"/api/pieces/{uuid.uuid4()}/")
        assert response.status_code == 404

    def test_current_state_has_full_fields(self, client, piece):
        data = client.get(f"/api/pieces/{piece.id}/").json()
        cs = data["current_state"]
        assert {
            "state",
            "notes",
            "created",
            "last_modified",
            "images",
            "custom_fields",
        } <= cs.keys()

    def test_current_location_exposed(self, client, piece, user):
        location = Location.objects.create(user=user, name="Studio Q")
        piece.current_location = location
        piece.save()
        data = client.get(f"/api/pieces/{piece.id}/").json()
        assert data["current_location"] == "Studio Q"

    def test_patch_updates_current_location(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"current_location": "Shelf Z"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["current_location"] == "Shelf Z"
        assert Location.objects.filter(name="Shelf Z").exists()

    def test_patch_reuses_existing_location(self, client, piece, user):
        existing = Location.objects.create(user=user, name="Shelf Z")
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"current_location": "Shelf Z"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["current_location"] == "Shelf Z"
        assert Location.objects.filter(name="Shelf Z").count() == 1
        piece.refresh_from_db()
        assert piece.current_location_id == existing.id

    def test_patch_clears_location_with_null(self, client, piece, user):
        piece.current_location = Location.objects.create(user=user, name="Studio")
        piece.save()
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"current_location": None},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["current_location"] is None
        piece.refresh_from_db()
        assert piece.current_location is None

    def test_patch_clears_location_with_blank(self, client, piece, user):
        piece.current_location = Location.objects.create(user=user, name="Studio")
        piece.save()
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"current_location": ""},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["current_location"] is None
        piece.refresh_from_db()
        assert piece.current_location is None

    def test_create_sets_initial_location(self, client):
        response = client.post(
            "/api/pieces/",
            {"name": "New Mug", "current_location": "Kiln Garden"},
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["current_location"] == "Kiln Garden"
        assert Location.objects.filter(name="Kiln Garden").exists()

    def test_create_reuses_existing_location(self, client, user):
        existing = Location.objects.create(user=user, name="Kiln Garden")
        response = client.post(
            "/api/pieces/",
            {"name": "New Mug", "current_location": "Kiln Garden"},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["current_location"] == "Kiln Garden"
        assert Location.objects.filter(name="Kiln Garden").count() == 1
        from api.models import Piece

        piece = Piece.objects.get(name="New Mug")
        assert piece.current_location_id == existing.id

    def test_create_without_location(self, client):
        response = client.post(
            "/api/pieces/",
            {"name": "Locationless Bowl"},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["current_location"] is None

    def test_new_piece_private_by_default(self, client):
        response = client.post(
            "/api/pieces/",
            {"name": "Private by Default"},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["shared"] is False

    def test_patch_updates_name(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"name": "Revised Vase"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Revised Vase"
        piece.refresh_from_db()
        assert piece.name == "Revised Vase"

    def test_patch_name_without_current_location_preserves_existing_location(
        self, client, piece, user
    ):
        location = Location.objects.create(user=user, name="Studio Shelf")
        piece.current_location = location
        piece.save()

        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"name": "Renamed Only"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["current_location"] == "Studio Shelf"
        piece.refresh_from_db()
        assert piece.current_location_id == location.id

    def test_patch_updates_thumbnail(self, client, piece):
        thumbnail = {
            "url": "https://example.com/thumb.jpg",
            "cloudinary_public_id": "pieces/thumb",
            "cloud_name": "demo-cloud",
        }

        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"thumbnail": thumbnail},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["thumbnail"] == thumbnail
        piece.refresh_from_db()
        assert piece.thumbnail == thumbnail

    def test_owner_can_share_completed_piece(self, client, piece):
        PieceState.objects.create(
            user=piece.user,
            piece=piece,
            state="completed",
        )

        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"shared": True},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["shared"] is True
        piece.refresh_from_db()
        assert piece.shared is True

    def test_owner_can_share_recycled_piece(self, client, piece):
        PieceState.objects.create(
            user=piece.user,
            piece=piece,
            state="recycled",
        )

        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"shared": True},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["shared"] is True

    def test_owner_cannot_share_non_terminal_piece(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"shared": True},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == {"shared": ["Only terminal pieces can be shared."]}
        piece.refresh_from_db()
        assert piece.shared is False

    def test_owner_can_unshare_non_terminal_piece(self, client, piece):
        piece.shared = True
        piece.save()

        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"shared": False},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["shared"] is False
        piece.refresh_from_db()
        assert piece.shared is False

    def test_patch_updates_ordered_tags(self, client, piece, user):
        first = Tag.objects.create(user=user, name="Functional", color="#E76F51")
        second = Tag.objects.create(user=user, name="Gift", color="#2A9D8F")

        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"tags": [str(second.id), str(first.id)]},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["tags"] == [
            {"id": str(second.id), "name": "Gift", "color": "#2A9D8F"},
            {"id": str(first.id), "name": "Functional", "color": "#E76F51"},
        ]

    def test_patch_rejects_unknown_tag_id(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"tags": ["00000000-0000-0000-0000-000000000000"]},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == {
            "tags": ["Invalid tag id: '00000000-0000-0000-0000-000000000000'"]
        }

    def test_replace_piece_tags_rejects_missing_tag_id(self, piece, user):
        with pytest.raises(ValidationError) as exc:
            _replace_piece_tags(piece, user, ["00000000-0000-0000-0000-000000000000"])

        assert exc.value.detail == {
            "tags": ["Invalid tag id: '00000000-0000-0000-0000-000000000000'"]
        }

    def test_patch_name_empty_rejected(self, client, piece):
        response = client.patch(
            f"/api/pieces/{piece.id}/",
            {"name": ""},
            format="json",
        )
        assert response.status_code == 400

    def test_cannot_read_other_users_piece(self, client, other_user):
        from api.models import ENTRY_STATE, Piece, PieceState

        foreign_piece = Piece.objects.create(user=other_user, name="Other User Piece")
        PieceState.objects.create(
            user=other_user, piece=foreign_piece, state=ENTRY_STATE
        )
        response = client.get(f"/api/pieces/{foreign_piece.id}/")
        assert response.status_code == 404

    def test_anonymous_can_read_shared_piece(self, piece):
        PieceState.objects.create(user=piece.user, piece=piece, state="completed")
        piece.shared = True
        piece.save()
        anon = APIClient()

        response = anon.get(f"/api/pieces/{piece.id}/")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Bowl"
        assert data["shared"] is True
        assert data["can_edit"] is False

    def test_anonymous_cannot_read_private_piece(self, piece):
        response = APIClient().get(f"/api/pieces/{piece.id}/")
        assert response.status_code == 404

    def test_anonymous_cannot_patch_shared_piece(self, piece):
        PieceState.objects.create(user=piece.user, piece=piece, state="completed")
        piece.shared = True
        piece.save()
        response = APIClient().patch(
            f"/api/pieces/{piece.id}/",
            {"name": "Nope"},
            format="json",
        )

        assert response.status_code == 403

    def test_non_owner_can_read_shared_piece_read_only(self, client, other_user):
        from api.models import ENTRY_STATE, Piece, PieceState

        foreign_piece = Piece.objects.create(
            user=other_user,
            name="Other User Piece",
            shared=True,
        )
        PieceState.objects.create(
            user=other_user, piece=foreign_piece, state=ENTRY_STATE
        )

        response = client.get(f"/api/pieces/{foreign_piece.id}/")

        assert response.status_code == 200
        assert response.json()["can_edit"] is False

    def test_non_owner_cannot_patch_shared_piece(self, client, other_user):
        from api.models import ENTRY_STATE, Piece, PieceState

        foreign_piece = Piece.objects.create(
            user=other_user,
            name="Other User Piece",
            shared=True,
        )
        PieceState.objects.create(
            user=other_user, piece=foreign_piece, state=ENTRY_STATE
        )

        response = client.patch(
            f"/api/pieces/{foreign_piece.id}/",
            {"name": "Nope"},
            format="json",
        )

        assert response.status_code == 404

    def test_notes_hidden_from_anonymous_viewer(self, piece):
        from api.models import PieceState

        PieceState.objects.create(
            user=piece.user, piece=piece, state="completed", notes="secret notes"
        )
        piece.shared = True
        piece.save()
        anon = APIClient()

        response = anon.get(f"/api/pieces/{piece.id}/")

        assert response.status_code == 200
        data = response.json()
        assert data["current_state"]["notes"] == ""
        assert all(s["notes"] == "" for s in data["history"])

    def test_notes_hidden_from_non_owner(self, client, other_user):
        from api.models import ENTRY_STATE, Piece, PieceState

        foreign_piece = Piece.objects.create(
            user=other_user, name="Other Piece", shared=True
        )
        PieceState.objects.create(
            user=other_user, piece=foreign_piece, state=ENTRY_STATE, notes="owner notes"
        )

        response = client.get(f"/api/pieces/{foreign_piece.id}/")

        assert response.status_code == 200
        assert response.json()["current_state"]["notes"] == ""

    def test_notes_visible_to_owner(self, client, piece):
        from api.models import PieceState

        PieceState.objects.create(
            user=piece.user, piece=piece, state="completed", notes="my notes"
        )
        piece.shared = True
        piece.save()

        response = client.get(f"/api/pieces/{piece.id}/")

        assert response.status_code == 200
        data = response.json()
        assert data["current_state"]["notes"] == "my notes"


# ---------------------------------------------------------------------------
# GET /pieces/{id}
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPublicPieceMetadata:
    def test_shared_piece_spa_response_includes_open_graph_metadata(
        self, client, piece, tmp_path, monkeypatch
    ):
        import backend.urls

        index_html = tmp_path / "index.html"
        index_html.write_text(
            "<html><head><title>PotterDoc</title></head><body></body></html>",
            encoding="utf-8",
        )
        monkeypatch.setattr(backend.urls, "_INDEX_HTML", index_html)
        PieceState.objects.create(user=piece.user, piece=piece, state="completed")
        piece.thumbnail = {
            "url": "https://res.cloudinary.com/demo/image/upload/sample.jpg",
            "cloudinary_public_id": "pieces/sample",
            "cloud_name": "demo",
        }
        piece.shared = True
        piece.save()

        response = client.get(f"/pieces/{piece.id}")

        assert response.status_code == 200
        html = response.content.decode()
        assert "<title>Test Bowl - Completed</title>" in html
        assert '<meta property="og:title" content="Test Bowl - Completed">' in html
        assert (
            f'<meta property="og:url" content="http://testserver/pieces/{piece.id}">'
        ) in html
        assert (
            "https://res.cloudinary.com/demo/image/upload/"
            "c_fill,g_auto,h_600,q_auto,w_600,f_jpg/pieces/sample.jpg"
        ) in html
        assert '<meta name="twitter:card" content="summary_large_image">' in html

    def test_private_piece_spa_response_uses_default_metadata(
        self, client, piece, tmp_path, monkeypatch
    ):
        import backend.urls

        index_html = tmp_path / "index.html"
        index_html.write_text(
            "<html><head><title>PotterDoc</title></head><body></body></html>",
            encoding="utf-8",
        )
        monkeypatch.setattr(backend.urls, "_INDEX_HTML", index_html)

        response = client.get(f"/pieces/{piece.id}")

        assert response.status_code == 200
        html = response.content.decode()
        assert "<title>PotterDoc</title>" in html
        assert "og:title" not in html


# ---------------------------------------------------------------------------
# GET /api/pieces/{id}/current_state/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPieceCurrentStateDetail:
    def test_get(self, client, piece):
        response = client.get(f"/api/pieces/{piece.id}/current_state/")
        assert response.status_code == 200
        data = response.json()
        assert data["state"] == "designed"
        assert "notes" in data
        assert "images" in data
        assert "custom_fields" in data
        assert "previous_state" in data
        assert "next_state" in data

    def test_not_found(self, client):
        response = client.get(f"/api/pieces/{uuid.uuid4()}/current_state/")
        assert response.status_code == 404

    def test_piece_with_no_states_returns_404(self, client, user):
        from api.models import Piece

        piece = Piece.objects.create(user=user, name="No History Yet")
        response = client.get(f"/api/pieces/{piece.id}/current_state/")
        assert response.status_code == 404
        assert response.json() == {"detail": "Piece has no states."}

    def test_cannot_read_other_users_piece(self, client, other_user):
        from api.models import ENTRY_STATE, Piece, PieceState

        foreign_piece = Piece.objects.create(user=other_user, name="Other User Piece")
        PieceState.objects.create(piece=foreign_piece, state=ENTRY_STATE)
        response = client.get(f"/api/pieces/{foreign_piece.id}/current_state/")
        assert response.status_code == 404
