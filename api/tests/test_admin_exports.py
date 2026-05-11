import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import Client
from django.urls import reverse

from api.admin import PieceAdmin, PieceResource, PieceStateAdmin, PieceStateResource
from api.models import Piece, PieceState


@pytest.mark.django_db
class TestAdminExports:
    def test_piece_and_piece_state_changelists_show_export_button(self):
        admin_user = get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="password123",
        )
        client = Client()
        client.force_login(admin_user)

        piece_response = client.get(reverse("admin:api_piece_changelist"))
        state_response = client.get(reverse("admin:api_piecestate_changelist"))

        assert piece_response.status_code == 200
        assert state_response.status_code == 200
        assert "export/" in piece_response.content.decode()
        assert "export/" in state_response.content.decode()

    def test_piece_and_piece_state_resources_export_associated_data(self, user):
        piece = Piece.objects.create(user=user, name="Moon Jar")
        PieceState.objects.create(
            piece=piece,
            user=user,
            state="designed",
            notes="Initial sketch",
            images=[{"url": "https://example.com/sketch.jpg", "caption": "Sketch"}],
            custom_fields={},
        )
        PieceState.objects.create(
            piece=piece,
            user=user,
            state="handbuilt",
            notes="Built by hand",
            images=[],
            custom_fields={},
        )

        piece_dataset = PieceResource().export(Piece.objects.filter(pk=piece.pk))
        state_dataset = PieceStateResource().export(
            PieceState.objects.filter(piece=piece)
        )

        assert piece_dataset.headers[:7] == [
            "id",
            "user__email",
            "user__username",
            "name",
            "current_state",
            "current_location",
            "state_count",
        ]
        assert piece_dataset.dict[0]["name"] == "Moon Jar"
        assert piece_dataset.dict[0]["current_state"] == "handbuilt"
        assert piece_dataset.dict[0]["state_count"] == 2
        exported_history = piece_dataset.dict[0]["history"]
        assert [row["state"] for row in exported_history] == ["designed", "handbuilt"]
        assert exported_history[0]["notes"] == "Initial sketch"
        assert exported_history[1]["notes"] == "Built by hand"

        assert state_dataset.headers[:4] == [
            "id",
            "piece_id",
            "piece_name",
            "piece_workflow_version",
        ]
        assert [row["state"] for row in state_dataset.dict] == ["designed", "handbuilt"]
        assert all(row["piece_name"] == "Moon Jar" for row in state_dataset.dict)
        assert all(row["piece_id"] == str(piece.id) for row in state_dataset.dict)

    def test_piece_resource_yaml_export_includes_plain_history(self, user):
        piece = Piece.objects.create(user=user, name="Moon Jar")
        PieceState.objects.create(
            piece=piece,
            user=user,
            state="designed",
            notes="",
            images=[],
            custom_fields={},
        )
        PieceState.objects.create(
            piece=piece,
            user=user,
            state="handbuilt",
            notes="",
            images=[],
            custom_fields={},
        )

        dataset = PieceResource().export(Piece.objects.filter(pk=piece.pk))
        yaml_output = dataset.export("yaml")

        assert "history:" in yaml_output
        assert "state: designed" in yaml_output
        assert "state: handbuilt" in yaml_output

    def test_piece_admin_current_state_display_handles_missing_state(self, user):
        piece = Piece.objects.create(user=user, name="No State")
        ma = PieceAdmin(Piece, AdminSite())

        assert ma.get_current_state(piece) == "—"

    def test_piece_admin_current_state_display_returns_current_state(self, user):
        piece = Piece.objects.create(user=user, name="With State")
        PieceState.objects.create(piece=piece, user=user, state="designed")
        ma = PieceAdmin(Piece, AdminSite())

        assert ma.get_current_state(piece) == "designed"

    def test_piece_state_admin_save_model_passes_sealed_override(self, user):
        piece = Piece.objects.create(user=user, name="Sealed State")
        old_state = PieceState.objects.create(piece=piece, user=user, state="designed")
        PieceState.objects.create(piece=piece, user=user, state="handbuilt")
        old_state.notes = "Corrected by admin"
        form = type("FakeForm", (), {"cleaned_data": {"allow_sealed_edit": True}})()

        PieceStateAdmin(PieceState, AdminSite()).save_model(
            request=None,
            obj=old_state,
            form=form,
            change=True,
        )

        old_state.refresh_from_db()
        assert old_state.notes == "Corrected by admin"


@pytest.mark.django_db
class TestRerunTasksAdminAction:
    """Covers the rerun_tasks admin action in api/admin.py."""

    def _make_admin_client(self):
        from django.contrib.auth import get_user_model
        from django.test import Client

        admin = get_user_model().objects.create_superuser(
            username="admin2@example.com",
            email="admin2@example.com",
            password="x",
        )
        c = Client()
        c.force_login(admin)
        return c

    def test_rerun_tasks_resets_status_and_resubmits(self, monkeypatch):
        from django.contrib.auth import get_user_model
        from django.urls import reverse

        from api.models import AsyncTask

        submitted = []
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit",
            lambda self, task: submitted.append(task.id),
        )

        owner = get_user_model().objects.create(
            username="owner@example.com", email="owner@example.com"
        )
        t1 = AsyncTask.objects.create(
            user=owner,
            task_type="ping",
            status=AsyncTask.Status.FAILURE,
            error="old error",
        )
        t2 = AsyncTask.objects.create(
            user=owner,
            task_type="ping",
            status=AsyncTask.Status.FAILURE,
        )

        client = self._make_admin_client()
        url = reverse("admin:api_asynctask_changelist")
        response = client.post(
            url,
            {
                "action": "rerun_tasks",
                "_selected_action": [str(t1.id), str(t2.id)],
            },
        )

        assert response.status_code in (200, 302)

        t1.refresh_from_db()
        t2.refresh_from_db()
        assert t1.status == AsyncTask.Status.PENDING
        assert t1.error is None
        assert t2.status == AsyncTask.Status.PENDING
        assert len(submitted) == 2
