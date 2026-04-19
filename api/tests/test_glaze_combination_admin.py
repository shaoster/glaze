"""Tests for GlazeCombinationLayerInline admin behavior.

Covers order assignment for new layers and reordering of existing layers via the
adminsortable2-backed inline.  Tests use CustomInlineFormSet (the real formset
class used by SortableInlineAdminMixin) to match runtime behavior exactly.
"""
import pytest
from django.forms.models import inlineformset_factory

from adminsortable2.admin import CustomInlineFormSet

from api.models import GlazeCombination, GlazeCombinationLayer, GlazeType


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_formset_cls():
    return inlineformset_factory(
        GlazeCombination,
        GlazeCombinationLayer,
        fields=('glaze_type', 'order'),
        formset=CustomInlineFormSet,
        extra=0,
        can_delete=True,
    )


def _build_formset(combo, existing_layers, submitted_orders, new_glaze_type_pks, prefix='layers'):
    """Build a bound formset simulating an admin inline POST.

    existing_layers  — list of GlazeCombinationLayer instances
    submitted_orders — parallel list of order values for those layers (as submitted
                       by adminsortable2's 1-based hidden inputs after a drag)
    new_glaze_type_pks — PKs for brand-new layers (no order submitted)
    """
    formset_cls = _make_formset_cls()
    n_existing = len(existing_layers)
    n_new = len(new_glaze_type_pks)
    data = {
        f'{prefix}-TOTAL_FORMS': str(n_existing + n_new),
        f'{prefix}-INITIAL_FORMS': str(n_existing),
        f'{prefix}-MIN_NUM_FORMS': '0',
        f'{prefix}-MAX_NUM_FORMS': '1000',
    }
    for i, (layer, order) in enumerate(zip(existing_layers, submitted_orders)):
        data[f'{prefix}-{i}-id'] = str(layer.pk)
        data[f'{prefix}-{i}-combination'] = str(combo.pk)
        data[f'{prefix}-{i}-glaze_type'] = str(layer.glaze_type_id)
        data[f'{prefix}-{i}-order'] = str(order)
    for j, gt_pk in enumerate(new_glaze_type_pks):
        i = n_existing + j
        data[f'{prefix}-{i}-combination'] = str(combo.pk)
        data[f'{prefix}-{i}-glaze_type'] = str(gt_pk)
    return formset_cls(
        data=data, instance=combo, prefix=prefix,
        default_order_direction='+', default_order_field='order',
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestNewLayerOrderAssignment:
    """New layers get orders placed after all existing layers."""

    def test_single_new_layer_gets_order_after_existing(self):
        gt1 = GlazeType.objects.create(user=None, name='First')
        gt2 = GlazeType.objects.create(user=None, name='Second')
        combo, _ = GlazeCombination.get_or_create_with_components(user=None, glaze_types=[gt1])
        existing = list(combo.layers.order_by('order'))

        formset = _build_formset(combo, existing, [l.order for l in existing], [gt2.pk])
        assert formset.is_valid(), formset.errors
        formset.save()

        layers = list(combo.layers.order_by('order'))
        assert len(layers) == 2
        assert layers[0].glaze_type == gt1
        assert layers[1].glaze_type == gt2
        assert layers[1].order > layers[0].order

    def test_multiple_new_layers_get_sequential_unique_orders(self):
        gt1 = GlazeType.objects.create(user=None, name='First')
        gt2 = GlazeType.objects.create(user=None, name='Second')
        gt3 = GlazeType.objects.create(user=None, name='Third')
        combo, _ = GlazeCombination.get_or_create_with_components(user=None, glaze_types=[gt1])
        existing = list(combo.layers.order_by('order'))

        formset = _build_formset(combo, existing, [l.order for l in existing], [gt2.pk, gt3.pk])
        assert formset.is_valid(), formset.errors
        formset.save()

        layers = list(combo.layers.order_by('order'))
        assert len(layers) == 3
        orders = [l.order for l in layers]
        assert orders == sorted(orders)
        assert len(set(orders)) == 3

    def test_new_layer_on_empty_combination(self):
        gt = GlazeType.objects.create(user=None, name='Only')
        combo = GlazeCombination.objects.create(user=None, name='placeholder')

        formset = _build_formset(combo, [], [], [gt.pk])
        assert formset.is_valid(), formset.errors
        formset.save()

        assert combo.layers.count() == 1


@pytest.mark.django_db
class TestReorderLayers:
    """Reordering existing layers works regardless of their current order values."""

    def test_reorder_only(self):
        gt1 = GlazeType.objects.create(user=None, name='Alpha')
        gt2 = GlazeType.objects.create(user=None, name='Beta')
        combo, _ = GlazeCombination.get_or_create_with_components(user=None, glaze_types=[gt1, gt2])
        layers = list(combo.layers.order_by('order'))  # [gt1@0, gt2@1]

        # Drag gt2 above gt1: adminsortable2 submits 1-based positions.
        formset = _build_formset(combo, layers, [2, 1], [])
        assert formset.is_valid(), formset.errors
        formset.save()

        result = list(combo.layers.order_by('order'))
        assert result[0].glaze_type == gt2
        assert result[1].glaze_type == gt1

    def test_reorder_with_new_layer(self):
        gt1 = GlazeType.objects.create(user=None, name='Alpha')
        gt2 = GlazeType.objects.create(user=None, name='Beta')
        gt3 = GlazeType.objects.create(user=None, name='Gamma')
        combo, _ = GlazeCombination.get_or_create_with_components(user=None, glaze_types=[gt1, gt2])
        layers = list(combo.layers.order_by('order'))  # [gt1@0, gt2@1]

        formset = _build_formset(combo, layers, [2, 1], [gt3.pk])
        assert formset.is_valid(), formset.errors
        formset.save()

        result = list(combo.layers.order_by('order'))
        assert len(result) == 3
        assert result[0].glaze_type == gt2
        assert result[1].glaze_type == gt1
        assert result[2].glaze_type == gt3
