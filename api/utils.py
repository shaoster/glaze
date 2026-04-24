"""Glaze-specific utility helpers.

This module holds business-logic helpers that are shared across multiple parts
of the api app but do not belong in workflow.py (which is reserved for
workflow-state-machine logic derived from workflow.yml).
"""


# Fields that are mirrored between a public GlazeType and its singleton
# single-layer GlazeCombination.  Kept here so both admin.py and
# manual_tile_imports.py can import from one place without pulling in the
# full workflow module.
SHARED_GLAZE_FIELDS: tuple[str, ...] = (
    'test_tile_image',
    'is_food_safe',
    'runs',
    'highlights_grooves',
    'is_different_on_white_and_brown_clay',
    'apply_thin',
)


def sync_glaze_type_singleton_combination(glaze_type, *, old_name: str | None = None) -> None:
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
            combo.save(update_fields=['name', *SHARED_GLAZE_FIELDS])

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
    layers = list(combo.layers.select_related('glaze_type').order_by('order'))
    if len(layers) != 1 or layers[0].glaze_type_id != glaze_type.id:
        combo.layers.all().delete()
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=glaze_type, order=0)
