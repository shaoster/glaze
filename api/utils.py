"""Glaze-specific utility helpers.

This module holds business-logic helpers that are shared across multiple parts
of the api app but do not belong in workflow.py (which is reserved for
workflow-state-machine logic derived from workflow.yml).
"""

from django.apps import apps
from django.conf import settings

DEV_THUMBNAIL_URLS = {
    "bowl": "/thumbnails/bowl.svg",
    "mug": "/thumbnails/mug.svg",
    "plate": "/thumbnails/plate.svg",
    "vase": "/thumbnails/vase.svg",
}


# Fields that are mirrored between a public GlazeType and its singleton
# single-layer GlazeCombination.  Kept here so both admin.py and
# manual_tile_imports.py can import from one place without pulling in the
# full workflow module.
SHARED_GLAZE_FIELDS: tuple[str, ...] = (
    "test_tile_image",
    "is_food_safe",
    "runs",
    "highlights_grooves",
    "is_different_on_white_and_brown_clay",
    "apply_thin",
)


def sync_glaze_type_singleton_combination(
    glaze_type, *, old_name: str | None = None
) -> None:
    """Ensure a matching public single-layer GlazeCombination exists for a public GlazeType.

    Creates or updates the singleton combination so that its name and shared
    property fields stay in sync with the given GlazeType.

    When ``old_name`` is provided and differs from ``glaze_type.name``, any
    existing combination named ``old_name`` is renamed before the sync step
    (handles the admin rename-GlazeType case).

    The layer check avoids unnecessary delete/create cycles: if a single layer
    already points at the correct GlazeType, the layers are left unchanged.

    Imports are deferred to the function body to avoid circular imports at
    module load time (models import workflow at the module level).
    """
    # Deferred imports to avoid circular dependency (models import workflow).
    from .models import GlazeCombination, GlazeCombinationLayer  # noqa: PLC0415

    combo_props = {field: getattr(glaze_type, field) for field in SHARED_GLAZE_FIELDS}
    combo = None

    if old_name and old_name != glaze_type.name:
        # GlazeType was renamed — rename the existing singleton combination too.
        combo = GlazeCombination.objects.filter(user=None, name=old_name).first()
        if combo is not None:
            combo.name = glaze_type.name
            for field, value in combo_props.items():
                setattr(combo, field, value)
            combo.save(update_fields=["name", *SHARED_GLAZE_FIELDS])

    if combo is None:
        combo, created = GlazeCombination.objects.get_or_create(
            user=None,
            name=glaze_type.name,
            defaults=combo_props,
        )
        if not created:
            for field, value in combo_props.items():
                setattr(combo, field, value)
            combo.save(update_fields=list(SHARED_GLAZE_FIELDS))

    # Ensure exactly one layer pointing at this GlazeType.
    layers = list(combo.layers.select_related("glaze_type").order_by("order"))
    if len(layers) != 1 or layers[0].glaze_type_id != glaze_type.id:
        combo.layers.all().delete()
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=glaze_type, order=0
        )


def bootstrap_dev_user(user) -> None:
    """Make a fresh DEBUG-only account immediately usable in local development.

    The first dev account in a database without any existing superuser is
    promoted to staff/superuser and receives a few sample pieces in
    representative workflow states. The helper is idempotent and a no-op
    outside local development.
    """
    if not getattr(settings, "DEV_BOOTSTRAP_ENABLED", False):
        return

    user_model = type(user)
    if user_model.objects.exclude(pk=user.pk).filter(is_superuser=True).exists():
        return

    if not user.is_staff or not user.is_superuser:
        user.is_staff = True
        user.is_superuser = True
        user.save(update_fields=["is_staff", "is_superuser"])

    from .models import Piece  # noqa: PLC0415

    if not Piece.objects.exists() and not Piece.objects.filter(user=user).exists():
        _seed_dev_pieces(user)


def _seed_dev_pieces(user) -> None:
    """Create a few representative pieces for a newly bootstrapped dev user."""
    from .models import (  # noqa: PLC0415
        ClayBody,
        FiringTemperature,
        GlazeType,
        Piece,
    )

    clay_body, _ = ClayBody.objects.get_or_create(
        user=None,
        name="Brown Stoneware",
        defaults={
            "short_description": "Reliable mid-fire stoneware for local dev demos."
        },
    )
    firing_temperature, _ = FiringTemperature.objects.get_or_create(
        user=None,
        name="Cone 6 Oxidation",
        defaults={
            "cone": "6",
            "temperature_c": 1222,
            "atmosphere": "Oxidation",
        },
    )
    glaze_type, _ = GlazeType.objects.get_or_create(
        user=None,
        name="Floating Blue",
        defaults={
            "short_description": "Sample glaze for bootstrapped dev data.",
            "test_tile_image": "",
            "is_food_safe": True,
            "runs": False,
            "highlights_grooves": True,
            "is_different_on_white_and_brown_clay": True,
            "apply_thin": False,
        },
    )
    sync_glaze_type_singleton_combination(glaze_type)

    from .models import GlazeCombination, Location  # noqa: PLC0415

    glaze_combination = GlazeCombination.objects.get(user=None, name=glaze_type.name)
    bisque_kiln, _ = Location.objects.get_or_create(user=user, name="Bisque Kiln")
    glaze_kiln, _ = Location.objects.get_or_create(user=user, name="Glaze Kiln")

    trimmed_piece = Piece.objects.create(
        user=user,
        name="Trimmed Practice Bowl",
        thumbnail={"url": DEV_THUMBNAIL_URLS["bowl"], "cloudinary_public_id": None},
    )
    _create_piece_state(trimmed_piece, "designed", notes="Starting a quick demo bowl.")
    _create_piece_state(
        trimmed_piece,
        "wheel_thrown",
        notes="Opened and pulled on the wheel.",
        additional_fields={"clay_weight_grams": 1250, "wall_thickness_mm": 7.5},
        global_refs={"clay_body": ("clay_body", clay_body)},
    )
    _create_piece_state(
        trimmed_piece,
        "trimmed",
        notes="Foot ring cleaned up and ready to dry.",
        additional_fields={"trimmed_weight_grams": 980, "pre_trim_weight_grams": 1250},
    )

    bisque_piece = Piece.objects.create(
        user=user,
        name="Bisque Queue Mug",
        thumbnail={"url": DEV_THUMBNAIL_URLS["mug"], "cloudinary_public_id": None},
    )
    _create_piece_state(bisque_piece, "designed", notes="Planning a handbuilt mug.")
    _create_piece_state(
        bisque_piece,
        "handbuilt",
        notes="Walls are up and the handle is attached.",
        global_refs={"clay_body": ("clay_body", clay_body)},
    )
    _create_piece_state(
        bisque_piece,
        "submitted_to_bisque_fire",
        notes="Queued for the next bisque load.",
        global_refs={"kiln_location": ("location", bisque_kiln)},
    )

    finished_piece = Piece.objects.create(
        user=user,
        name="Finished Test Plate",
        thumbnail={"url": DEV_THUMBNAIL_URLS["plate"], "cloudinary_public_id": None},
    )
    _create_piece_state(
        finished_piece, "designed", notes="Small plate for glaze testing."
    )
    _create_piece_state(
        finished_piece,
        "handbuilt",
        notes="Slab-built and compressed.",
        global_refs={"clay_body": ("clay_body", clay_body)},
    )
    _create_piece_state(
        finished_piece,
        "submitted_to_bisque_fire",
        notes="Waiting for bisque firing.",
        global_refs={"kiln_location": ("location", bisque_kiln)},
    )
    _create_piece_state(
        finished_piece,
        "bisque_fired",
        notes="Bisque firing complete.",
        additional_fields={"kiln_temperature_c": 1060, "cone": "04"},
    )
    _create_piece_state(
        finished_piece,
        "glazed",
        notes="Floating Blue test coat applied.",
        global_refs={"glaze_combination": ("glaze_combination", glaze_combination)},
    )
    _create_piece_state(
        finished_piece,
        "submitted_to_glaze_fire",
        notes="Queued for glaze firing.",
        global_refs={"kiln_location": ("location", glaze_kiln)},
    )
    _create_piece_state(
        finished_piece,
        "glaze_fired",
        notes="Out of the kiln and looking promising.",
        additional_fields={"kiln_temperature_c": 1060, "cone": "04"},
        global_refs={"glaze_combination": ("glaze_combination", glaze_combination)},
    )
    _create_piece_state(
        finished_piece,
        "completed",
        notes="Ready for quick UI smoke testing.",
    )


def _create_piece_state(
    piece,
    state: str,
    *,
    notes: str = "",
    additional_fields: dict | None = None,
    global_refs: dict | None = None,
):
    """Create a PieceState plus any workflow global-ref junction rows it needs."""
    from .models import PieceState  # noqa: PLC0415
    from .workflow import get_global_config  # noqa: PLC0415

    piece_state = PieceState.objects.create(
        user=piece.user,
        piece=piece,
        state=state,
        notes=notes,
        additional_fields=additional_fields or {},
    )

    for field_name, (global_name, global_obj) in (global_refs or {}).items():
        config = get_global_config(global_name)
        ref_model = apps.get_model(
            "api", f"{piece_state.__class__.__name__}{config['model']}Ref"
        )
        ref_model.objects.create(
            piece_state=piece_state,
            field_name=field_name,
            **{global_name: global_obj},
        )

    return piece_state
