"""Tests for the dump_public_library and load_public_library management commands."""

import json
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from api.models import COMPOSITE_NAME_SEPARATOR, ClayBody, GlazeCombination, GlazeType
from api.utils import bootstrap_dev_user
from api.management.commands.load_public_library import _extract_cloud_name


class TestExtractCloudName:
    def test_valid_url(self):
        url = "https://res.cloudinary.com/demo/image/upload/v1/glaze/celadon.jpg"
        assert _extract_cloud_name(url) == "demo"

    def test_invalid_hostname(self):
        url = "https://example.com/demo/image/upload/v1/glaze/celadon.jpg"
        assert _extract_cloud_name(url) is None

    def test_malformed_path(self):
        url = "https://res.cloudinary.com/demo/image/"
        assert _extract_cloud_name(url) is None

    def test_not_a_url(self):
        assert _extract_cloud_name("not_a_url") is None

    def test_empty_string(self):
        assert _extract_cloud_name("") is None


@pytest.mark.django_db
class TestDumpPublicLibrary:
    def test_exports_public_clay_bodies(self, tmp_path):
        ClayBody.objects.create(
            user=None, name="Stoneware", short_description="A stoneware body"
        )
        ClayBody.objects.create(user=None, name="Porcelain")
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        clay_records = [r for r in records if r["model"] == "api.claybody"]
        names = [r["fields"]["name"] for r in clay_records]
        assert "Stoneware" in names
        assert "Porcelain" in names

    def test_exports_public_glaze_types(self, tmp_path):
        GlazeType.objects.create(user=None, name="Celadon", is_food_safe=True)
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        glaze_records = [r for r in records if r["model"] == "api.glazetype"]
        assert len(glaze_records) == 1
        assert glaze_records[0]["fields"]["name"] == "Celadon"
        assert glaze_records[0]["fields"]["is_food_safe"] is True

    def test_excludes_private_objects(self, tmp_path, django_user_model):
        user = django_user_model.objects.create(username="user@example.com")
        ClayBody.objects.create(user=user, name="My Private Clay")
        ClayBody.objects.create(user=None, name="Public Clay")
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        names = [r["fields"]["name"] for r in records]
        assert "Public Clay" in names
        assert "My Private Clay" not in names

    def test_no_pk_or_user_in_output(self, tmp_path):
        ClayBody.objects.create(user=None, name="Stoneware")
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        assert len(records) == 1
        fields = records[0]["fields"]
        assert "pk" not in records[0]
        assert "id" not in fields
        assert "user" not in fields

    def test_records_sorted_by_name(self, tmp_path):
        ClayBody.objects.create(user=None, name="Stoneware")
        ClayBody.objects.create(user=None, name="Earthenware")
        ClayBody.objects.create(user=None, name="Porcelain")
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        names = [r["fields"]["name"] for r in records]
        assert names == sorted(names)

    def test_stdout_output(self):
        ClayBody.objects.create(user=None, name="Stoneware")
        out = StringIO()

        call_command("dump_public_library", output="-", stdout=out)

        records = json.loads(out.getvalue())
        assert any(r["fields"]["name"] == "Stoneware" for r in records)

    def test_empty_library_produces_empty_array(self, tmp_path):
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        assert records == []

    def test_excludes_dev_bootstrap_fixture_data(
        self, tmp_path, django_user_model, settings
    ):
        settings.DEV_BOOTSTRAP_ENABLED = True
        user = django_user_model.objects.create_user(
            username="devadmin@example.com",
            email="devadmin@example.com",
            password="password123",
        )
        bootstrap_dev_user(user)
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        exported_names = {record["fields"]["name"] for record in records}
        assert "Brown Stoneware" not in exported_names
        assert "Floating Blue" not in exported_names

    def test_creates_parent_directories(self, tmp_path):
        nested = tmp_path / "a" / "b" / "c" / "library.json"

        call_command("dump_public_library", output=str(nested))

        assert nested.exists()

    def test_exports_image_field_as_dict_with_cloud_name(self, tmp_path):
        image = {
            "url": "https://res.cloudinary.com/demo/image/upload/v1/glaze/celadon.jpg",
            "cloudinary_public_id": "v1/glaze/celadon",
            "cloud_name": "demo",
        }
        GlazeType.objects.create(user=None, name="Celadon", test_tile_image=image)
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        glaze_record = next(r for r in records if r["model"] == "api.glazetype")
        exported_image = glaze_record["fields"]["test_tile_image"]
        assert exported_image["url"] == image["url"]
        assert exported_image["cloudinary_public_id"] == image["cloudinary_public_id"]
        assert exported_image["cloud_name"] == image["cloud_name"]

    def test_exports_null_image_as_none(self, tmp_path):
        GlazeType.objects.create(user=None, name="Celadon", test_tile_image=None)
        output = tmp_path / "out.json"

        call_command("dump_public_library", output=str(output))

        records = json.loads(output.read_text())
        glaze_record = next(r for r in records if r["model"] == "api.glazetype")
        assert glaze_record["fields"]["test_tile_image"] is None


@pytest.mark.django_db
class TestLoadPublicLibrary:
    def _write_fixture(self, tmp_path, records):
        fixture = tmp_path / "library.json"
        fixture.write_text(json.dumps(records))
        return fixture

    def test_creates_new_records(self, tmp_path):
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.claybody",
                    "fields": {"name": "Stoneware", "short_description": "A body"},
                },
                {
                    "model": "api.glazetype",
                    "fields": {
                        "name": "Celadon",
                        "short_description": "",
                        "test_tile_image": None,
                        "is_food_safe": True,
                        "runs": None,
                        "highlights_grooves": None,
                        "is_different_on_white_and_brown_clay": None,
                        "apply_thin": None,
                    },
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))

        assert ClayBody.objects.filter(user=None, name="Stoneware").exists()
        assert GlazeType.objects.filter(user=None, name="Celadon").exists()

    def test_updates_existing_records(self, tmp_path):
        ClayBody.objects.create(user=None, name="Stoneware", short_description="Old")
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.claybody",
                    "fields": {"name": "Stoneware", "short_description": "Updated"},
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))

        obj = ClayBody.objects.get(user=None, name="Stoneware")
        assert obj.short_description == "Updated"
        assert ClayBody.objects.filter(user=None, name="Stoneware").count() == 1

    def test_idempotent_on_repeated_runs(self, tmp_path):
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.claybody",
                    "fields": {"name": "Porcelain", "short_description": "Fine"},
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))
        call_command("load_public_library", fixture=str(fixture))

        assert ClayBody.objects.filter(user=None, name="Porcelain").count() == 1

    def test_does_not_touch_private_objects(self, tmp_path, django_user_model):
        user = django_user_model.objects.create(username="owner@example.com")
        private = ClayBody.objects.create(
            user=user, name="My Clay", short_description="Private"
        )
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.claybody",
                    "fields": {
                        "name": "My Clay",
                        "short_description": "Public version",
                    },
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))

        private.refresh_from_db()
        assert private.short_description == "Private"
        # A separate public record should have been created.
        assert ClayBody.objects.filter(user=None, name="My Clay").exists()

    def test_raises_for_missing_fixture(self, tmp_path):
        with pytest.raises(CommandError, match="not found"):
            call_command("load_public_library", fixture=str(tmp_path / "missing.json"))

    def test_skip_if_missing_exits_cleanly(self, tmp_path):
        out = StringIO()
        # Should not raise; should print a warning instead.
        call_command(
            "load_public_library",
            fixture=str(tmp_path / "missing.json"),
            skip_if_missing=True,
            stdout=out,
        )
        assert "skipping" in out.getvalue().lower()

    def test_raises_for_invalid_json(self, tmp_path):
        bad = tmp_path / "bad.json"
        bad.write_text("not valid json {{{")

        with pytest.raises(CommandError, match="Invalid JSON"):
            call_command("load_public_library", fixture=str(bad))

    def test_raises_for_unknown_model(self, tmp_path):
        fixture = self._write_fixture(
            tmp_path,
            [
                {"model": "api.doesnotexist", "fields": {"name": "X"}},
            ],
        )

        with pytest.raises(CommandError, match="Unknown model"):
            call_command("load_public_library", fixture=str(fixture))

    def test_raises_for_non_list_fixture(self, tmp_path):
        fixture = self._write_fixture(tmp_path, {"model": "api.claybody", "fields": {"name": "X"}})
        with pytest.raises(CommandError, match="Fixture must be a JSON array of records."):
            call_command("load_public_library", fixture=str(fixture))

    def test_raises_for_missing_name_field(self, tmp_path):
        fixture = self._write_fixture(
            tmp_path,
            [{"model": "api.claybody", "fields": {"short_description": "A body"}}],
        )
        with pytest.raises(CommandError, match='Record for model api.claybody is missing a "name" field'):
            call_command("load_public_library", fixture=str(fixture))

    def test_roundtrip_dump_then_load(self, tmp_path, django_user_model):
        """dump_public_library output can be fed directly to load_public_library."""
        ClayBody.objects.create(user=None, name="Stoneware", short_description="A body")
        GlazeType.objects.create(
            user=None,
            name="Celadon",
            is_food_safe=True,
            runs=False,
        )
        output = tmp_path / "library.json"

        call_command("dump_public_library", output=str(output))

        # Clear the database and reload from the fixture.
        ClayBody.objects.all().delete()
        GlazeType.objects.all().delete()

        call_command("load_public_library", fixture=str(output))

        clay = ClayBody.objects.get(user=None, name="Stoneware")
        assert clay.short_description == "A body"

        glaze = GlazeType.objects.get(user=None, name="Celadon")
        assert glaze.is_food_safe is True
        assert glaze.runs is False

    def test_loads_glaze_combination_from_computed_name(self, tmp_path):
        """GlazeCombination fixtures use the computed name; layers are reconstructed on load."""
        GlazeType.objects.create(user=None, name="Celadon", is_food_safe=True)
        GlazeType.objects.create(user=None, name="Tenmoku", is_food_safe=False)
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.glazecombination",
                    "fields": {
                        "name": "Celadon!Tenmoku",
                        "test_tile_image": None,
                        "is_food_safe": False,
                        "runs": False,
                        "highlights_grooves": None,
                        "is_different_on_white_and_brown_clay": None,
                    },
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))

        combo = GlazeCombination.objects.get(user=None)
        sep = COMPOSITE_NAME_SEPARATOR
        assert combo.name == f"Celadon{sep}Tenmoku"
        layer_names = list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        )
        assert layer_names == ["Celadon", "Tenmoku"]
        assert combo.is_food_safe is False

    def test_glaze_combination_load_is_idempotent(self, tmp_path):
        """Loading a GlazeCombination fixture twice does not duplicate layers."""
        GlazeType.objects.create(user=None, name="Celadon")
        GlazeType.objects.create(user=None, name="Tenmoku")
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.glazecombination",
                    "fields": {
                        "name": "Celadon!Tenmoku",
                        "test_tile_image": None,
                        "is_food_safe": None,
                        "runs": None,
                        "highlights_grooves": None,
                        "is_different_on_white_and_brown_clay": None,
                    },
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))
        call_command("load_public_library", fixture=str(fixture))

        assert GlazeCombination.objects.filter(user=None).count() == 1
        combo = GlazeCombination.objects.get(user=None)
        assert combo.layers.count() == 2

    def test_loads_image_field_dict_with_cloud_name(self, tmp_path):
        """Full {url, cloudinary_public_id, cloud_name} image dict round-trips correctly."""
        image = {
            "url": "https://res.cloudinary.com/demo/image/upload/v1/glaze/celadon.jpg",
            "cloudinary_public_id": "v1/glaze/celadon",
            "cloud_name": "demo",
        }
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.glazetype",
                    "fields": {
                        "name": "Celadon",
                        "short_description": "",
                        "test_tile_image": image,
                        "is_food_safe": None,
                        "runs": None,
                        "highlights_grooves": None,
                        "is_different_on_white_and_brown_clay": None,
                        "apply_thin": None,
                    },
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))

        obj = GlazeType.objects.get(user=None, name="Celadon")
        assert obj.test_tile_image == image

    def test_loads_image_field_backfills_cloud_name_from_url(self, tmp_path):
        """Older fixtures without cloud_name have it backfilled from the delivery URL."""
        url = "https://res.cloudinary.com/demo/image/upload/v1/glaze/celadon.jpg"
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.glazetype",
                    "fields": {
                        "name": "Celadon",
                        "short_description": "",
                        "test_tile_image": {
                            "url": url,
                            "cloudinary_public_id": "v1/glaze/celadon",
                        },
                        "is_food_safe": None,
                        "runs": None,
                        "highlights_grooves": None,
                        "is_different_on_white_and_brown_clay": None,
                        "apply_thin": None,
                    },
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))

        obj = GlazeType.objects.get(user=None, name="Celadon")
        assert obj.test_tile_image["cloud_name"] == "demo"
        assert obj.test_tile_image["url"] == url

    def test_loads_null_image_field(self, tmp_path):
        """A null test_tile_image in the fixture stores None on the model."""
        fixture = self._write_fixture(
            tmp_path,
            [
                {
                    "model": "api.glazetype",
                    "fields": {
                        "name": "Matte White",
                        "short_description": "",
                        "test_tile_image": None,
                        "is_food_safe": None,
                        "runs": None,
                        "highlights_grooves": None,
                        "is_different_on_white_and_brown_clay": None,
                        "apply_thin": None,
                    },
                },
            ],
        )

        call_command("load_public_library", fixture=str(fixture))

        obj = GlazeType.objects.get(user=None, name="Matte White")
        assert obj.test_tile_image is None
