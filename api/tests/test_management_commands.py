import argparse
import importlib
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
    Piece,
    PieceState,
)

if "pillow_heif" not in sys.modules:
    pillow_heif = types.ModuleType("pillow_heif")
    pillow_heif.register_heif_opener = lambda: None
    sys.modules["pillow_heif"] = pillow_heif

deploy_init = importlib.import_module("api.management.commands.deploy_init")
import_tiles = importlib.import_module(
    "api.management.commands.import_test_tile_images"
)
restore_backup = importlib.import_module(
    "api.management.commands.restore_images_from_backup"
)


def _image_payload(url: str) -> dict:
    return {"url": url}


def _make_image_file(size: tuple[int, int], mode: str = "RGB") -> bytes:
    buf = BytesIO()
    color = (255, 0, 0, 255) if mode == "RGBA" else (255, 0, 0)
    PILImage.new(mode, size, color).save(buf, format="PNG")
    return buf.getvalue()


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


def _set_r2_env(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com")


def _clear_r2_env(monkeypatch):
    for var in (
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_PUBLIC_URL",
    ):
        monkeypatch.delenv(var, raising=False)


@pytest.mark.django_db
class TestImportTestTileImagesHelpers:
    def test_require_r2_raises_when_unconfigured(self, monkeypatch):
        _clear_r2_env(monkeypatch)

        with pytest.raises(CommandError):
            import_tiles._require_r2()

    def test_require_r2_passes_when_configured(self, monkeypatch):
        _set_r2_env(monkeypatch)

        import_tiles._require_r2()

    def test_add_arguments_registers_expected_flags(self):
        parser = argparse.ArgumentParser()
        command = import_tiles.Command()

        command.add_arguments(parser)

        option_strings = {
            option for action in parser._actions for option in action.option_strings
        }
        assert "--batch-folder" in option_strings
        assert "--inspection-dir" in option_strings
        assert "--crop-dir" in option_strings
        assert "--manifest" in option_strings

    def test_handle_uses_default_batch_folder_when_option_blank(
        self, monkeypatch, tmp_path
    ):
        _set_r2_env(monkeypatch)
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
            lambda *args, **kwargs: (_ for _ in ()).throw(
                AssertionError("should not recreate")
            ),
        )

        import_tiles._ensure_combination_layers(combo, [first, second])

    def test_save_inspection_jpg_writes_full_image(self, tmp_path):
        source = tmp_path / "source.png"
        source.write_bytes(_make_image_file((40, 30)))
        dst = tmp_path / "nested" / "inspection.jpg"

        import_tiles._save_inspection_jpg(source, dst)

        with PILImage.open(dst) as rendered:
            assert rendered.format == "JPEG"
            assert rendered.size == (40, 30)

    def test_save_crop_writes_cropped_jpeg(self, tmp_path):
        source = tmp_path / "source.png"
        source.write_bytes(_make_image_file((40, 40)))
        output = tmp_path / "crop.jpg"

        import_tiles._save_crop(source, output, (5, 5, 25, 30))

        with PILImage.open(output) as cropped:
            assert cropped.size == (20, 25)


@pytest.mark.django_db
class TestRestoreImagesFromBackupHelpers:
    def test_normalize_image_reduces_to_url_payload(self):
        normalized = restore_backup._normalize_image(
            {
                "url": "https://media.example.com/images/1/mug.jpg",
                "caption": "A mug",
                "created": "2024-01-01T00:00:00Z",
                "unrelated": "dropped",
            }
        )

        assert normalized == {
            "url": "https://media.example.com/images/1/mug.jpg",
            "caption": "A mug",
            "created": "2024-01-01T00:00:00Z",
        }

    def test_normalize_image_defaults_missing_fields(self):
        normalized = restore_backup._normalize_image({})

        assert normalized == {"url": "", "caption": "", "created": None}

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

    def test_upload_file_uploads_to_r2_key(self, monkeypatch, tmp_path):
        captured = {}

        def fake_upload(path, key, content_type):
            captured["path"] = path
            captured["key"] = key
            captured["content_type"] = content_type
            return f"https://media.example.com/{key}"

        monkeypatch.setattr(import_tiles.r2, "upload_file", fake_upload)
        path = tmp_path / "tile.jpg"
        path.write_bytes(b"fake")

        result = import_tiles._upload_file(path, "tiles/final/tile.jpg")

        assert result == "https://media.example.com/tiles/final/tile.jpg"
        assert captured["path"] == str(path)
        assert captured["key"] == "tiles/final/tile.jpg"
        assert captured["content_type"] == "image/jpeg"

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
                                        "https://media.example.com/images/1/mug.jpg"
                                    )
                                ],
                            }
                        ],
                        "thumbnail": _image_payload(
                            "https://media.example.com/images/1/thumb.jpg"
                        ),
                    }
                ]
            )
        )

        call_command("restore_images_from_backup", str(backup_path))

        state = piece.states.get()
        assert [img["url"] for img in state.images] == [
            "https://media.example.com/images/1/mug.jpg"
        ]
        piece.refresh_from_db()
        assert piece.thumbnail["url"] == "https://media.example.com/images/1/thumb.jpg"

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
