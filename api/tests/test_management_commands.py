import importlib
import argparse
import sys
import types
from io import BytesIO

import pytest
import yaml
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from PIL import Image as PILImage

from api.models import (
    ENTRY_STATE,
    GlazeCombination,
    GlazeCombinationLayer,
    GlazeType,
    Image,
    Piece,
    PieceState,
    PieceStateImage,
)

if "pillow_heif" not in sys.modules:
    pillow_heif = types.ModuleType("pillow_heif")
    pillow_heif.register_heif_opener = lambda: None
    sys.modules["pillow_heif"] = pillow_heif

backfill = importlib.import_module("api.management.commands.backfill_image_dimensions")
deploy_init = importlib.import_module("api.management.commands.deploy_init")
import_tiles = importlib.import_module(
    "api.management.commands.import_test_tile_images"
)
restore_backup = importlib.import_module(
    "api.management.commands.restore_images_from_backup"
)


def _image_payload(url: str, public_id: str, cloud_name: str = "demo") -> dict:
    return {
        "url": url,
        "cloudinary_public_id": public_id,
        "cloud_name": cloud_name,
    }


def _make_image_file(size: tuple[int, int], mode: str = "RGB") -> bytes:
    buf = BytesIO()
    color = (255, 0, 0, 255) if mode == "RGBA" else (255, 0, 0)
    PILImage.new(mode, size, color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.django_db
class TestBackfillImageDimensionsCommand:
    def test_requires_cloudinary_env(self, monkeypatch, capsys):
        monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_SECRET", raising=False)

        call_command("backfill_image_dimensions")

        captured = capsys.readouterr()
        assert "required" in captured.err

    def test_updates_dimensions_and_respects_dry_run(self, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
        monkeypatch.setattr(backfill.cloudinary, "config", lambda **kwargs: None)
        monkeypatch.setattr(
            backfill.cloudinary.api,
            "resource",
            lambda public_id: {"width": 640, "height": 480},
        )
        sleep_calls = []
        monkeypatch.setattr(
            backfill.time, "sleep", lambda seconds: sleep_calls.append(seconds)
        )

        image = Image.objects.create(
            user=None,
            url="https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg",
            cloud_name="demo",
            cloudinary_public_id="pieces/mug",
        )

        call_command("backfill_image_dimensions", batch_size=1)

        image.refresh_from_db()
        assert (image.width, image.height) == (640, 480)
        assert sleep_calls == [1]

        image.width = None
        image.height = None
        image.save(update_fields=["width", "height"])

        call_command("backfill_image_dimensions", batch_size=1, dry_run=True)

        image.refresh_from_db()
        assert (image.width, image.height) == (None, None)


@pytest.mark.django_db
class TestClearCropsCommand:
    def _make_state_image(self):
        user = get_user_model().objects.create(
            username="mug@example.com", email="mug@example.com"
        )
        piece = Piece.objects.create(user=user, name="Mug")
        state = PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)
        image = Image.objects.create(
            user=None,
            url="https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg",
            cloud_name="demo",
            cloudinary_public_id="pieces/mug",
        )
        return PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            order=0,
            crop={"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4},
        )

    def test_dry_run_preserves_crops(self):
        state_image = self._make_state_image()

        call_command("clear_crops", dry_run=True)

        state_image.refresh_from_db()
        assert state_image.crop == {"x": 0.1, "y": 0.2, "width": 0.3, "height": 0.4}

    def test_live_mode_clears_crops(self):
        state_image = self._make_state_image()

        call_command("clear_crops")

        state_image.refresh_from_db()
        assert state_image.crop is None


@pytest.mark.django_db
class TestDeployInitCommand:
    def test_calls_each_init_step_in_order(self, monkeypatch):
        calls: list[tuple[str, dict]] = []

        def fake_call_command(name, *args, **kwargs):
            calls.append((name, kwargs))

        monkeypatch.setattr(deploy_init, "call_command", fake_call_command)

        call_command("deploy_init", verbosity=2)

        assert calls == [
            ("migrate", {"interactive": False, "verbosity": 2}),
            ("load_public_library", {"skip_if_missing": True, "verbosity": 2}),
            ("clear_stuck_tasks", {"hours": 1, "verbosity": 2}),
        ]


@pytest.mark.django_db
class TestImportTestTileImagesHelpers:
    def test_configure_cloudinary_requires_env(self, monkeypatch):
        monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_SECRET", raising=False)

        with pytest.raises(CommandError):
            import_tiles._configure_cloudinary()

    def test_configure_cloudinary_sets_secure_config(self, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
        captured = {}
        monkeypatch.setattr(
            import_tiles.cloudinary,
            "config",
            lambda **kwargs: captured.update(kwargs),
        )

        import_tiles._configure_cloudinary()

        assert captured["cloud_name"] == "demo"
        assert captured["secure"] is True

    def test_add_arguments_registers_expected_flags(self):
        parser = argparse.ArgumentParser()
        command = import_tiles.Command()

        command.add_arguments(parser)

        option_strings = {
            option
            for action in parser._actions
            for option in action.option_strings
        }
        assert "--batch-folder" in option_strings
        assert "--inspection-dir" in option_strings
        assert "--crop-dir" in option_strings
        assert "--manifest" in option_strings

    def test_handle_uses_env_batch_folder_when_option_blank(self, monkeypatch, tmp_path):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")
        monkeypatch.setenv("CLOUDINARY_UPLOAD_FOLDER", "uploads")
        monkeypatch.setattr(import_tiles.cloudinary, "config", lambda **kwargs: None)
        monkeypatch.setattr(import_tiles, "_GLAZE_TYPE_SPECS", [])
        monkeypatch.setattr(import_tiles, "_GLAZE_COMBINATION_SPECS", [])

        command = import_tiles.Command()
        manifest = tmp_path / "manifest.json"

        command.handle(
            batch_folder="",
            inspection_dir=str(tmp_path / "inspection"),
            crop_dir=str(tmp_path / "crop"),
            manifest=str(manifest),
        )

        assert manifest.exists()

    def test_single_layer_combination_is_created(self):
        glaze_type = GlazeType.objects.create(user=None, name="Celadon")

        combo = import_tiles._ensure_single_layer_combination(glaze_type)

        assert combo.name == "Celadon"
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["Celadon"]

    def test_combination_layers_are_rebuilt_when_order_differs(self):
        first = GlazeType.objects.create(user=None, name="Albany Blue Slip")
        second = GlazeType.objects.create(user=None, name="French Green")
        combo = GlazeCombination.objects.create(user=None, name="Test Combo")
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=second, order=0
        )
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=first, order=1
        )

        import_tiles._ensure_combination_layers(combo, [first, second])

        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["Albany Blue Slip", "French Green"]

    def test_combination_layers_noop_when_order_matches(self, monkeypatch):
        first = GlazeType.objects.create(user=None, name="Albany Blue Slip")
        second = GlazeType.objects.create(user=None, name="French Green")
        combo = GlazeCombination.objects.create(user=None, name="Test Combo")
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=first, order=0
        )
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=second, order=1
        )

        monkeypatch.setattr(
            GlazeCombinationLayer.objects,
            "create",
            lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("should not recreate")),
        )

        import_tiles._ensure_combination_layers(combo, [first, second])

    def test_download_file_writes_response_bytes(self, monkeypatch, tmp_path):
        class FakeResponse:
            def raise_for_status(self):
                return None

            content = b"downloaded"

        monkeypatch.setattr(import_tiles.requests, "get", lambda url, timeout=60: FakeResponse())
        dst = tmp_path / "download.jpg"

        import_tiles._download_file("https://example.com/img.jpg", dst)

        assert dst.read_bytes() == b"downloaded"

    def test_save_crop_writes_cropped_jpeg(self, tmp_path):
        source = tmp_path / "source.png"
        source.write_bytes(_make_image_file((40, 40)))
        output = tmp_path / "crop.jpg"

        import_tiles._save_crop(source, output, (5, 5, 25, 30))

        with PILImage.open(output) as cropped:
            assert cropped.size == (20, 25)


@pytest.mark.django_db
class TestRestoreImagesFromBackupHelpers:
    def test_parse_cloudinary_url_handles_parser_exception(self, monkeypatch):
        monkeypatch.setattr(
            restore_backup,
            "urlparse",
            lambda url: (_ for _ in ()).throw(Exception("bad url")),
        )
        assert restore_backup._parse_cloudinary_url("anything") == (None, None)

    def test_parse_cloudinary_url_rejects_invalid_and_non_cloudinary_urls(self):
        assert restore_backup._parse_cloudinary_url("not a url") == (None, None)
        assert (
            restore_backup._parse_cloudinary_url(
                "https://example.com/image/upload/v1/pieces/mug.jpg"
            )
            == (None, None)
        )
        assert (
            restore_backup._parse_cloudinary_url(
                "https://res.cloudinary.com/demo/notimage/upload/v1/pieces/mug.jpg"
            )
            == (None, None)
        )

    def test_parse_cloudinary_url_returns_none_public_id_for_empty_tail(self):
        assert (
            restore_backup._parse_cloudinary_url(
                "https://res.cloudinary.com/demo/image/upload/"
            )
            == ("demo", None)
        )

    def test_parse_cloudinary_url_strips_transforms_and_extension(self):
        cloud_name, public_id = restore_backup._parse_cloudinary_url(
            "https://res.cloudinary.com/demo/image/upload/v1/c_fill,w_100/pieces/mug.jpg"
        )

        assert cloud_name == "demo"
        assert public_id == "pieces/mug"

    def test_normalize_image_fills_missing_identity(self):
        normalized = restore_backup._normalize_image(
            {"url": "https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg"}
        )

        assert normalized["cloud_name"] == "demo"
        assert normalized["cloudinary_public_id"] == "pieces/mug"
        assert normalized["caption"] == ""

    def test_placeholder_thumbnail_detection(self):
        assert restore_backup._is_placeholder_thumbnail(None) is True
        assert (
            restore_backup._is_placeholder_thumbnail(
                {"url": "https://example.com/question-mark.svg"}
            )
            is True
        )
        assert (
            restore_backup._is_placeholder_thumbnail(
                {"url": "https://example.com/real-thumbnail.jpg"}
            )
            is False
        )

    def test_load_image_converts_rgba_to_rgb(self, tmp_path):
        source = tmp_path / "source.png"
        source.write_bytes(_make_image_file((10, 10), mode="RGBA"))

        loaded = import_tiles._load_image(source)
        try:
            assert loaded.mode == "RGB"
        finally:
            loaded.close()

    def test_upload_file_passes_folder_when_provided(self, monkeypatch, tmp_path):
        captured = {}

        def fake_upload(path, **kwargs):
            captured["path"] = path
            captured["kwargs"] = kwargs
            return {"public_id": kwargs["public_id"]}

        monkeypatch.setattr(import_tiles.cloudinary.uploader, "upload", fake_upload)
        path = tmp_path / "tile.jpg"
        path.write_bytes(b"fake")

        result = import_tiles._upload_file(path, "public-id", folder="tiles/final")

        assert result == {"public_id": "public-id"}
        assert captured["path"] == str(path)
        assert captured["kwargs"]["folder"] == "tiles/final"
        assert captured["kwargs"]["overwrite"] is True

    def test_restore_backup_restores_missing_image_and_thumbnail(self, tmp_path):
        user = get_user_model().objects.create(
            username="bowl@example.com", email="bowl@example.com"
        )
        piece = Piece.objects.create(user=user, name="Moon Jar")
        PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)

        backup_path = tmp_path / "backup.yaml"
        backup_path.write_text(
            yaml.safe_dump(
                [
                    {
                        "id": str(piece.id),
                        "name": "Moon Jar",
                        "history": [
                            {
                                "state": ENTRY_STATE,
                                "images": [
                                    _image_payload(
                                        "https://res.cloudinary.com/demo/image/upload/v1/pieces/mug.jpg",
                                        "pieces/mug",
                                    )
                                ],
                            }
                        ],
                        "thumbnail": _image_payload(
                            "https://res.cloudinary.com/demo/image/upload/v1/thumbs/mug.jpg",
                            "thumbs/mug",
                        ),
                    }
                ]
            )
        )

        call_command("restore_images_from_backup", str(backup_path))

        state = piece.states.get()
        assert [img["cloudinary_public_id"] for img in state.images] == ["pieces/mug"]
        piece.refresh_from_db()
        assert piece.thumbnail["cloudinary_public_id"] == "thumbs/mug"

    def test_restore_backup_rejects_missing_file(self, tmp_path):
        with pytest.raises(CommandError):
            call_command(
                "restore_images_from_backup",
                str(tmp_path / "missing.yaml"),
            )

    def test_restore_backup_rejects_non_list_yaml(self, tmp_path):
        backup_path = tmp_path / "backup.yaml"
        backup_path.write_text("foo: bar")

        with pytest.raises(CommandError):
            call_command("restore_images_from_backup", str(backup_path))
