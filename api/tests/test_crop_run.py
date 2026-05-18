"""Tests for CropRun model, run_crop_inference, and the CropRun API endpoints."""

import base64
import io
from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from django.db.models.deletion import ProtectedError
from PIL import Image as PILImage
from rest_framework import status

from api.models import AsyncTask, CropRun, Image, Piece, PieceState, PieceStateImage


def _make_mask_b64(has_subject: bool = True) -> str:
    """Create a minimal valid RGBA PNG mask, optionally with foreground pixels."""
    img = PILImage.new("RGBA", (100, 100), (0, 0, 0, 0))
    if has_subject:
        for x in range(20, 80):
            for y in range(20, 80):
                img.putpixel((x, y), (0, 0, 0, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


MOCK_MASK_B64 = _make_mask_b64(has_subject=True)
EMPTY_MASK_B64 = _make_mask_b64(has_subject=False)


@pytest.fixture
def image(db, user):
    return Image.objects.create(
        url="https://res.cloudinary.com/demo/image/upload/test.jpg",
        cloud_name="demo",
        cloudinary_public_id="test",
        user=user,
    )


@pytest.fixture
def piece_with_image(db, user, image):
    p = Piece.objects.create(user=user, name="Test Piece", thumbnail=image)
    state = PieceState.objects.create(piece=p, state="designed", order=1)
    PieceStateImage.objects.create(piece_state=state, image=image, order=0)
    return p


@pytest.fixture
def piece_state_image(piece_with_image, image):
    return PieceStateImage.objects.get(piece_state__piece=piece_with_image, image=image)


@pytest.fixture
def other_user(db):
    return User.objects.create(username="other@example.com", email="other@example.com")


@pytest.mark.django_db
class TestRunCropInference:
    def test_crop_run_on_success(self, piece_state_image, image):
        from api.utils import run_crop_inference

        with patch(
            "api.utils.calculate_subject_mask_remote",
            return_value={"mask": MOCK_MASK_B64},
        ):
            with patch("api.utils.upload_mask_to_cloudinary", return_value=None):
                crop_run = run_crop_inference(piece_state_image)

        assert crop_run.status == CropRun.Status.SUCCESS
        assert crop_run.crop is not None
        assert "x" in crop_run.crop
        assert "y" in crop_run.crop
        assert "width" in crop_run.crop
        assert "height" in crop_run.crop
        assert crop_run.latency_ms is not None
        assert crop_run.latency_ms >= 0
        assert crop_run.piece_state_image_id == piece_state_image.id

    def test_crop_run_on_no_subject(self, piece_state_image):
        from api.utils import run_crop_inference

        with patch(
            "api.utils.calculate_subject_mask_remote",
            return_value={"mask": None},
        ):
            crop_run = run_crop_inference(piece_state_image)

        assert crop_run.status == CropRun.Status.NO_SUBJECT
        assert crop_run.crop is None

    def test_crop_run_on_empty_alpha_mask(self, piece_state_image):
        from api.utils import run_crop_inference

        with patch(
            "api.utils.calculate_subject_mask_remote",
            return_value={"mask": EMPTY_MASK_B64},
        ):
            crop_run = run_crop_inference(piece_state_image)

        assert crop_run.status == CropRun.Status.NO_SUBJECT

    def test_crop_run_on_error(self, piece_state_image):
        from api.utils import run_crop_inference

        with patch(
            "api.utils.calculate_subject_mask_remote",
            side_effect=Exception("network failure"),
        ):
            crop_run = run_crop_inference(piece_state_image)

        assert crop_run.status == CropRun.Status.ERROR
        assert crop_run.error == "network failure"

    def test_crop_run_associates_async_task(self, piece_state_image, user):
        from api.utils import run_crop_inference

        task = AsyncTask.objects.create(user=user, task_type="detect_subject_crop")

        with patch(
            "api.utils.calculate_subject_mask_remote",
            return_value={"mask": None},
        ):
            crop_run = run_crop_inference(piece_state_image, async_task=task)

        assert crop_run.async_task_id == task.id


@pytest.mark.django_db
class TestCropRunViewSet:
    def _client(self, user):
        from rest_framework.test import APIClient

        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def test_human_run_owner_allowed(self, user, piece_state_image):
        client = self._client(user)
        url = "/api/crop-runs/"
        payload = {
            "piece_state_image_id": str(piece_state_image.id),
            "crop": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8},
        }
        response = client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data["image_id"]) == str(piece_state_image.image_id)
        assert str(response.data["piece_state_image_id"]) == str(piece_state_image.id)
        assert response.data["crop"] == payload["crop"]
        assert CropRun.objects.filter(
            piece_state_image=piece_state_image, source__type="human"
        ).exists()

    def test_human_run_requires_crop(self, user, piece_state_image):
        client = self._client(user)
        url = "/api/crop-runs/"
        payload = {"piece_state_image_id": str(piece_state_image.id)}
        response = client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_human_run_non_owner_denied(self, other_user, piece_state_image):
        client = self._client(other_user)
        url = "/api/crop-runs/"
        payload = {
            "piece_state_image_id": str(piece_state_image.id),
            "crop": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8},
        }
        response = client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_human_run_admin_allowed(self, db, piece_state_image):
        admin = User.objects.create(
            username="admin@example.com", email="admin@example.com", is_staff=True
        )
        client = self._client(admin)
        url = "/api/crop-runs/"
        payload = {
            "piece_state_image_id": str(piece_state_image.id),
            "crop": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8},
        }
        response = client.post(url, payload, format="json")
        assert response.status_code == status.HTTP_201_CREATED
        assert str(response.data["image_id"]) == str(piece_state_image.image_id)
        assert str(response.data["piece_state_image_id"]) == str(piece_state_image.id)

    def test_list_returns_own_runs(self, user, piece_state_image):
        CropRun.objects.create(
            image=piece_state_image.image,
            piece_state_image=piece_state_image,
            source={
                "type": "automated",
                "backend": "rembg-u2net",
                "deployment": "modal",
                "version": None,
            },
            status=CropRun.Status.SUCCESS,
            crop={"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8},
        )
        client = self._client(user)
        url = "/api/crop-runs/"
        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_unauthenticated_denied(self):
        from rest_framework.test import APIClient

        client = APIClient()
        response = client.get("/api/crop-runs/")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestImageCropRunsView:
    def _client(self, user):
        from rest_framework.test import APIClient

        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def test_list_runs_for_image(self, user, piece_with_image, image):
        CropRun.objects.create(
            image=image,
            piece_state_image=PieceStateImage.objects.get(
                piece_state__piece=piece_with_image, image=image
            ),
            source={
                "type": "automated",
                "backend": "rembg-u2net",
                "deployment": "modal",
                "version": None,
            },
            status=CropRun.Status.NO_SUBJECT,
        )
        client = self._client(user)
        url = f"/api/images/{image.id}/crop-runs/"
        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_latest_filter(self, user, piece_with_image, image):
        piece_state_image = PieceStateImage.objects.get(
            piece_state__piece=piece_with_image, image=image
        )
        for _ in range(3):
            CropRun.objects.create(
                image=image,
                piece_state_image=piece_state_image,
                source={
                    "type": "automated",
                    "backend": None,
                    "deployment": None,
                    "version": None,
                },
                status=CropRun.Status.NO_SUBJECT,
            )
        client = self._client(user)
        url = f"/api/images/{image.id}/crop-runs/?latest=1"
        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1

    def test_non_owner_gets_empty(self, other_user, piece_state_image):
        CropRun.objects.create(
            image=piece_state_image.image,
            piece_state_image=piece_state_image,
            source={
                "type": "automated",
                "backend": None,
                "deployment": None,
                "version": None,
            },
            status=CropRun.Status.NO_SUBJECT,
        )
        client = self._client(other_user)
        url = f"/api/images/{piece_state_image.image.id}/crop-runs/"
        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 0

    def test_piece_state_image_cannot_be_deleted_when_crop_run_exists(
        self, piece_state_image
    ):
        CropRun.objects.create(
            image=piece_state_image.image,
            piece_state_image=piece_state_image,
            source={
                "type": "automated",
                "backend": None,
                "deployment": None,
                "version": None,
            },
            status=CropRun.Status.SUCCESS,
        )

        with pytest.raises(ProtectedError):
            piece_state_image.delete()
