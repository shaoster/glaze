import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from api.models import ENTRY_STATE, Location, Piece, PieceState, Tag

# ---------------------------------------------------------------------------
# GET /api/pieces/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPiecesList:
    def test_list_uses_a_small_number_of_queries(self, client, user):
        location = Location.objects.create(user=user, name="Bench")
        pieces = []
        for i in range(3):
            pieces.append(
                Piece.objects.create(
                    user=user,
                    name=f"Piece {i}",
                    thumbnail={
                        "url": f"https://example.com/thumb-{i}.jpg",
                        "cloudinary_public_id": None,
                        "cloud_name": None,
                    },
                    current_location=location,
                )
            )
        for piece in pieces:
            PieceState.objects.create(piece=piece, state=ENTRY_STATE)

        with CaptureQueriesContext(connection) as ctx:
            response = client.get("/api/pieces/")

        assert response.status_code == 200
        assert len(ctx) <= 5

    def test_empty(self, client):
        response = client.get("/api/pieces/")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["results"] == []

    def test_returns_pieces(self, client, piece):
        response = client.get("/api/pieces/")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["name"] == "Test Bowl"
        assert data["results"][0]["current_state"]["state"] == ENTRY_STATE

    def test_summary_shape(self, client, piece):
        data = client.get("/api/pieces/").json()
        keys = set(data["results"][0].keys())
        assert keys == {
            "id",
            "name",
            "created",
            "current_location",
            "last_modified",
            "thumbnail",
            "shared",
            "is_editable",
            "can_edit",
            "current_state",
            "tags",
            "showcase_story",
            "showcase_fields",
        }

    def test_does_not_include_other_users_pieces(self, client, other_user):
        hidden = Piece.objects.create(user=other_user, name="Hidden Piece")
        PieceState.objects.create(piece=hidden, state=ENTRY_STATE)
        response = client.get("/api/pieces/")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["results"] == []

    def test_filters_by_all_tag_ids_and_deduplicates_results(self, client, piece, user):
        second_piece = Piece.objects.create(user=user, name="Second Bowl")
        PieceState.objects.create(piece=second_piece, state=ENTRY_STATE)
        first_tag = Tag.objects.create(user=user, name="Functional")
        second_tag = Tag.objects.create(user=user, name="Gift")
        third_tag = Tag.objects.create(user=user, name="Sale")

        client.patch(
            f"/api/pieces/{piece.id}/",
            {"tags": [str(first_tag.id), str(second_tag.id), str(third_tag.id)]},
            format="json",
        )
        client.patch(
            f"/api/pieces/{second_piece.id}/",
            {"tags": [str(first_tag.id)]},
            format="json",
        )

        response = client.get(
            "/api/pieces/",
            {"tag_ids": f"{first_tag.id}, {second_tag.id}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert [entry["id"] for entry in data["results"]] == [str(piece.id)]

    def test_pagination_limit_and_offset(self, client, user):
        pieces = [Piece.objects.create(user=user, name=f"Piece {i}") for i in range(5)]
        for p in pieces:
            PieceState.objects.create(piece=p, state=ENTRY_STATE)

        response = client.get("/api/pieces/", {"limit": 2, "offset": 0})
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 5
        assert len(data["results"]) == 2

        response2 = client.get("/api/pieces/", {"limit": 2, "offset": 4})
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["count"] == 5
        assert len(data2["results"]) == 1

    def test_invalid_pagination_params_fall_back_to_defaults(self, client, user):
        pieces = [Piece.objects.create(user=user, name=f"Piece {i}") for i in range(2)]
        for p in pieces:
            PieceState.objects.create(piece=p, state=ENTRY_STATE)

        response = client.get(
            "/api/pieces/", {"limit": "not-an-int", "offset": "also-bad"}
        )

        assert response.status_code == 200
        assert response.json()["count"] == 2
        assert len(response.json()["results"]) == 2

    def test_ordering_by_name(self, client, user):
        names = ["Zebra Vase", "Apple Mug", "Mango Bowl"]
        for name in names:
            p = Piece.objects.create(user=user, name=name)
            PieceState.objects.create(piece=p, state=ENTRY_STATE)

        response = client.get("/api/pieces/", {"ordering": "name"})
        assert response.status_code == 200
        result_names = [r["name"] for r in response.json()["results"]]
        assert result_names == sorted(names)

    def test_ordering_by_name_descending(self, client, user):
        names = ["Zebra Vase", "Apple Mug", "Mango Bowl"]
        for name in names:
            p = Piece.objects.create(user=user, name=name)
            PieceState.objects.create(piece=p, state=ENTRY_STATE)

        response = client.get("/api/pieces/", {"ordering": "-name"})
        assert response.status_code == 200
        result_names = [r["name"] for r in response.json()["results"]]
        assert result_names == sorted(names, reverse=True)

    def test_ordering_by_created(self, client, user):
        pieces = []
        for i in range(3):
            p = Piece.objects.create(user=user, name=f"Piece {i}")
            PieceState.objects.create(piece=p, state=ENTRY_STATE)
            pieces.append(p)

        response = client.get("/api/pieces/", {"ordering": "created"})
        assert response.status_code == 200
        result_ids = [r["id"] for r in response.json()["results"]]
        assert result_ids == [str(p.id) for p in pieces]

    def test_invalid_ordering_falls_back_to_default(self, client, piece):
        response = client.get("/api/pieces/", {"ordering": "nonexistent_field"})
        assert response.status_code == 200
        assert response.json()["count"] == 1
