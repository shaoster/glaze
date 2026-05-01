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
    """Create 75 pieces in random workflow states for a bootstrapped dev user.

    75 pieces fills three full pages of 24 so infinite-scroll pagination is
    immediately exercisable.  A seeded RNG makes the output reproducible across
    dev database resets.
    """
    import random  # noqa: PLC0415

    from .models import ClayBody, GlazeCombination, GlazeType, Location, Piece  # noqa: PLC0415

    rng = random.Random(42)

    # ------------------------------------------------------------------
    # Reference data
    # ------------------------------------------------------------------
    clay_bodies = []
    for name, desc in [
        ("Brown Stoneware", "Reliable mid-fire stoneware."),
        ("White Stoneware", "Smooth mid-fire stoneware."),
        ("White Porcelain", "Translucent throwing porcelain."),
        ("Speckled Buff", "Buff body with iron specks."),
    ]:
        cb, _ = ClayBody.objects.get_or_create(
            user=user, name=name, defaults={"short_description": desc}
        )
        clay_bodies.append(cb)

    glaze_defs = [
        ("Floating Blue",  True,  False, True,  True,  False),
        ("Celadon Green",  True,  False, False, False, True),
        ("Tenmoku",        True,  True,  True,  True,  False),
        ("Shino",          True,  False, False, False, True),
        ("Copper Red",     False, True,  True,  True,  False),
    ]
    combos = []
    for name, food_safe, runs, grooves, diff_clay, thin in glaze_defs:
        gt, _ = GlazeType.objects.get_or_create(
            user=user, name=name,
            defaults={
                "short_description": f"{name} — dev sample glaze.",
                "test_tile_image": "",
                "is_food_safe": food_safe,
                "runs": runs,
                "highlights_grooves": grooves,
                "is_different_on_white_and_brown_clay": diff_clay,
                "apply_thin": thin,
            },
        )
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=user, glaze_types=[gt]
        )
        combos.append(combo)

    bisque_kiln, _ = Location.objects.get_or_create(user=user, name="Bisque Kiln")
    glaze_kiln, _ = Location.objects.get_or_create(user=user, name="Glaze Kiln")

    # ------------------------------------------------------------------
    # State-step definitions
    #
    # Each entry is (state_name, additional_fields_fn, global_refs_fn).
    # The fns receive (rng, clay, combo) and return dicts (or None).
    # ------------------------------------------------------------------
    def _wheel_thrown_fields(r, clay, _combo):
        weight = r.randint(400, 1800)
        return (
            {"clay_weight_lbs": weight, "wall_thickness_mm": round(r.uniform(4.0, 12.0), 1)},
            {"clay_body": ("clay_body", clay)},
        )

    def _trimmed_fields(r, _clay, _combo):
        pre = r.randint(400, 1800)
        return (
            {"trimmed_weight_lbs": int(pre * r.uniform(0.7, 0.95)),
             "pre_trim_weight_lbs": pre},
            None,
        )

    def _bisque_fields(r, _clay, _combo):
        return (
            {"kiln_temperature_c": r.randint(960, 1020), "cone": r.choice(["04", "03"])},
            {"kiln_location": ("location", bisque_kiln)},
        )

    def _bisque_fired_fields(r, _clay, _combo):
        return (
            {"kiln_temperature_c": r.randint(960, 1020), "cone": r.choice(["04", "03"])},
            None,
        )

    def _glazed_fields(_r, _clay, combo):
        return (None, {"glaze_combination": ("glaze_combination", combo)})

    def _glaze_fire_fields(_r, _clay, _combo):
        return (None, {"kiln_location": ("location", glaze_kiln)})

    def _glaze_fired_fields(r, _clay, combo):
        return (
            {"kiln_temperature_c": r.randint(1220, 1260), "cone": r.choice(["5", "6"])},
            {"glaze_combination": ("glaze_combination", combo)},
        )

    # Two paths: wheel-thrown and handbuilt.  Each is a list of
    # (state, additional_fields_fn, global_refs_fn) steps.
    WHEEL_PATH = [
        ("designed",               None,                 None),
        ("wheel_thrown",           _wheel_thrown_fields, None),
        ("trimmed",                _trimmed_fields,      None),
        ("submitted_to_bisque_fire", lambda r,c,g: (None, {"kiln_location": ("location", bisque_kiln)}), None),
        ("bisque_fired",           _bisque_fired_fields, None),
        ("glazed",                 _glazed_fields,       None),
        ("submitted_to_glaze_fire", _glaze_fire_fields,  None),
        ("glaze_fired",            _glaze_fired_fields,  None),
        ("completed",              None,                 None),
    ]

    HANDBUILT_PATH = [
        ("designed",               None,                 None),
        ("handbuilt",              lambda r,c,g: (None, {"clay_body": ("clay_body", c)}), None),
        ("submitted_to_bisque_fire", lambda r,c,g: (None, {"kiln_location": ("location", bisque_kiln)}), None),
        ("bisque_fired",           _bisque_fired_fields, None),
        ("glazed",                 _glazed_fields,       None),
        ("submitted_to_glaze_fire", _glaze_fire_fields,  None),
        ("glaze_fired",            _glaze_fired_fields,  None),
        ("completed",              None,                 None),
    ]

    FORMS = [
        ("Bowl",    "bowl"),
        ("Mug",     "mug"),
        ("Vase",    "vase"),
        ("Plate",   "plate"),
        ("Cup",     "mug"),
        ("Jug",     "vase"),
        ("Platter", "plate"),
        ("Jar",     "bowl"),
        ("Pitcher", "vase"),
        ("Dish",    "plate"),
    ]

    ADJECTIVES = [
        "Tall", "Short", "Wide", "Rustic", "Delicate", "Heavy",
        "Practice", "Test", "Study", "Small", "Large", "Faceted",
        "Carved", "Slip-Trailed", "Fluted", "Altered", "Classic",
    ]

    T = DEV_THUMBNAIL_URLS

    for i in range(75):
        adj   = rng.choice(ADJECTIVES)
        form, thumb = rng.choice(FORMS)
        clay  = rng.choice(clay_bodies)
        combo = rng.choice(combos)
        path  = rng.choice([WHEEL_PATH, HANDBUILT_PATH])

        # How far along the path does this piece get?
        # Weight distribution: more pieces in early/mid states, fewer completed.
        stop = rng.choices(range(len(path)), weights=[3,4,3,3,3,2,2,2,1], k=1)[0]

        # 10 % chance of recycling instead of stopping at the chosen state.
        recycled = stop > 0 and rng.random() < 0.10

        p = Piece.objects.create(
            user=user,
            name=f"{adj} {form} #{i + 1}",
            thumbnail={"url": T[thumb], "cloudinary_public_id": None},
        )

        for step_state, fields_fn, _ in path[: stop + 1]:
            af, gr = fields_fn(rng, clay, combo) if fields_fn else (None, None)
            _create_piece_state(p, step_state,
                additional_fields=af or {},
                global_refs=gr or {})

        if recycled:
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
