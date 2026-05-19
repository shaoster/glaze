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

        from api.tasks import _execute_task

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=lambda self_obj, task_obj: _execute_task(task_obj.id),
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

        from api.tasks import _execute_task

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=lambda self_obj, task_obj: _execute_task(task_obj.id),
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
        """Helper: execute task execution logic synchronously in the test thread."""
        from api.tasks import _execute_task

        _execute_task(task_id)

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

    def _make_cloudinary_image(self, user, *, suffix: str = ""):
        from api.models import Image

        return Image.objects.create(
            url=f"https://res.cloudinary.com/demo/image/upload/v1/pieces/mug{suffix}.jpg",
            cloud_name="demo",
            cloudinary_public_id=f"pieces/mug{suffix}",
        )

    def _make_piece_state_image(self, user, image):
        from api.models import Piece, PieceState, PieceStateImage

        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        return PieceStateImage.objects.create(piece_state=state, image=image, order=0)

    def _make_task(self, user, params):
        task = AsyncTask.objects.create(
            user=user, task_type="detect_subject_crop", input_params=params
        )
        return task

    def _run_sync(self, task_id):
        from api.tasks import _execute_task

        _execute_task(task_id)

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
        piece_state_image = self._make_piece_state_image(user, image)
        task = self._make_task(user, {"image_id": str(image.id)})
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"
        assert "Not a Cloudinary image" in task.result["reason"]
        assert piece_state_image.image_id == image.id

    def _mock_crop_run(self, piece_state_image, status, crop=None, error=None):
        """Build a fake CropRun-like object for monkeypatching run_crop_inference."""
        from api.models import CropRun

        source = {
            "type": "automated",
            "backend": "rembg-u2net",
            "deployment": "modal",
            "version": None,
        }
        return CropRun.objects.create(
            image=piece_state_image.image,
            piece_state_image=piece_state_image,
            source=source,
            status=status,
            crop=crop,
            error=error,
        )

    def test_no_subject_detected_is_skipped(self, user, monkeypatch):
        from api.models import CropRun

        image = self._make_cloudinary_image(user)
        piece_state_image = self._make_piece_state_image(user, image)
        crop_run = self._mock_crop_run(piece_state_image, CropRun.Status.NO_SUBJECT)
        monkeypatch.setattr(
            "api.utils.run_crop_inference", lambda psi, async_task=None: crop_run
        )
        task = self._make_task(user, {"image_id": str(image.id)})
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"

    def test_writes_thumbnail_crop_for_piece(self, user, monkeypatch):
        from api.models import CropRun

        image = self._make_cloudinary_image(user)
        piece_state_image = self._make_piece_state_image(user, image)
        crop = {"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.5}
        crop_run = self._mock_crop_run(
            piece_state_image, CropRun.Status.SUCCESS, crop=crop
        )
        monkeypatch.setattr(
            "api.utils.run_crop_inference", lambda psi, async_task=None: crop_run
        )
        task = self._make_task(
            user,
            {
                "image_id": str(image.id),
                "piece_id": str(piece_state_image.piece_state.piece.id),
            },
        )
        self._run_sync(task.id)
        piece_state_image.piece_state.piece.refresh_from_db()
        assert piece_state_image.piece_state.piece.thumbnail_crop == crop
        piece_state_image.refresh_from_db()
        assert piece_state_image.crop == crop
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "success"

    def test_skips_piece_that_already_has_crop(self, user, monkeypatch):
        from api.models import CropRun, Piece, PieceState, PieceStateImage

        image = self._make_cloudinary_image(user)
        existing = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
        piece = Piece.objects.create(
            user=user, name="Mug", thumbnail=image, thumbnail_crop=existing
        )
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        piece_state_image = PieceStateImage.objects.create(
            piece_state=state, image=image, order=0
        )
        crop_run = self._mock_crop_run(
            piece_state_image,
            CropRun.Status.SUCCESS,
            crop={"x": 0.2, "y": 0.2, "width": 0.5, "height": 0.5},
        )
        monkeypatch.setattr(
            "api.utils.run_crop_inference", lambda psi, async_task=None: crop_run
        )
        task = self._make_task(
            user, {"image_id": str(image.id), "piece_id": str(piece.id)}
        )
        self._run_sync(task.id)
        piece.refresh_from_db()
        assert piece.thumbnail_crop == existing  # unchanged
        piece_state_image.refresh_from_db()
        assert piece_state_image.crop == {
            "x": 0.2,
            "y": 0.2,
            "width": 0.5,
            "height": 0.5,
        }
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "success"

    def test_writes_crop_for_piece_state_image(self, user, monkeypatch):
        from api.models import ENTRY_STATE, CropRun, Piece, PieceState, PieceStateImage

        image = self._make_cloudinary_image(user)
        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        ps = PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)
        psi = PieceStateImage.objects.create(
            piece_state=ps, image=image, order=0, crop=None
        )
        crop = {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8}
        crop_run = self._mock_crop_run(psi, CropRun.Status.SUCCESS, crop=crop)
        monkeypatch.setattr(
            "api.utils.run_crop_inference", lambda psi_arg, async_task=None: crop_run
        )
        task = self._make_task(
            user,
            {"image_id": str(image.id), "piece_state_image_id": psi.id},
        )
        self._run_sync(task.id)
        psi.refresh_from_db()
        assert psi.crop == crop

    def test_skips_piece_state_image_that_already_has_crop(self, user, monkeypatch):
        from api.models import ENTRY_STATE, CropRun, Piece, PieceState, PieceStateImage

        image = self._make_cloudinary_image(user)
        existing = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}
        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        ps = PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)
        psi = PieceStateImage.objects.create(
            piece_state=ps, image=image, order=0, crop=existing
        )
        crop_run = self._mock_crop_run(
            psi,
            CropRun.Status.SUCCESS,
            crop={"x": 0.2, "y": 0.2, "width": 0.5, "height": 0.5},
        )
        monkeypatch.setattr(
            "api.utils.run_crop_inference", lambda psi_arg, async_task=None: crop_run
        )
        task = self._make_task(
            user,
            {"image_id": str(image.id), "piece_state_image_id": psi.id},
        )
        self._run_sync(task.id)
        psi.refresh_from_db()
        assert psi.crop == existing  # unchanged
        task.refresh_from_db()
        assert task.result["status"] == "skipped"

    def test_piece_state_image_not_found_is_skipped(self, user, monkeypatch):
        from api.models import CropRun

        image = self._make_cloudinary_image(user)
        piece_state_image = self._make_piece_state_image(user, image)
        crop_run = self._mock_crop_run(
            piece_state_image,
            CropRun.Status.SUCCESS,
            crop={"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.5},
        )
        monkeypatch.setattr(
            "api.utils.run_crop_inference", lambda psi, async_task=None: crop_run
        )
        missing_psi_id = 999999999  # integer PK; guaranteed not to exist
        task = self._make_task(
            user,
            {"image_id": str(image.id), "piece_state_image_id": missing_psi_id},
        )
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"
        assert str(missing_psi_id) in task.result["reason"]

    def test_piece_state_image_image_mismatch_is_skipped(self, user):
        from api.models import Piece, PieceState, PieceStateImage

        image = self._make_cloudinary_image(user)
        other_image = self._make_cloudinary_image(user, suffix="-alt")
        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        psi = PieceStateImage.objects.create(
            piece_state=state, image=other_image, order=0
        )

        task = self._make_task(
            user,
            {"image_id": str(image.id), "piece_state_image_id": psi.id},
        )
        self._run_sync(task.id)
        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"
        assert "belongs to image" in task.result["reason"]


@pytest.mark.django_db(transaction=True)
class TestRemoteDetectSubjectCrop:
    """Verifies offloading to an external service via REMOTE_REMBG_URL."""

    def test_calls_remote_service_when_configured(self, user, monkeypatch):
        import base64
        import io

        from django.conf import settings
        from PIL import Image as PILImage

        from api.models import CropRun, Image, Piece, PieceState, PieceStateImage

        image = Image.objects.create(
            url="https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg",
            cloud_name="demo",
            cloudinary_public_id="pieces/mug",
            user=user,
        )
        piece = Piece.objects.create(user=user, name="Mug", thumbnail=image)
        state = PieceState.objects.create(piece=piece, user=user, state="designed")
        piece_state_image = PieceStateImage.objects.create(
            piece_state=state, image=image, order=0
        )

        # Configure remote URL
        monkeypatch.setattr(
            settings, "REMOTE_REMBG_URL", "https://remote.ai/", raising=False
        )

        # Build a minimal RGBA PNG mask with a non-zero alpha region
        pil_img = PILImage.new("RGBA", (100, 100), (0, 0, 0, 0))
        for x in range(10, 90):
            for y in range(10, 90):
                pil_img.putpixel((x, y), (0, 0, 0, 255))
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        mask_b64 = base64.b64encode(buf.getvalue()).decode()

        # Mock remote POST response returning a mask
        mock_response_post = type(
            "R",
            (),
            {
                "raise_for_status": lambda self: None,
                "json": lambda self: {"mask": mask_b64},
            },
        )()

        posted_calls = []

        def mock_post(url, data=None, json=None, headers=None, timeout=None):
            posted_calls.append(
                {"url": url, "data": data, "json": json, "headers": headers}
            )
            return mock_response_post

        monkeypatch.setattr("requests.post", mock_post)

        # Suppress Cloudinary upload in this test
        monkeypatch.setattr(
            "api.utils.upload_mask_to_cloudinary",
            lambda mask_bytes, img: None,
        )

        task = AsyncTask.objects.create(
            user=user,
            task_type="detect_subject_crop",
            input_params={"image_id": str(image.id), "piece_id": str(piece.id)},
        )

        from api.tasks import _execute_task

        _execute_task(task.id)

        # Verify remote service was called with base URL, not bytes
        assert len(posted_calls) == 1
        assert posted_calls[0]["url"] == "https://remote.ai/"
        # It should send image.url directly
        assert (
            posted_calls[0]["json"]["url"]
            == "https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg"
        )
        assert posted_calls[0]["data"] is None

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "success"

        piece.refresh_from_db()
        assert piece.thumbnail_crop is not None
        piece_state_image.refresh_from_db()
        assert piece_state_image.crop is not None

        # A CropRun row should have been created
        assert CropRun.objects.filter(
            piece_state_image=piece_state_image, status=CropRun.Status.SUCCESS
        ).exists()
