"""Import public glaze library entries from the local issue-146 test-tile images."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from PIL import Image
from pillow_heif import register_heif_opener

from api import r2
from api.models import GlazeCombination, GlazeCombinationLayer, GlazeType
from api.utils import normalize_image_payload

register_heif_opener()


@dataclass(frozen=True)
class TileImportSpec:
    filename: str
    name: str
    crop_box: tuple[int, int, int, int]
    first_glaze: str | None = None
    second_glaze: str | None = None


_ROOT = Path(settings.BASE_DIR)
_TYPES_DIR = _ROOT / "Test Tile Images" / "Glaze Type Test Tiles"
_COMBOS_DIR = _ROOT / "Test Tile Images" / "Glaze Combination Test Tiles"
_DEFAULT_INSPECTION_DIR = _ROOT / "tmp" / "issue_146" / "inspection"
_DEFAULT_CROP_DIR = _ROOT / "tmp" / "issue_146" / "crops"
_DEFAULT_MANIFEST = _ROOT / "tmp" / "issue_146" / "manifest.json"

# Keep the full centered tile and the lower label, with a slightly loose crop.
_TYPE_CROP_BOX = (350, 200, 2650, 4032)
_COMBO_CROP_BOX = (900, 500, 2850, 3900)
# Use the full source width and anchor to the bottom edge for tiles whose labels
# and right/left tile edges were being clipped by narrower custom crops.
_FULL_WIDTH_BOTTOM_4X5_CROP_BOX = (0, 252, 3024, 4032)
_SHARED_GLAZE_FIELDS = (
    "test_tile_image",
    "is_food_safe",
    "runs",
    "highlights_grooves",
    "is_different_on_white_and_brown_clay",
    "apply_thin",
)

_GLAZE_TYPE_SPECS = [
    # File-specific overrides where the generic box either clipped the label,
    # clipped a tile edge, or produced an unnecessarily skinny crop.
    TileImportSpec(
        "2026-04-22 14.36.47.heic", "Turquoise", _FULL_WIDTH_BOTTOM_4X5_CROP_BOX
    ),
    TileImportSpec("2026-04-22 14.37.09.heic", "Dragon Green", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.37.12.heic", "French Blue", _TYPE_CROP_BOX),
    TileImportSpec(
        "2026-04-22 14.37.14.heic", "French Green", _FULL_WIDTH_BOTTOM_4X5_CROP_BOX
    ),
    TileImportSpec("2026-04-22 14.37.16.heic", "Gloss White", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.37.19.heic", "Hee Soo Clear Crackle", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.37.32.heic", "Choy", _FULL_WIDTH_BOTTOM_4X5_CROP_BOX),
    TileImportSpec(
        "2026-04-22 14.37.36.heic", "Clear Crackle", _FULL_WIDTH_BOTTOM_4X5_CROP_BOX
    ),
    TileImportSpec(
        "2026-04-22 14.37.38.heic", "Cornwall", _FULL_WIDTH_BOTTOM_4X5_CROP_BOX
    ),
    TileImportSpec(
        "2026-04-22 14.37.50.heic", "Celadon", _FULL_WIDTH_BOTTOM_4X5_CROP_BOX
    ),
    TileImportSpec("2026-04-22 14.37.53.heic", "Cobalt Blue Green", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.37.59.heic", "Breakthrough White", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.38.02.heic", "Breakthrough Blue", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.38.07.heic", "Albany Blue Slip", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.38.11.heic", "Albany Green Slip", _TYPE_CROP_BOX),
    TileImportSpec("2026-04-22 14.38.14.heic", "Albany Manganese Slip", _TYPE_CROP_BOX),
]
_GLAZE_COMBINATION_SPECS = [
    TileImportSpec(
        "2026-04-22 14.36.16.heic",
        "Albany Blue Slip!French Green",
        _COMBO_CROP_BOX,
        first_glaze="Albany Blue Slip",
        second_glaze="French Green",
    ),
]


def _require_r2() -> None:
    if not r2.is_r2_configured():
        raise CommandError(
            "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, "
            "and R2_PUBLIC_URL are required."
        )


def _load_image(path: Path) -> Image.Image:
    image = Image.open(path)
    if image.mode != "RGB":
        image = image.convert("RGB")  # type: ignore[assignment]
    return image


def _save_crop(src: Path, dst: Path, crop_box: tuple[int, int, int, int]) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    with _load_image(src) as image:
        cropped = image.crop(crop_box)
        cropped.save(dst, "JPEG", quality=95)


def _upload_file(path: Path, key: str) -> str:
    """Upload a local JPEG to R2 and return its public URL."""
    return r2.upload_file(str(path), key, "image/jpeg")


def _save_inspection_jpg(src: Path, dst: Path) -> None:
    """Render a local inspection JPG of the full source image."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    with _load_image(src) as image:
        image.save(dst, "JPEG", quality=90)


def _ensure_single_layer_combination(glaze_type: GlazeType) -> GlazeCombination:
    combo_props = {field: getattr(glaze_type, field) for field in _SHARED_GLAZE_FIELDS}
    combo, _ = GlazeCombination.objects.get_or_create(
        user=None,
        name=glaze_type.name,
        defaults=combo_props,
    )
    for field, value in combo_props.items():
        setattr(combo, field, value)
    combo.save(update_fields=list(_SHARED_GLAZE_FIELDS))
    layers = list(combo.layers.select_related("glaze_type").order_by("order"))
    if len(layers) != 1 or layers[0].glaze_type_id != glaze_type.id:
        combo.layers.all().delete()
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=glaze_type, order=0
        )
    return combo


def _ensure_combination_layers(
    combo: GlazeCombination, glaze_types: list[GlazeType]
) -> None:
    existing = list(combo.layers.select_related("glaze_type").order_by("order"))
    expected_ids = [glaze_type.id for glaze_type in glaze_types]
    existing_ids = [layer.glaze_type_id for layer in existing]
    if existing_ids == expected_ids and [layer.order for layer in existing] == list(
        range(len(glaze_types))
    ):
        return
    combo.layers.all().delete()
    for order, glaze_type in enumerate(glaze_types):
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=glaze_type, order=order
        )


class Command(BaseCommand):
    help = (
        "Render the issue-146 test-tile HEICs to local inspection JPGs, crop the "
        "centered tile + lower label, upload the corrected crops to R2, and upsert "
        "public GlazeType / GlazeCombination rows."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--batch-folder",
            default="",
            help=(
                "R2 key prefix for this import batch. Defaults to "
                "issue-146-public-test-tiles."
            ),
        )
        parser.add_argument(
            "--inspection-dir",
            default=str(_DEFAULT_INSPECTION_DIR),
            help="Local directory for rendered inspection JPGs.",
        )
        parser.add_argument(
            "--crop-dir",
            default=str(_DEFAULT_CROP_DIR),
            help="Local directory for the corrected crop JPGs.",
        )
        parser.add_argument(
            "--manifest",
            default=str(_DEFAULT_MANIFEST),
            help="JSON file where the import mapping and asset URLs are written.",
        )

    def handle(self, *args, **options):
        _require_r2()

        base_folder = options["batch_folder"].strip().strip("/")
        if not base_folder:
            base_folder = "issue-146-public-test-tiles"
        inspection_dir = Path(options["inspection_dir"])
        crop_dir = Path(options["crop_dir"])
        manifest_path = Path(options["manifest"])
        manifest_path.parent.mkdir(parents=True, exist_ok=True)

        manifest: list[dict] = []
        created_types = 0
        updated_types = 0
        created_combos = 0
        updated_combos = 0

        with transaction.atomic():
            for spec in _GLAZE_TYPE_SPECS:
                record, created = self._import_glaze_type(
                    spec, base_folder, inspection_dir, crop_dir
                )
                manifest.append(record)
                if created:
                    created_types += 1
                else:
                    updated_types += 1

            for spec in _GLAZE_COMBINATION_SPECS:
                record, created = self._import_glaze_combination(
                    spec, base_folder, inspection_dir, crop_dir
                )
                manifest.append(record)
                if created:
                    created_combos += 1
                else:
                    updated_combos += 1

            verification = self._verify()

        manifest_path.write_text(
            json.dumps({"records": manifest, "verification": verification}, indent=2)
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Imported issue-146 test tiles: "
                f"{created_types} glaze types created, {updated_types} glaze types updated, "
                f"{created_combos} glaze combinations created, {updated_combos} glaze combinations updated."
            )
        )
        self.stdout.write(self.style.SUCCESS(f"Manifest written to {manifest_path}"))

    def _import_glaze_type(
        self,
        spec: TileImportSpec,
        base_folder: str,
        inspection_dir: Path,
        crop_dir: Path,
    ) -> tuple[dict, bool]:
        src = _TYPES_DIR / spec.filename
        if not src.exists():
            raise CommandError(f"Missing source HEIC: {src}")

        inspection_path = (
            inspection_dir / "glaze_types" / f"{Path(spec.filename).stem}.jpg"
        )
        _save_inspection_jpg(src, inspection_path)

        cropped_path = crop_dir / "glaze_types" / f"{Path(spec.filename).stem}.jpg"
        _save_crop(src, cropped_path, spec.crop_box)
        final_url = _upload_file(
            cropped_path,
            key=(
                f"{base_folder}/final/glaze-types/"
                f"glaze-type-{Path(spec.filename).stem}.jpg"
            ),
        )
        glaze_type, created = GlazeType.objects.get_or_create(user=None, name=spec.name)
        glaze_type.test_tile_image = normalize_image_payload({"url": final_url})
        glaze_type.save(update_fields=["test_tile_image"])
        _ensure_single_layer_combination(glaze_type)
        return {
            "kind": "glaze_type",
            "filename": spec.filename,
            "name": spec.name,
            "source_path": str(src),
            "inspection_path": str(inspection_path),
            "cropped_path": str(cropped_path),
            "final_url": final_url,
        }, created

    def _import_glaze_combination(
        self,
        spec: TileImportSpec,
        base_folder: str,
        inspection_dir: Path,
        crop_dir: Path,
    ) -> tuple[dict, bool]:
        src = _COMBOS_DIR / spec.filename
        if not src.exists():
            raise CommandError(f"Missing source HEIC: {src}")
        if not spec.first_glaze or not spec.second_glaze:
            raise CommandError(
                f"Combination spec is missing glaze references: {spec.filename}"
            )

        inspection_path = (
            inspection_dir / "glaze_combinations" / f"{Path(spec.filename).stem}.jpg"
        )
        _save_inspection_jpg(src, inspection_path)

        cropped_path = (
            crop_dir / "glaze_combinations" / f"{Path(spec.filename).stem}.jpg"
        )
        _save_crop(src, cropped_path, spec.crop_box)
        final_url = _upload_file(
            cropped_path,
            key=(
                f"{base_folder}/final/glaze-combinations/"
                f"glaze-combination-{Path(spec.filename).stem}.jpg"
            ),
        )

        first = GlazeType.objects.get(user=None, name=spec.first_glaze)
        second = GlazeType.objects.get(user=None, name=spec.second_glaze)
        combo, created = GlazeCombination.objects.get_or_create(
            user=None, name=spec.name
        )
        combo.test_tile_image = normalize_image_payload({"url": final_url})
        combo.save(update_fields=["test_tile_image"])
        _ensure_combination_layers(combo, [first, second])
        return {
            "kind": "glaze_combination",
            "filename": spec.filename,
            "name": spec.name,
            "first_glaze": spec.first_glaze,
            "second_glaze": spec.second_glaze,
            "source_path": str(src),
            "inspection_path": str(inspection_path),
            "cropped_path": str(cropped_path),
            "final_url": final_url,
        }, created

    def _verify(self) -> dict:
        type_results = []
        for spec in _GLAZE_TYPE_SPECS:
            glaze_type = GlazeType.objects.get(user=None, name=spec.name)
            single = GlazeCombination.objects.get(user=None, name=spec.name)
            layers = list(
                single.layers.order_by("order").values_list(
                    "glaze_type__name", flat=True
                )
            )
            type_results.append(
                {
                    "name": glaze_type.name,
                    "test_tile_image": glaze_type.test_tile_image,
                    "single_layer_combination_layers": layers,
                }
            )

        combo_results = []
        for spec in _GLAZE_COMBINATION_SPECS:
            combo = GlazeCombination.objects.get(user=None, name=spec.name)
            layers = list(
                combo.layers.order_by("order").values_list(
                    "glaze_type__name", flat=True
                )
            )
            combo_results.append(
                {
                    "name": combo.name,
                    "test_tile_image": combo.test_tile_image,
                    "layers": layers,
                }
            )

        return {
            "glaze_types": type_results,
            "glaze_combinations": combo_results,
        }
