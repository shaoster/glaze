import uuid
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status

from api.models import AsyncTask
from api.tasks import TaskRegistry


@TaskRegistry.register("ping")
def ping_task(task: AsyncTask):
    """A simple demonstrator task that returns a pong result."""
    return {"message": "pong", "input": task.input_params}


@pytest.mark.django_db(transaction=True)
class TestAsyncTasks:
    def test_submit_ping_task(self, client, user):
        client.force_authenticate(user=user)
        url = reverse("tasks-submit")
        data = {"task_type": "ping", "input_params": {"test": "data"}}

        def sync_submit(self_obj, task_obj):
            self_obj._run_task(task_obj.id)

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=sync_submit,
        ):
            response = client.post(url, data, format="json")

        assert response.status_code == status.HTTP_202_ACCEPTED

        # Check database for final state
        task = AsyncTask.objects.get(id=response.data["id"])
        assert task.status == "success"
        assert task.result == {"message": "pong", "input": {"test": "data"}}

    def test_task_permission_isolation(self, client, user, other_user):
        # Task owned by 'other_user'
        task = AsyncTask.objects.create(user=other_user, task_type="ping")

        client.force_authenticate(user=user)
        url = reverse("tasks-detail", kwargs={"task_id": task.id})

        response = client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_submit_unknown_task_type(self, client, user):
        client.force_authenticate(user=user)
        url = reverse("tasks-submit")
        data = {"task_type": "non-existent"}

        def sync_submit(self_obj, task_obj):
            self_obj._run_task(task_obj.id)

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=sync_submit,
        ):
            response = client.post(url, data, format="json")

        assert response.status_code == status.HTTP_202_ACCEPTED

        task = AsyncTask.objects.get(id=response.data["id"])
        assert task.status == "failure"
        assert "Unknown task type" in task.error


@pytest.mark.django_db(transaction=True)
class TestRunTaskErrorPaths:
    """Covers _run_task branches not exercised by the submit-via-API tests."""

    def _run_sync(self, task_id):
        """Helper: execute _run_task synchronously in the test thread."""
        from api.tasks import InMemoryTaskInterface

        InMemoryTaskInterface()._run_task(task_id)

    def test_run_task_does_nothing_when_task_deleted(self, user):
        """If the AsyncTask row is deleted before execution, _run_task logs and returns."""
        task = AsyncTask.objects.create(user=user, task_type="ping")
        missing_id = uuid.uuid4()  # guaranteed not to exist
        # Should not raise
        self._run_sync(missing_id)
        # Original task is unaffected
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.PENDING

    def test_run_task_sets_failure_when_function_raises(self, user):
        """If the registered function raises, task status becomes FAILURE."""
        from api.tasks import TaskRegistry

        @TaskRegistry.register("_test_raises")
        def boom(t):
            raise RuntimeError("kaboom")

        task = AsyncTask.objects.create(user=user, task_type="_test_raises")
        self._run_sync(task.id)

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.FAILURE
        assert "kaboom" in task.error


@pytest.mark.django_db(transaction=True)
class TestDetectSubjectCropTask:
    """Covers the detect_subject_crop task registered in api/tasks.py."""

    def _make_cloudinary_image(self, user):
        from api.models import Image

        return Image.objects.create(
            url="https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg",
            cloud_name="demo",
            cloudinary_public_id="pieces/mug",
        )

    def _make_task(self, user, params):
        task = AsyncTask.objects.create(
            user=user, task_type="detect_subject_crop", input_params=params
        )
        return task

    def _run_sync(self, task_id):
        from api.tasks import InMemoryTaskInterface

        InMemoryTaskInterface()._run_task(task_id)

    def test_missing_image_id_raises(self, user):
        task = self._make_task(user, {})
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.FAILURE
        assert "Missing image_id" in task.error

    def test_non_cloudinary_image_is_skipped(self, user, monkeypatch):
        from api.models import Image

        image = Image.objects.create(
            url="https://example.com/photo.jpg",
            cloud_name=None,
            cloudinary_public_id=None,
        )
        task = self._make_task(user, {"image_id": str(image.id)})
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"
        assert "Not a Cloudinary image" in task.result["reason"]

    def test_no_subject_detected_is_skipped(self, user, monkeypatch):
        image = self._make_cloudinary_image(user)
        monkeypatch.setattr(
            "requests.get",
            lambda url, timeout=30: type(
                "R", (), {"raise_for_status": lambda self: None, "content": b"fake"}
            )(),
        )
        monkeypatch.setattr("api.utils.calculate_subject_crop", lambda _: None)
        task = self._make_task(user, {"image_id": str(image.id)})
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"
        assert "No subject detected" in task.result["reason"]

    def test_writes_thumbnail_crop_for_piece(self, user, monkeypatch):
        from api.models import Piece

        image = self._make_cloudinary_image(user)
        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        crop = {"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.5}
        monkeypatch.setattr(
            "requests.get",
            lambda url, timeout=30: type(
                "R", (), {"raise_for_status": lambda self: None, "content": b"fake"}
            )(),
        )
        monkeypatch.setattr("api.utils.calculate_subject_crop", lambda _: crop)
        task = self._make_task(
            user, {"image_id": str(image.id), "piece_id": str(piece.id)}
        )
        self._run_sync(task.id)
        piece.refresh_from_db()
        assert piece.thumbnail_crop == crop
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "success"

    def test_skips_piece_that_already_has_crop(self, user, monkeypatch):
        from api.models import Piece

        image = self._make_cloudinary_image(user)
        existing = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
        piece = Piece.objects.create(
            user=user, name="Mug", thumbnail=image, thumbnail_crop=existing
        )
        monkeypatch.setattr(
            "requests.get",
            lambda url, timeout=30: type(
                "R", (), {"raise_for_status": lambda self: None, "content": b"fake"}
            )(),
        )
        monkeypatch.setattr(
            "api.utils.calculate_subject_crop",
            lambda _: {"x": 0.2, "y": 0.2, "width": 0.5, "height": 0.5},
        )
        task = self._make_task(
            user, {"image_id": str(image.id), "piece_id": str(piece.id)}
        )
        self._run_sync(task.id)
        piece.refresh_from_db()
        assert piece.thumbnail_crop == existing  # unchanged
        task.refresh_from_db()
        assert task.result["status"] == "skipped"
        assert "already has a thumbnail crop" in task.result["reason"]

    def test_writes_crop_for_piece_state_image(self, user, monkeypatch):
        from api.models import ENTRY_STATE, Piece, PieceState, PieceStateImage

        image = self._make_cloudinary_image(user)
        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        ps = PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)
        psi = PieceStateImage.objects.create(
            piece_state=ps, image=image, order=0, crop=None
        )
        crop = {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8}
        monkeypatch.setattr(
            "requests.get",
            lambda url, timeout=30: type(
                "R", (), {"raise_for_status": lambda self: None, "content": b"fake"}
            )(),
        )
        monkeypatch.setattr("api.utils.calculate_subject_crop", lambda _: crop)
        task = self._make_task(
            user,
            {"image_id": str(image.id), "piece_state_image_id": str(psi.id)},
        )
        self._run_sync(task.id)
        psi.refresh_from_db()
        assert psi.crop == crop

    def test_skips_piece_state_image_that_already_has_crop(self, user, monkeypatch):
        from api.models import ENTRY_STATE, Piece, PieceState, PieceStateImage

        image = self._make_cloudinary_image(user)
        existing = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        ps = PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)
        psi = PieceStateImage.objects.create(
            piece_state=ps, image=image, order=0, crop=existing
        )
        monkeypatch.setattr(
            "requests.get",
            lambda url, timeout=30: type(
                "R", (), {"raise_for_status": lambda self: None, "content": b"fake"}
            )(),
        )
        monkeypatch.setattr(
            "api.utils.calculate_subject_crop",
            lambda _: {"x": 0.2, "y": 0.2, "width": 0.5, "height": 0.5},
        )
        task = self._make_task(
            user,
            {"image_id": str(image.id), "piece_state_image_id": str(psi.id)},
        )
        self._run_sync(task.id)
        psi.refresh_from_db()
        assert psi.crop == existing  # unchanged
        task.refresh_from_db()
        assert task.result["status"] == "skipped"

    def test_piece_state_image_not_found_is_skipped(self, user, monkeypatch):
        image = self._make_cloudinary_image(user)
        monkeypatch.setattr(
            "requests.get",
            lambda url, timeout=30: type(
                "R", (), {"raise_for_status": lambda self: None, "content": b"fake"}
            )(),
        )
        monkeypatch.setattr(
            "api.utils.calculate_subject_crop",
            lambda _: {"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.5},
        )
        missing_psi_id = "999999999"  # integer PK; guaranteed not to exist
        task = self._make_task(
            user,
            {"image_id": str(image.id), "piece_state_image_id": missing_psi_id},
        )
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"
        assert missing_psi_id in task.result["reason"]
