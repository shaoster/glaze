import pytest

from api.models import GlazeCombination, GlazeType
from api.utils import (
    crop_to_dict,
    parse_cloudinary_getinfo_crop,
    sync_glaze_type_singleton_combination,
)


class TestCloudinaryCropParsing:
    def test_crop_to_dict_rejects_missing_and_invalid_values(self):
        assert crop_to_dict(None) is None
        assert crop_to_dict({"x": 0, "y": 0, "width": 0, "height": 1}) is None
        assert crop_to_dict({"x": "bad", "y": 0, "width": 1, "height": 1}) is None

    def test_crop_to_dict_clamps_relative_values(self):
        assert crop_to_dict({"x": -0.2, "y": 1.2, "width": 1.5, "height": 0.5}) == {
            "x": 0.0,
            "y": 1.0,
            "width": 1.0,
            "height": 0.5,
        }

    def test_normalizes_pixel_coordinates_from_getinfo(self):
        payload = {
            "input": {"width": 1000, "height": 800},
            "g_auto_info": {"x": 100, "y": 80, "width": 500, "height": 400},
        }

        assert parse_cloudinary_getinfo_crop(payload) == {
            "x": 0.1,
            "y": 0.1,
            "width": 0.5,
            "height": 0.5,
        }

    def test_accepts_nested_w_h_crop_coordinates(self):
        payload = {
            "info": {
                "coordinates": [
                    {"ignored": True},
                    {"x": 0.2, "y": 0.3, "w": 0.4, "h": 0.5},
                ]
            }
        }

        assert parse_cloudinary_getinfo_crop(payload) == {
            "x": 0.2,
            "y": 0.3,
            "width": 0.4,
            "height": 0.5,
        }

    def test_returns_none_when_getinfo_has_no_crop(self):
        assert parse_cloudinary_getinfo_crop({"input": {"width": 100}}) is None


@pytest.mark.django_db
class TestSyncGlazeTypeSingletonCombination:
    def test_creates_singleton_combination_for_public_glaze_type(self):
        glaze_type = GlazeType.objects.create(
            user=None,
            name="Floating Blue",
            runs=True,
            is_food_safe=False,
        )

        sync_glaze_type_singleton_combination(glaze_type)

        combo = GlazeCombination.objects.get(user=None, name="Floating Blue")
        assert combo.runs is True
        assert combo.is_food_safe is False
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["Floating Blue"]

    def test_renames_existing_singleton_combination(self):
        glaze_type = GlazeType.objects.create(user=None, name="New Name", runs=False)
        combo = GlazeCombination.objects.create(user=None, name="Old Name")

        sync_glaze_type_singleton_combination(glaze_type, old_name="Old Name")

        combo.refresh_from_db()
        assert combo.name == "New Name"
        assert combo.runs is False
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["New Name"]

    def test_updates_existing_singleton_properties_without_replacing_matching_layer(
        self,
    ):
        glaze_type = GlazeType.objects.create(
            user=None, name="Tenmoku", runs=False, is_food_safe=None
        )
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[glaze_type]
        )
        original_layer_id = combo.layers.get().id

        glaze_type.runs = True
        glaze_type.is_food_safe = True
        sync_glaze_type_singleton_combination(glaze_type)

        combo.refresh_from_db()
        assert combo.runs is True
        assert combo.is_food_safe is True
        assert combo.layers.get().id == original_layer_id
