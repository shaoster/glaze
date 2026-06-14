"""Tests for the eager crop pipeline (generate_cropped_image task + helpers)."""

import io
from unittest.mock import MagicMock

import pytest
from django.contrib.auth.models import User
from PIL import Image as PILImage
from rest_framework.test import APIClient

from api.crops import crop_key_for, generate_cropped_image_bytes
from api.models import (
    ENTRY_STATE,
    AsyncTask,
    Image,
    Piece,
    PieceState,
    PieceStateImage,
)
from api.tasks import _execute_task
from api.utils import replace_piece_state_images

CROP = {"x": 0.1, "y": 0.2, "width": 0.6, "height": 0.5}
OTHER_CROP = {"x": 0.0, "y": 0.0, "width": 0.5, "height": 0.5}


def _png_bytes(size=(100, 80)) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", size, (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _set_r2_env(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com")


@pytest.fixture
def user(db):
    return User.objects.create(username="crop@example.com", email="crop@example.com")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def _make_piece_with_image(user, *, crop=None, r2_key="images/1/mug.jpg"):
    image = Image.objects.create(
        user=user,
        url=f"https://media.example.com/{r2_key}",
        r2_key=r2_key,
    )
    piece = Piece.objects.create(user=user, name="Mug", is_editable=True)
    state = PieceState.objects.create(
        piece=piece, user=user, state=ENTRY_STATE, order=1
    )
    link = PieceStateImage.objects.create(
        piece_state=state, image=image, order=0, crop=crop
    )
    return piece, state, image, link


def _make_crop_image(user, source_image, crop):
    """Create a materialized crop Image row (as the task would create it)."""
    key = crop_key_for(source_image.r2_key, crop)
    url = f"https://media.example.com/{key}"
    return Image.objects.create(
        user=user,
        url=url,
        r2_key=key,
        derived_from=source_image,
        derived_type="crop",
    )


class TestCropKey:
    def test_key_is_deterministic_with_fixed_precision(self):
        key = crop_key_for("images/1/mug.jpg", CROP)
        assert key == "crops/images/1/mug.jpg/0.1000-0.2000-0.6000-0.5000.jpg"
        # Float formatting differences collapse to the same key.
        same = crop_key_for(
            "images/1/mug.jpg",
            {"x": 0.10000, "y": 0.2, "width": 0.6, "height": 0.49999999},
        )
        assert same == key


class TestGenerateCroppedImageBytes:
    def test_crops_relative_box_with_real_pillow(self):
        derived = generate_cropped_image_bytes(
            _png_bytes((100, 80)),
            {"x": 0.25, "y": 0.25, "width": 0.5, "height": 0.5},
        )
        with PILImage.open(io.BytesIO(derived)) as cropped:
            assert cropped.format == "JPEG"
            assert cropped.size == (50, 40)

    def test_downscales_long_edge(self, monkeypatch):
        monkeypatch.setattr("api.crops.CROPPED_IMAGE_MAX_EDGE", 32)
        derived = generate_cropped_image_bytes(
            _png_bytes((100, 80)),
            {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0},
        )
        with PILImage.open(io.BytesIO(derived)) as cropped:
            assert max(cropped.size) == 32


@pytest.mark.django_db(transaction=True)
class TestGenerateCroppedImageTask:
    def _make_task(self, user, image, crop=CROP):
        return AsyncTask.objects.create(
            user=user,
            task_type="generate_cropped_image",
            input_params={"image_id": str(image.id), "crop": crop},
        )

    def _mock_r2(self, monkeypatch, *, exists=False):
        """Mock R2 and Modal for crop task execution.

        Returns a list of Modal call args tuples (source_url, crop, presigned_put).
        """
        modal_calls = []
        monkeypatch.setattr("api.r2.object_exists", lambda key: exists)
        monkeypatch.setattr(
            "api.r2.generate_presigned_put",
            lambda key, content_type, **kwargs: f"https://presigned.example.com/{key}",
        )

        def _mock_fn_lookup(app_name, fn_name):
            fn_mock = MagicMock()
            fn_mock.remote = MagicMock(
                side_effect=lambda *args, **kwargs: modal_calls.append(args)
            )
            return fn_mock

        monkeypatch.setattr("api.tasks._modal_function", _mock_fn_lookup)
        return modal_calls

    def test_materializes_crop_and_updates_all_matching_links(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        modal_calls = self._mock_r2(monkeypatch)
        piece, state, image, link = _make_piece_with_image(user, crop=CROP)
        # A second link to the same image with the same crop (e.g. after a
        # move), plus one with a different crop that must stay untouched.
        state2 = PieceState.objects.create(
            piece=piece, user=user, state="wheel_thrown", order=2
        )
        same_pair = PieceStateImage.objects.create(
            piece_state=state2, image=image, order=0, crop=CROP
        )
        other_image = Image.objects.create(
            user=user,
            url="https://media.example.com/images/1/other.jpg",
            r2_key="images/1/other.jpg",
        )
        other_pair = PieceStateImage.objects.create(
            piece_state=state2, image=other_image, order=1, crop=OTHER_CROP
        )

        task = self._make_task(user, image)
        _execute_task(task.id)

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        expected_key = crop_key_for(image.r2_key, CROP)
        # Modal was called once with (source_url, crop, presigned_put).
        assert len(modal_calls) == 1
        assert modal_calls[0][0] == image.url
        assert modal_calls[0][1] == CROP
        assert expected_key in modal_calls[0][2]

        link.refresh_from_db()
        same_pair.refresh_from_db()
        other_pair.refresh_from_db()
        expected_url = f"https://media.example.com/{expected_key}"

        assert link.cropped_image is not None
        assert link.cropped_image.r2_key == expected_key
        assert link.cropped_image.url == expected_url
        assert same_pair.cropped_image is not None
        assert same_pair.cropped_image.r2_key == expected_key
        assert same_pair.cropped_image.url == expected_url
        assert other_pair.cropped_image is None

    def test_idempotent_skip_when_object_already_exists(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        modal_calls = self._mock_r2(monkeypatch, exists=True)
        piece, state, image, link = _make_piece_with_image(user, crop=CROP)

        task = self._make_task(user, image)
        _execute_task(task.id)

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["reused_existing_object"] is True
        assert modal_calls == []
        link.refresh_from_db()
        assert link.cropped_image is not None
        assert link.cropped_image.url == (
            f"https://media.example.com/{crop_key_for(image.r2_key, CROP)}"
        )

    def test_updates_links_recreated_while_task_ran(self, user, monkeypatch):
        """Completion matches by (image, crop) value, not by PSI pk."""
        _set_r2_env(monkeypatch)
        self._mock_r2(monkeypatch)
        piece, state, image, link = _make_piece_with_image(user, crop=CROP)
        task = self._make_task(user, image)

        # Simulate replace_piece_state_images racing with the task: the
        # original link is deleted and an equivalent one is recreated.
        link.delete()
        recreated = PieceStateImage.objects.create(
            piece_state=state, image=image, order=0, crop=CROP
        )

        _execute_task(task.id)

        recreated.refresh_from_db()
        assert recreated.cropped_image is not None
        assert recreated.cropped_image.r2_key == crop_key_for(image.r2_key, CROP)

    def test_skips_image_not_stored_in_r2(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        piece, state, image, link = _make_piece_with_image(user, crop=CROP)
        Image.objects.filter(pk=image.pk).update(r2_key=None)

        task = self._make_task(user, image)
        _execute_task(task.id)

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["status"] == "skipped"
        link.refresh_from_db()
        assert link.cropped_image is None


@pytest.mark.django_db(transaction=True)
class TestPatchCropTriggersPipeline:
    def test_patch_leaves_cropped_url_null_until_task_completes(
        self, client, user, monkeypatch
    ):
        _set_r2_env(monkeypatch)
        piece, state, image, link = _make_piece_with_image(user)

        submitted = []
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit",
            lambda self, task: submitted.append(task),
        )

        response = client.patch(f"/api/images/{image.id}/crop/", CROP, format="json")
        assert response.status_code == 200

        # The synchronous response carries the crop but no derivative yet.
        images = response.json()["history"][-1]["images"]
        assert images[0]["crop"] == CROP
        assert images[0]["cropped_url"] is None
        link.refresh_from_db()
        assert link.crop == CROP
        assert link.cropped_image is None

        # Exactly one materialization task was enqueued with the value pair.
        assert len(submitted) == 1
        task = submitted[0]
        assert task.task_type == "generate_cropped_image"
        assert task.input_params == {"image_id": str(image.id), "crop": CROP}
        assert task.user_id == user.id

        # Task completion populates cropped_image on the link.
        monkeypatch.setattr("api.r2.object_exists", lambda key: False)
        monkeypatch.setattr(
            "api.r2.generate_presigned_put",
            lambda key, content_type, **kwargs: f"https://presigned.example.com/{key}",
        )
        fn_mock = MagicMock()
        fn_mock.remote = MagicMock(return_value=None)
        monkeypatch.setattr("api.tasks._modal_function", lambda *a, **kw: fn_mock)
        _execute_task(task.id)
        link.refresh_from_db()
        assert link.cropped_image is not None
        assert link.cropped_image.url == (
            f"https://media.example.com/{crop_key_for(image.r2_key, CROP)}"
        )

    def test_patch_does_not_enqueue_for_non_r2_image(self, client, user, monkeypatch):
        _set_r2_env(monkeypatch)
        piece, state, image, link = _make_piece_with_image(user)
        Image.objects.filter(pk=image.pk).update(r2_key=None)

        submitted = []
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit",
            lambda self, task: submitted.append(task),
        )

        response = client.patch(f"/api/images/{image.id}/crop/", CROP, format="json")
        assert response.status_code == 200
        assert submitted == []


@pytest.mark.django_db(transaction=True)
class TestReplaceFlowCarryOver:
    def test_unchanged_pairs_carry_cropped_image_without_reenqueue(
        self, user, monkeypatch
    ):
        _set_r2_env(monkeypatch)
        piece, state, image, link = _make_piece_with_image(user, crop=CROP)
        crop_img = _make_crop_image(user, image, CROP)
        PieceStateImage.objects.filter(pk=link.pk).update(cropped_image_id=crop_img.id)

        submitted = []
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit",
            lambda self, task: submitted.append(task),
        )

        new_image_url = "https://media.example.com/images/1/new.jpg"
        replace_piece_state_images(
            state,
            [
                # Unchanged (image, crop) pair — derivative carried over.
                {"url": image.url, "crop": CROP, "caption": "kept"},
                # New image with a crop — task enqueued.
                {"url": new_image_url, "crop": OTHER_CROP, "caption": "new"},
            ],
            user=user,
        )

        links = list(
            state.image_links.select_related("cropped_image").order_by("order")
        )
        assert links[0].crop == CROP
        assert links[0].cropped_image_id == crop_img.id
        assert links[0].cropped_image.r2_key == crop_img.r2_key
        assert links[1].crop == OTHER_CROP
        assert links[1].cropped_image is None

        assert len(submitted) == 1
        new_image = Image.objects.get(url=new_image_url)
        assert submitted[0].input_params == {
            "image_id": str(new_image.id),
            "crop": OTHER_CROP,
        }

    def test_changed_crop_clears_carryover_and_reenqueues(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        piece, state, image, link = _make_piece_with_image(user, crop=CROP)
        crop_img = _make_crop_image(user, image, CROP)
        PieceStateImage.objects.filter(pk=link.pk).update(cropped_image_id=crop_img.id)

        submitted = []
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit",
            lambda self, task: submitted.append(task),
        )

        replace_piece_state_images(
            state,
            [{"url": image.url, "crop": OTHER_CROP}],
            user=user,
        )

        new_link = state.image_links.get()
        assert new_link.crop == OTHER_CROP
        assert new_link.cropped_image is None
        assert len(submitted) == 1
