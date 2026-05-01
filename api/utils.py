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


def get_or_create_location(user, name: str | None):
    """Return a Location for *user* with the given *name*, creating it if needed.

    Returns ``None`` when *name* is falsy so callers can assign the result
    directly to ``piece.current_location``.
    """
    if not name:
        return None
    from .models import Location  # noqa: PLC0415

    location, _ = Location.objects.get_or_create(user=user, name=name)
    return location


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
    """Create 30 representative pieces for a newly bootstrapped dev user.

    The volume exercises the default page size of 24 so infinite-scroll
    pagination is immediately visible in the dev environment.
    """
    from .models import ClayBody, GlazeCombination, GlazeType, Location, Piece  # noqa: PLC0415

    clay_body, _ = ClayBody.objects.get_or_create(
        user=user,
        name="Brown Stoneware",
        defaults={
            "short_description": "Reliable mid-fire stoneware for local dev demos."
        },
    )
    porcelain, _ = ClayBody.objects.get_or_create(
        user=user,
        name="White Porcelain",
        defaults={"short_description": "Smooth throwing porcelain."},
    )
    glaze_type, _ = GlazeType.objects.get_or_create(
        user=user,
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
    celadon, _ = GlazeType.objects.get_or_create(
        user=user,
        name="Celadon Green",
        defaults={
            "short_description": "Soft celadon for porcelain.",
            "test_tile_image": "",
            "is_food_safe": True,
            "runs": False,
            "highlights_grooves": False,
            "is_different_on_white_and_brown_clay": False,
            "apply_thin": True,
        },
    )
    tenmoku, _ = GlazeType.objects.get_or_create(
        user=user,
        name="Tenmoku",
        defaults={
            "short_description": "Dark iron-rich glaze.",
            "test_tile_image": "",
            "is_food_safe": True,
            "runs": True,
            "highlights_grooves": True,
            "is_different_on_white_and_brown_clay": True,
            "apply_thin": False,
        },
    )
    floating_blue_combo, _ = GlazeCombination.get_or_create_with_components(
        user=user, glaze_types=[glaze_type]
    )
    celadon_combo, _ = GlazeCombination.get_or_create_with_components(
        user=user, glaze_types=[celadon]
    )
    tenmoku_combo, _ = GlazeCombination.get_or_create_with_components(
        user=user, glaze_types=[tenmoku]
    )

    bisque_kiln, _ = Location.objects.get_or_create(user=user, name="Bisque Kiln")
    glaze_kiln, _ = Location.objects.get_or_create(user=user, name="Glaze Kiln")
    shelf, _ = Location.objects.get_or_create(user=user, name="Drying Shelf")

    T = DEV_THUMBNAIL_URLS

    # -----------------------------------------------------------------------
    # Pieces at various lifecycle stages.  30 total so the default page of 24
    # leaves a second page for the infinite-scroll trigger to pick up.
    # -----------------------------------------------------------------------

    def _bowl(name, *, clay=clay_body, thumb="bowl"):
        p = Piece.objects.create(
            user=user, name=name,
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )
        return p, clay

    def _mug(name, *, clay=clay_body, thumb="mug"):
        p = Piece.objects.create(
            user=user, name=name,
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )
        return p, clay

    def _plate(name, *, clay=clay_body, thumb="plate"):
        p = Piece.objects.create(
            user=user, name=name,
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )
        return p, clay

    def _vase(name, *, clay=clay_body, thumb="vase"):
        p = Piece.objects.create(
            user=user, name=name,
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )
        return p, clay

    # 1. Just designed
    for label in [
        "Morning Sketch Bowl",
        "Teacup Concept",
        "Platter Idea",
    ]:
        p = Piece.objects.create(
            user=user, name=label,
            thumbnail={"url": T["plate"], "cloudinary_public_id": None},
        )
        _create_piece_state(p, "designed", notes=f"Rough concept for {label}.")

    # 2. Wheel thrown / handbuilt, drying
    p, clay = _bowl("Throwing Practice Bowl")
    _create_piece_state(p, "designed")
    _create_piece_state(p, "wheel_thrown",
        notes="Good centering, walls a bit uneven.",
        additional_fields={"clay_weight_lbs": 1100, "wall_thickness_mm": 8.0},
        global_refs={"clay_body": ("clay_body", clay)})

    p, clay = _mug("Porcelain Yunomi", clay=porcelain)
    _create_piece_state(p, "designed")
    _create_piece_state(p, "wheel_thrown",
        notes="Delicate thin walls.",
        additional_fields={"clay_weight_lbs": 450, "wall_thickness_mm": 4.5},
        global_refs={"clay_body": ("clay_body", clay)})

    p, clay = _vase("Coil-Built Vase")
    _create_piece_state(p, "designed")
    _create_piece_state(p, "handbuilt", notes="Coils blended inside and out.",
        global_refs={"clay_body": ("clay_body", clay)})

    p, clay = _plate("Slab Tray")
    _create_piece_state(p, "designed")
    _create_piece_state(p, "handbuilt", notes="Rolled slab, edges folded.",
        global_refs={"clay_body": ("clay_body", clay)})

    # 3. Trimmed, drying
    p, clay = _bowl("Trimmed Practice Bowl", clay=porcelain)
    _create_piece_state(p, "designed")
    _create_piece_state(p, "wheel_thrown",
        additional_fields={"clay_weight_lbs": 900, "wall_thickness_mm": 6.0},
        global_refs={"clay_body": ("clay_body", clay)})
    _create_piece_state(p, "trimmed",
        notes="Foot ring clean.",
        additional_fields={"trimmed_weight_lbs": 720, "pre_trim_weight_lbs": 900})

    p, clay = _mug("Trimmed Mug")
    _create_piece_state(p, "designed")
    _create_piece_state(p, "wheel_thrown",
        additional_fields={"clay_weight_lbs": 600, "wall_thickness_mm": 6.5},
        global_refs={"clay_body": ("clay_body", clay)})
    _create_piece_state(p, "trimmed",
        additional_fields={"trimmed_weight_lbs": 490, "pre_trim_weight_lbs": 600})

    # 4. Queued / in bisque kiln
    for label, thumb in [
        ("Bisque Bowl #1", "bowl"),
        ("Bisque Mug #1", "mug"),
        ("Bisque Plate #1", "plate"),
    ]:
        p = Piece.objects.create(
            user=user, name=label,
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )
        _create_piece_state(p, "designed")
        _create_piece_state(p, "wheel_thrown",
            additional_fields={"clay_weight_lbs": 800, "wall_thickness_mm": 7.0},
            global_refs={"clay_body": ("clay_body", clay_body)})
        _create_piece_state(p, "trimmed",
            additional_fields={"trimmed_weight_lbs": 650, "pre_trim_weight_lbs": 800})
        _create_piece_state(p, "submitted_to_bisque_fire",
            notes="In the next bisque load.",
            global_refs={"kiln_location": ("location", bisque_kiln)})

    # 5. Bisque-fired, planning glaze
    for label, combo, thumb in [
        ("Blue Bowl", floating_blue_combo, "bowl"),
        ("Celadon Vase", celadon_combo, "vase"),
        ("Tenmoku Mug", tenmoku_combo, "mug"),
        ("Blue Plate", floating_blue_combo, "plate"),
    ]:
        p = Piece.objects.create(
            user=user, name=label,
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )
        _create_piece_state(p, "designed")
        _create_piece_state(p, "wheel_thrown",
            additional_fields={"clay_weight_lbs": 950, "wall_thickness_mm": 7.0},
            global_refs={"clay_body": ("clay_body", clay_body)})
        _create_piece_state(p, "trimmed",
            additional_fields={"trimmed_weight_lbs": 780, "pre_trim_weight_lbs": 950})
        _create_piece_state(p, "submitted_to_bisque_fire",
            global_refs={"kiln_location": ("location", bisque_kiln)})
        _create_piece_state(p, "bisque_fired",
            notes="Bisque complete.",
            additional_fields={"kiln_temperature_c": 1000, "cone": "06"})

    # 6. Glazed and queued for glaze fire
    p, _ = _bowl("Glazed Test Bowl", clay=porcelain)
    _create_piece_state(p, "designed")
    _create_piece_state(p, "wheel_thrown",
        additional_fields={"clay_weight_lbs": 700, "wall_thickness_mm": 5.5},
        global_refs={"clay_body": ("clay_body", porcelain)})
    _create_piece_state(p, "trimmed",
        additional_fields={"trimmed_weight_lbs": 570, "pre_trim_weight_lbs": 700})
    _create_piece_state(p, "submitted_to_bisque_fire",
        global_refs={"kiln_location": ("location", bisque_kiln)})
    _create_piece_state(p, "bisque_fired",
        additional_fields={"kiln_temperature_c": 1000, "cone": "06"})
    _create_piece_state(p, "glazed",
        notes="Celadon, single coat.",
        global_refs={"glaze_combination": ("glaze_combination", celadon_combo)})
    _create_piece_state(p, "submitted_to_glaze_fire",
        notes="Ready for cone 6 fire.",
        global_refs={"kiln_location": ("location", glaze_kiln)})

    # 7. Completed pieces
    for label, combo, thumb in [
        ("Finished Blue Bowl", floating_blue_combo, "bowl"),
        ("Finished Celadon Plate", celadon_combo, "plate"),
        ("Finished Tenmoku Vase", tenmoku_combo, "vase"),
    ]:
        p = Piece.objects.create(
            user=user, name=label,
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )
        _create_piece_state(p, "designed")
        _create_piece_state(p, "wheel_thrown",
            additional_fields={"clay_weight_lbs": 1000, "wall_thickness_mm": 7.0},
            global_refs={"clay_body": ("clay_body", clay_body)})
        _create_piece_state(p, "trimmed",
            additional_fields={"trimmed_weight_lbs": 820, "pre_trim_weight_lbs": 1000})
        _create_piece_state(p, "submitted_to_bisque_fire",
            global_refs={"kiln_location": ("location", bisque_kiln)})
        _create_piece_state(p, "bisque_fired",
            additional_fields={"kiln_temperature_c": 1000, "cone": "06"})
        _create_piece_state(p, "glazed",
            global_refs={"glaze_combination": ("glaze_combination", combo)})
        _create_piece_state(p, "submitted_to_glaze_fire",
            global_refs={"kiln_location": ("location", glaze_kiln)})
        _create_piece_state(p, "glaze_fired",
            notes="Out of the kiln.",
            additional_fields={"kiln_temperature_c": 1240, "cone": "6"},
            global_refs={"glaze_combination": ("glaze_combination", combo)})
        _create_piece_state(p, "completed", notes="Ready to use.")

    # 8. Recycled pieces
    for label in ["Cracked Practice Bowl", "Collapsed Cylinder"]:
        p = Piece.objects.create(
            user=user, name=label,
            thumbnail={"url": T["bowl"], "cloudinary_public_id": None},
        )
        _create_piece_state(p, "designed")
        _create_piece_state(p, "wheel_thrown",
            additional_fields={"clay_weight_lbs": 800, "wall_thickness_mm": 7.0},
            global_refs={"clay_body": ("clay_body", clay_body)})
        _create_piece_state(p, "recycled", notes="Reclaiming the clay.")


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
