import pytest

from api.models import ENTRY_STATE, Image, Piece

# ---------------------------------------------------------------------------
# POST /api/pieces/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPiecesCreate:
    def test_create(self, client, db):
        response = client.post("/api/pieces/", {"name": "Clay Mug"}, format="json")
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Clay Mug"
        assert data["current_state"]["state"] == ENTRY_STATE

    def test_create_sets_entry_state(self, client, db):
        client.post("/api/pieces/", {"name": "Bowl"}, format="json")
        piece = Piece.objects.get()
        assert piece.states.count() == 1
        assert piece.current_state.state == ENTRY_STATE

    def test_create_missing_name(self, client, db):
        response = client.post("/api/pieces/", {}, format="json")
        assert response.status_code == 400

    def test_create_detail_shape(self, client, db):
        data = client.post("/api/pieces/", {"name": "Vase"}, format="json").json()
        assert "history" in data
        assert len(data["history"]) == 1

    def test_create_with_notes(self, client, db):
        response = client.post(
            "/api/pieces/", {"name": "Mug", "notes": "Wide handle"}, format="json"
        )
        assert response.status_code == 201
        data = response.json()
        assert data["current_state"]["notes"] == "Wide handle"

    def test_create_notes_too_long(self, client, db):
        response = client.post(
            "/api/pieces/", {"name": "Mug", "notes": "x" * 301}, format="json"
        )
        assert response.status_code == 400

    def test_create_notes_defaults_empty(self, client, db):
        response = client.post("/api/pieces/", {"name": "Cup"}, format="json")
        assert response.status_code == 201
        data = response.json()
        assert data["current_state"]["notes"] == ""

    def test_create_with_cloudinary_thumbnail_queues_task(self, client, monkeypatch):
        submitted = []
        thumbnail = Image.objects.create(
            user=None,
            url="https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg",
            cloud_name="demo",
            cloudinary_public_id="pieces/mug",
        )

        monkeypatch.setattr(
            "api.tasks.get_task_interface",
            lambda: type(
                "FakeTaskInterface",
                (),
                {"submit": lambda self, task: submitted.append(task.input_params)},
            )(),
        )
        monkeypatch.setattr(
            "api.serializers.normalize_image_payload",
            lambda payload, user=None: thumbnail,
        )

        response = client.post(
            "/api/pieces/",
            {
                "name": "Cloud Mug",
                "thumbnail": "https://example.com/ignored.jpg",
            },
            format="json",
        )

        assert response.status_code == 201
        assert submitted == [
            {
                "image_id": response.json()["thumbnail"]["image_id"],
                "piece_id": response.json()["id"],
            }
        ]
