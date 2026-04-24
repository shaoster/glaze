import pytest

from api.models import GlazeCombination, GlazeType
from api.utils import sync_glaze_type_singleton_combination


@pytest.mark.django_db
class TestSyncGlazeTypeSingletonCombination:
    def test_creates_singleton_combination_for_public_glaze_type(self):
        glaze_type = GlazeType.objects.create(
            user=None,
            name='Floating Blue',
            runs=True,
            is_food_safe=False,
        )

        sync_glaze_type_singleton_combination(glaze_type)

        combo = GlazeCombination.objects.get(user=None, name='Floating Blue')
        assert combo.runs is True
        assert combo.is_food_safe is False
        assert list(combo.layers.order_by('order').values_list('glaze_type__name', flat=True)) == ['Floating Blue']

    def test_renames_existing_singleton_combination(self):
        glaze_type = GlazeType.objects.create(user=None, name='New Name', runs=False)
        combo = GlazeCombination.objects.create(user=None, name='Old Name')

        sync_glaze_type_singleton_combination(glaze_type, old_name='Old Name')

        combo.refresh_from_db()
        assert combo.name == 'New Name'
        assert combo.runs is False
        assert list(combo.layers.order_by('order').values_list('glaze_type__name', flat=True)) == ['New Name']

    def test_updates_existing_singleton_properties_without_replacing_matching_layer(self):
        glaze_type = GlazeType.objects.create(user=None, name='Tenmoku', runs=False, is_food_safe=None)
        combo, _ = GlazeCombination.get_or_create_with_components(user=None, glaze_types=[glaze_type])
        original_layer_id = combo.layers.get().id

        glaze_type.runs = True
        glaze_type.is_food_safe = True
        sync_glaze_type_singleton_combination(glaze_type)

        combo.refresh_from_db()
        assert combo.runs is True
        assert combo.is_food_safe is True
        assert combo.layers.get().id == original_layer_id
