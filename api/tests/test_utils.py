import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError

from api.models import AsyncTask, GlazeCombination, GlazeType, Image, Piece
from api.utils import (
    cloudinary_getinfo_url,
    crop_to_dict,
    fetch_cloudinary_auto_crop,
    parse_cloudinary_getinfo_crop,
    sync_glaze_type_singleton_combination,
)


class TestCloudinaryCropParsing:
    def test_crop_to_dict_rejects_missing_and_invalid_values(self):
        assert crop_to_dict(None) is None
        assert crop_to_dict({"x": 0, "y": 0, "width": 0, "height": 1}) is None
        assert crop_to_dict({"x": "bad", "y": 0, "width": 1, "height": 1}) is None

    def test_crop_to_dict_clamps_relative_values(self):
        assert crop_to_dict({"x": -0.2, "y": 1.2, "width": 1.5, "height": 0.5}) == {
            "x": 0.0,
            "y": 1.0,
            "width": 1.0,
            "height": 0.5,
        }

    def test_normalizes_pixel_coordinates_from_getinfo(self):
        payload = {
            "input": {"width": 1000, "height": 800},
            "g_auto_info": {"x": 100, "y": 80, "width": 500, "height": 400},
        }

        assert parse_cloudinary_getinfo_crop(payload) == {
            "x": 0.1,
            "y": 0.1,
            "width": 0.5,
            "height": 0.5,
        }

    def test_accepts_nested_w_h_crop_coordinates(self):
        payload = {
            "info": {
                "coordinates": [
                    {"ignored": True},
                    {"x": 0.2, "y": 0.3, "w": 0.4, "h": 0.5},
                ]
            }
        }

        assert parse_cloudinary_getinfo_crop(payload) == {
            "x": 0.2,
            "y": 0.3,
            "width": 0.4,
            "height": 0.5,
        }

    def test_returns_none_when_getinfo_has_no_crop(self):
        assert parse_cloudinary_getinfo_crop({"input": {"width": 100}}) is None

    def test_cloudinary_getinfo_url_uses_documented_transform(self):
        assert cloudinary_getinfo_url("demo", "pieces/mug") == (
            "https://res.cloudinary.com/demo/image/upload/"
            "c_crop,g_auto,w_750/fl_getinfo/v1/pieces/mug"
        )
        assert cloudinary_getinfo_url("", "pieces/mug") is None
        assert cloudinary_getinfo_url("demo", "") is None

    def test_fetch_cloudinary_auto_crop_uses_getinfo_url(self, monkeypatch):
        calls = []

        class Response:
            def raise_for_status(self):
                calls.append("raise_for_status")

            def json(self):
                return {"crop": {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}}

        def fake_get(url, timeout):
            calls.append((url, timeout))
            return Response()

        monkeypatch.setattr("api.utils.requests.get", fake_get)

        assert fetch_cloudinary_auto_crop("demo", "pieces/mug", timeout=3) == {
            "x": 0.1,
            "y": 0.2,
            "width": 0.3,
            "height": 0.4,
        }
        assert calls == [
            (cloudinary_getinfo_url("demo", "pieces/mug"), 3),
            "raise_for_status",
        ]

    def test_fetch_cloudinary_auto_crop_skips_missing_identity(self, monkeypatch):
        calls = []
        monkeypatch.setattr("api.utils.requests.get", lambda *args: calls.append(args))

        assert fetch_cloudinary_auto_crop("", "pieces/mug") is None
        assert fetch_cloudinary_auto_crop("demo", "") is None
        assert calls == []


@pytest.mark.django_db
class TestBackpopulateCropsCommand:
    def _make_cloudinary_image(self, suffix="mug"):
        return Image.objects.create(
            url=f"https://res.cloudinary.com/demo/image/upload/v1/pieces/{suffix}.jpg",
            cloud_name="demo",
            cloudinary_public_id=f"pieces/{suffix}",
        )

    def _make_superuser(self, email="admin@example.com"):
        return User.objects.create_superuser(
            username=email, email=email, password="x"
        )

    def _make_user(self, email="u@example.com"):
        return User.objects.create(username=email, email=email)

    def test_dry_run_does_not_enqueue_tasks(self):
        """--dry-run prints a count but creates no AsyncTask records."""
        image = self._make_cloudinary_image()
        user = self._make_user()
        Piece.objects.create(user=user, name="Mug", thumbnail=image)

        call_command("backpopulate_crops", "--dry-run")

        assert AsyncTask.objects.count() == 0

    def test_no_superuser_raises_command_error(self):
        """Running in live mode without any superuser raises CommandError."""
        with pytest.raises(CommandError, match="No superuser found"):
            call_command("backpopulate_crops")

    def test_live_mode_enqueues_task_for_missing_thumbnail_crop(self, monkeypatch):
        """A piece with no thumbnail_crop gets one AsyncTask enqueued."""
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit", lambda self, task: None
        )
        superuser = self._make_superuser()
        user = self._make_user()
        image = self._make_cloudinary_image()
        Piece.objects.create(user=user, name="Mug", thumbnail=image)

        call_command("backpopulate_crops")

        tasks = list(AsyncTask.objects.all())
        assert len(tasks) == 1
        assert tasks[0].task_type == "detect_subject_crop"
        assert tasks[0].input_params["image_id"] == str(image.id)
        assert tasks[0].user == superuser

    def test_skips_images_with_existing_crop_by_default(self, monkeypatch):
        """Images whose pieces already have thumbnail_crop are skipped."""
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit", lambda self, task: None
        )
        self._make_superuser()
        user = self._make_user()
        image = self._make_cloudinary_image()
        existing_crop = {"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.6}
        Piece.objects.create(
            user=user, name="Mug", thumbnail=image, thumbnail_crop=existing_crop
        )

        call_command("backpopulate_crops")

        assert AsyncTask.objects.count() == 0

    def test_force_enqueues_tasks_for_existing_crops(self, monkeypatch):
        """--force enqueues a task even when the piece already has thumbnail_crop."""
        monkeypatch.setattr(
            "api.tasks.InMemoryTaskInterface.submit", lambda self, task: None
        )
        self._make_superuser()
        user = self._make_user()
        image = self._make_cloudinary_image()
        existing_crop = {"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.6}
        Piece.objects.create(
            user=user, name="Mug", thumbnail=image, thumbnail_crop=existing_crop
        )

        call_command("backpopulate_crops", "--force")

        assert AsyncTask.objects.count() == 1


@pytest.mark.django_db
class TestSyncGlazeTypeSingletonCombination:
    def test_creates_singleton_combination_for_public_glaze_type(self):
        glaze_type = GlazeType.objects.create(
            user=None,
            name="Floating Blue",
            runs=True,
            is_food_safe=False,
        )

        sync_glaze_type_singleton_combination(glaze_type)

        combo = GlazeCombination.objects.get(user=None, name="Floating Blue")
        assert combo.runs is True
        assert combo.is_food_safe is False
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["Floating Blue"]

    def test_renames_existing_singleton_combination(self):
        glaze_type = GlazeType.objects.create(user=None, name="New Name", runs=False)
        combo = GlazeCombination.objects.create(user=None, name="Old Name")

        sync_glaze_type_singleton_combination(glaze_type, old_name="Old Name")

        combo.refresh_from_db()
        assert combo.name == "New Name"
        assert combo.runs is False
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["New Name"]

    def test_updates_existing_singleton_properties_without_replacing_matching_layer(
        self,
    ):
        glaze_type = GlazeType.objects.create(
            user=None, name="Tenmoku", runs=False, is_food_safe=None
        )
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[glaze_type]
        )
        original_layer_id = combo.layers.get().id

        glaze_type.runs = True
        glaze_type.is_food_safe = True
        sync_glaze_type_singleton_combination(glaze_type)

        combo.refresh_from_db()
        assert combo.runs is True
        assert combo.is_food_safe is True
        assert combo.layers.get().id == original_layer_id
