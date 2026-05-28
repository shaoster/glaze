from urllib.parse import parse_qs, urlparse

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client

from api.models import AsyncTask, Image


class TestAuthAdminLogin:
    def test_admin_login_redirects_to_apex_bootstrap(self, settings):
        settings.ADMIN_INGRESS_HOST = "admin.potterdoc.com"
        settings.ALLOWED_HOSTS = [
            "localhost",
            "127.0.0.1",
            "potterdoc.com",
            "admin.potterdoc.com",
        ]

        browser = Client()

        response = browser.get(
            "/admin/login/?next=/admin/",
            HTTP_HOST="admin.potterdoc.com",
            secure=True,
        )

        assert response.status_code == 302
        target = urlparse(response["Location"])
        assert target.scheme == "https"
        assert target.netloc == "potterdoc.com"
        assert parse_qs(target.query)["next"] == ["https://admin.potterdoc.com/admin/"]


@pytest.mark.django_db
class TestBackpopulateCropsCommand:
    def _make_cloudinary_image(self, suffix="mug"):
        return Image.objects.create(
            url=f"https://res.cloudinary.com/demo/image/upload/v1/pieces/{suffix}.jpg",
            cloud_name="demo",
            cloudinary_public_id=f"pieces/{suffix}",
        )

    def _make_superuser(self, email="admin@example.com"):
        return User.objects.create_superuser(username=email, email=email, password="x")

    def _make_user(self, email="u@example.com"):
        return User.objects.create(username=email, email=email)

    def test_dry_run_does_not_enqueue_tasks(self):
        """--dry-run prints a count but creates no AsyncTask records."""
        image = self._make_cloudinary_image()
        user = self._make_user()
        from api.models import Piece, PieceState, PieceStateImage

        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        PieceStateImage.objects.create(piece_state=state, image=image, order=0)

        call_command("backpopulate_crops", "--dry-run")

        assert AsyncTask.objects.count() == 0

    def test_no_superuser_raises_command_error(self):
        """Running in live mode without any superuser raises CommandError."""
        with pytest.raises(CommandError, match="No superuser found"):
            call_command("backpopulate_crops")

    def test_live_mode_enqueues_task_for_missing_image_crop(self, monkeypatch):
        """A Cloudinary piece image with no crop gets one AsyncTask enqueued."""
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit", lambda self, task: None
        )
        superuser = self._make_superuser()
        user = self._make_user()
        image = self._make_cloudinary_image()
        from api.models import Piece, PieceState, PieceStateImage

        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        PieceStateImage.objects.create(piece_state=state, image=image, order=0)

        call_command("backpopulate_crops")

        tasks = list(AsyncTask.objects.all())
        assert len(tasks) == 1
        assert tasks[0].task_type == "detect_subject_crop"
        assert tasks[0].input_params["image_id"] == str(image.id)
        assert tasks[0].user == superuser

    def test_skips_images_with_existing_crop_by_default(self, monkeypatch):
        """Images whose piece-state images already have crops are skipped."""
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit", lambda self, task: None
        )
        self._make_superuser()
        user = self._make_user()
        image = self._make_cloudinary_image()
        from api.models import Piece, PieceState, PieceStateImage

        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            order=0,
            crop={"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.6},
        )

        call_command("backpopulate_crops")

        assert AsyncTask.objects.count() == 0

    def test_force_enqueues_tasks_for_existing_crops(self, monkeypatch):
        """--force enqueues a task even when the piece-state image already has crop."""
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit", lambda self, task: None
        )
        self._make_superuser()
        user = self._make_user()
        image = self._make_cloudinary_image()
        from api.models import Piece, PieceState, PieceStateImage

        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            order=0,
            crop={"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.6},
        )

        call_command("backpopulate_crops", "--force")

        assert AsyncTask.objects.count() == 1
