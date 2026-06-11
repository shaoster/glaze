"""Regression tests for image field storage on global models."""

from types import SimpleNamespace

from django.test import TestCase

from api.models import GlazeCombination, GlazeType

HOSTED_URL = "https://media.example.com/images/public/tile.jpg"


# ---------------------------------------------------------------------------
# Image field storage round-trip tests
# ---------------------------------------------------------------------------


class TestImageFieldStorageRoundTrip(TestCase):
    """Verify the model correctly stores and retrieves image dict values."""

    def test_dict_value_round_trips_through_orm(self):
        image = {"url": HOSTED_URL}
        gt = GlazeType.objects.create(user=None, name="Shino", test_tile_image=image)
        gt.refresh_from_db()
        assert gt.test_tile_image == image

    def test_none_value_stored_as_null(self):
        gt = GlazeType.objects.create(user=None, name="Tenmoku", test_tile_image=None)
        gt.refresh_from_db()
        assert gt.test_tile_image is None

    def test_dict_missing_r2_key_is_valid(self):
        image = {"url": "https://example.com/tile.jpg"}
        gt = GlazeType.objects.create(user=None, name="Ash", test_tile_image=image)
        gt.refresh_from_db()
        assert gt.test_tile_image == image
        assert gt.test_tile_image["r2_key"] is None

    def test_r2_key_derived_from_configured_public_url(self):
        import os

        os.environ["R2_PUBLIC_URL"] = "https://media.example.com"
        try:
            gt = GlazeType.objects.create(
                user=None, name="Oribe", test_tile_image={"url": HOSTED_URL}
            )
            gt.refresh_from_db()
            assert gt.test_tile_image["r2_key"] == "images/public/tile.jpg"
        finally:
            del os.environ["R2_PUBLIC_URL"]

    def test_glaze_combination_stores_dict_image(self):
        image = {"url": HOSTED_URL}
        combo = GlazeCombination.objects.create(
            user=None,
            name="Celadon!Shino",
            test_tile_image=image,
        )
        combo.refresh_from_db()
        assert combo.test_tile_image == image

    def test_all_image_fields_accessible_after_roundtrip(self):
        image = {"url": HOSTED_URL}
        gt = GlazeType.objects.create(user=None, name="Chun Li", test_tile_image=image)
        gt.refresh_from_db()
        assert gt.test_tile_image["url"] == HOSTED_URL


class TestFlattenTutorialPreferencesMigration(TestCase):
    def test_flattens_tutorial_flags_into_root_preferences(self):
        from django.apps import apps as django_apps
        from django.contrib.auth.models import User

        from api.models import UserProfile

        user = User.objects.create(
            username="reader@example.com", email="reader@example.com"
        )
        profile = UserProfile.objects.create(
            user=user,
            preferences={
                "process_summary_fields": ["piece.name"],
                "tutorials": {
                    "summary_customize_popover": True,
                    "change_alias_prompt": False,
                },
            },
        )

        def flatten_tutorials(apps, schema_editor):
            UserProfile = apps.get_model("api", "UserProfile")
            for p in UserProfile.objects.all():
                if isinstance(p.preferences, dict) and "tutorials" in p.preferences:
                    tutorials = p.preferences.pop("tutorials")
                    if isinstance(tutorials, dict):
                        for key, value in tutorials.items():
                            # Move tutorial flags to the root of preferences JSON
                            if key not in p.preferences:
                                p.preferences[key] = value
                    p.save(update_fields=["preferences"])

        flatten_tutorials(
            django_apps,
            SimpleNamespace(connection=SimpleNamespace(alias=profile._state.db)),
        )

        profile.refresh_from_db()
        assert profile.preferences == {
            "process_summary_fields": ["piece.name"],
            "summary_customize_popover": True,
            "change_alias_prompt": False,
        }
