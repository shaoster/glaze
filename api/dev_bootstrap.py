"""Developer bootstrap helpers for local-only sample data setup."""

from __future__ import annotations

import os

from django.conf import settings


def bootstrap_dev_user(user, count: int | None = None) -> None:
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
        if count is None:
            try:
                count = int(os.environ.get("GLAZE_BOOTSTRAP_COUNT", "75"))
            except (ValueError, TypeError):
                count = 75
        _seed_dev_pieces(user, count=count)


def _seed_dev_pieces(user, count: int = 75) -> None:
    """Create *count* pieces in random workflow states for a bootstrapped dev user."""
    import random  # noqa: PLC0415

    from .models import (  # noqa: PLC0415
        ClayBody,
        GlazeCombination,
        GlazeType,
        Location,
        Piece,
        Tag,
    )
    from .utils import DEV_THUMBNAIL_URLS, normalize_image_payload  # noqa: PLC0415

    rng = random.Random(42)

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
        ("Floating Blue", True, False, True, True, False),
        ("Celadon Green", True, False, False, False, True),
        ("Tenmoku", True, True, True, True, False),
        ("Shino", True, False, False, False, True),
        ("Copper Red", False, True, True, True, False),
    ]
    combos = []
    for name, food_safe, runs, grooves, diff_clay, thin in glaze_defs:
        gt, _ = GlazeType.objects.get_or_create(
            user=user,
            name=name,
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

    def _wheel_thrown_fields(r, clay, _combo):
        weight = r.randint(400, 1800)
        return (
            {
                "clay_weight_lbs": weight,
                "wall_thickness_mm": round(r.uniform(4.0, 12.0), 1),
            },
            {"clay_body": ("clay_body", clay)},
        )

    def _trimmed_fields(r, _clay, _combo):
        pre = r.randint(400, 1800)
        return (
            {
                "trimmed_weight_lbs": int(pre * r.uniform(0.7, 0.95)),
                "pre_trim_weight_lbs": pre,
            },
            None,
        )

    def _bisque_fields(r, _clay, _combo):
        length, w, h = r.randint(3, 12), r.randint(3, 12), r.randint(2, 18)
        return (
            {
                "length_in": float(length),
                "width_in": float(w),
                "height_in": float(h),
            },
            {"kiln_location": ("location", bisque_kiln)},
        )

    def _bisque_fired_fields(r, _clay, _combo):
        return (
            {
                "kiln_temperature_c": r.randint(960, 1020),
                "cone": r.choice(["04", "03"]),
            },
            None,
        )

    def _glazed_fields(_r, _clay, combo):
        return (None, {"glaze_combination": ("glaze_combination", combo)})

    def _glaze_fire_fields(_r, _clay, _combo):
        return (None, {"kiln_location": ("location", glaze_kiln)})

    def _glaze_fired_fields(r, _clay, combo):
        length, w, h = r.randint(3, 12), r.randint(3, 12), r.randint(2, 18)
        shrink = r.uniform(0.85, 0.92)
        return (
            {
                "kiln_temperature_c": r.randint(1220, 1260),
                "cone": r.choice(["5", "6"]),
                "length_in": round(length * shrink, 2),
                "width_in": round(w * shrink, 2),
                "height_in": round(h * shrink, 2),
            },
            {"glaze_combination": ("glaze_combination", combo)},
        )

    WHEEL_PATH = [
        ("designed", None, None),
        ("wheel_thrown", _wheel_thrown_fields, None),
        ("trimmed", _trimmed_fields, None),
        ("submitted_to_bisque_fire", _bisque_fields, None),
        ("bisque_fired", _bisque_fired_fields, None),
        ("glazed", _glazed_fields, None),
        ("submitted_to_glaze_fire", _glaze_fire_fields, None),
        ("glaze_fired", _glaze_fired_fields, None),
        ("completed", None, None),
    ]

    HANDBUILT_PATH = [
        ("designed", None, None),
        (
            "handbuilt",
            lambda r, clay, _combo: (None, {"clay_body": ("clay_body", clay)}),
            None,
        ),
        ("submitted_to_bisque_fire", _bisque_fields, None),
        ("bisque_fired", _bisque_fired_fields, None),
        ("glazed", _glazed_fields, None),
        ("submitted_to_glaze_fire", _glaze_fire_fields, None),
        ("glaze_fired", _glaze_fired_fields, None),
        ("completed", None, None),
    ]

    FORMS = [
        ("Bowl", "bowl"),
        ("Mug", "mug"),
        ("Vase", "vase"),
        ("Plate", "plate"),
        ("Cup", "mug"),
        ("Jug", "vase"),
        ("Platter", "plate"),
        ("Jar", "bowl"),
        ("Pitcher", "vase"),
        ("Dish", "plate"),
    ]

    ADJECTIVES = [
        "Tall",
        "Short",
        "Wide",
        "Rustic",
        "Delicate",
        "Heavy",
        "Practice",
        "Test",
        "Study",
        "Small",
        "Large",
        "Faceted",
        "Carved",
        "Slip-Trailed",
        "Fluted",
        "Altered",
        "Classic",
    ]

    T = DEV_THUMBNAIL_URLS
    from django.apps import apps  # noqa: PLC0415

    PieceTag = apps.get_model("api", "PieceTag")

    TAG_DEFS = [
        ("gift", "#E76F51"),
        ("functional", "#2A9D8F"),
        ("decorative", "#9b5de5"),
        ("for sale", "#457B9D"),
        ("wabi-sabi", "#6d4c41"),
        ("practice", "#78909c"),
        ("commission", "#c0392b"),
        ("series", "#f4a261"),
    ]
    tags = []
    for tag_name, tag_color in TAG_DEFS:
        tag, _ = Tag.objects.get_or_create(
            user=user, name=tag_name, defaults={"color": tag_color}
        )
        tags.append(tag)

    for i in range(count):
        adj = rng.choice(ADJECTIVES)
        form, thumb = rng.choice(FORMS)
        clay = rng.choice(clay_bodies)
        combo = rng.choice(combos)
        path = rng.choice([WHEEL_PATH, HANDBUILT_PATH])

        weights = [3, 4, 3, 3, 3, 2, 2, 2, 1]
        stop = rng.choices(range(len(path)), weights=weights[: len(path)], k=1)[0]

        recycled = stop > 0 and rng.random() < 0.10

        p = Piece.objects.create(
            user=user,
            name=f"{adj} {form} #{i + 1}",
            thumbnail=normalize_image_payload(
                {"url": T[thumb], "cloudinary_public_id": None}, user=user
            ),
        )

        n_tags = rng.choices([0, 1, 2, 3], weights=[3, 4, 2, 1])[0]
        piece_tags = rng.sample(tags, min(n_tags, len(tags)))
        for order, tag in enumerate(piece_tags):
            PieceTag.objects.get_or_create(piece=p, tag=tag, defaults={"order": order})

        for step_state, fields_fn, _ in path[: stop + 1]:
            af, gr = fields_fn(rng, clay, combo) if fields_fn else (None, None)
            _create_piece_state(
                p, step_state, custom_fields=af or {}, global_refs=gr or {}
            )

        if recycled:
            _create_piece_state(p, "recycled", notes="Reclaiming the clay.")


def _create_piece_state(
    piece,
    state: str,
    *,
    notes: str = "",
    custom_fields: dict | None = None,
    global_refs: dict | None = None,
):
    """Create a PieceState plus any workflow global-ref junction rows it needs."""
    from django.apps import apps  # noqa: PLC0415

    from .models import PieceState  # noqa: PLC0415
    from .workflow import get_global_config  # noqa: PLC0415

    piece_state = PieceState.objects.create(
        user=piece.user,
        piece=piece,
        state=state,
        notes=notes,
        custom_fields=custom_fields or {},
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
