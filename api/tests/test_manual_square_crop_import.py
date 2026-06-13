import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from api.models import GlazeCombination, GlazeType

URL = "/api/admin/manual-square-crop-import/"

R2_KEY = "images/test/tile.webp"


def _set_r2_env(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com")


@pytest.mark.django_db
class TestManualSquareCropImport:
    def test_requires_admin_user(self):
        user = User.objects.create(
            username="potter@example.com", email="potter@example.com"
        )
        client = APIClient()
        client.force_authenticate(user=user)

        response = client.post(URL, {"records": []}, format="json")

        assert response.status_code == 403

    def test_creates_public_glaze_type_and_single_layer_combination(self, monkeypatch):
        admin = User.objects.create(
            username="admin@example.com", email="admin@example.com", is_staff=True
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        _set_r2_env(monkeypatch)

        payload = {
            "records": [
                {
                    "client_id": "rec-1",
                    "filename": "dragon-green.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "name": "Dragon Green",
                        "kind": "glaze_type",
                        "first_glaze": "",
                        "second_glaze": "",
                        "runs": None,
                        "is_food_safe": None,
                    },
                },
            ],
        }

        response = client.post(URL, payload, format="json")

        assert response.status_code == 200
        body = response.json()
        assert body["summary"] == {
            "created_glaze_types": 1,
            "created_glaze_combinations": 0,
            "skipped_duplicates": 0,
            "errors": 0,
        }
        assert body["results"][0]["status"] == "created"
        glaze_type = GlazeType.objects.get(user=None, name="Dragon Green")
        assert (
            glaze_type.test_tile_image["url"] == f"https://media.example.com/{R2_KEY}"
        )
        assert glaze_type.runs is None
        assert glaze_type.is_food_safe is None
        combo = GlazeCombination.objects.get(user=None, name="Dragon Green")
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["Dragon Green"]

    def test_runs_and_food_safe_written_to_created_glaze_type(self, monkeypatch):
        admin = User.objects.create(
            username="admin3@example.com", email="admin3@example.com", is_staff=True
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        _set_r2_env(monkeypatch)

        payload = {
            "records": [
                {
                    "client_id": "rec-runs",
                    "filename": "caution.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "name": "Caution Drip",
                        "kind": "glaze_type",
                        "first_glaze": "",
                        "second_glaze": "",
                        "runs": True,
                        "is_food_safe": False,
                    },
                },
            ],
        }

        response = client.post(URL, payload, format="json")

        assert response.status_code == 200
        glaze_type = GlazeType.objects.get(user=None, name="Caution Drip")
        assert glaze_type.runs is True
        assert glaze_type.is_food_safe is False

    def test_skips_duplicate_public_glaze_type(self, monkeypatch):
        admin = User.objects.create(
            username="admin2@example.com", email="admin2@example.com", is_staff=True
        )
        existing = GlazeType.objects.create(
            user=None,
            name="Celadon",
            test_tile_image={"url": "https://example.com/existing.png"},
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        _set_r2_env(monkeypatch)

        payload = {
            "records": [
                {
                    "client_id": "rec-dup",
                    "filename": "celadon.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "name": "Celadon",
                        "kind": "glaze_type",
                        "first_glaze": "",
                        "second_glaze": "",
                    },
                },
            ],
        }

        response = client.post(URL, payload, format="json")

        assert response.status_code == 200
        body = response.json()
        assert body["summary"]["skipped_duplicates"] == 1
        assert body["results"][0]["status"] == "skipped_duplicate"
        assert body["results"][0]["object_id"] == str(existing.pk)

    def test_rejects_empty_records(self):
        admin = User.objects.create(
            username="admin-empty@example.com",
            email="admin-empty@example.com",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(URL, {"records": []}, format="json")

        assert response.status_code == 400
        assert response.json() == {
            "detail": "payload.records must be a non-empty list."
        }

    def test_rejects_missing_records_key(self):
        admin = User.objects.create(
            username="admin4@example.com", email="admin4@example.com", is_staff=True
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(URL, {}, format="json")

        assert response.status_code == 400
        assert response.json() == {
            "detail": "payload.records must be a non-empty list."
        }

    def test_returns_400_when_import_raises_value_error(self, monkeypatch):
        admin = User.objects.create(
            username="admin-import-error@example.com",
            email="admin-import-error@example.com",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(user=admin)
        monkeypatch.setattr(
            "api.manual_tile_imports.import_manual_tile_records",
            lambda records, uploaded_files: (_ for _ in ()).throw(
                ValueError("bad import")
            ),
        )

        response = client.post(
            URL,
            {"records": [{"client_id": "rec-1", "reviewed": True, "r2_key": R2_KEY}]},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == {"detail": "bad import"}

    def test_rejects_unreviewed_records(self):
        admin = User.objects.create(
            username="admin6@example.com", email="admin6@example.com", is_staff=True
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(
            URL,
            {"records": [{"client_id": "rec-1", "reviewed": False, "r2_key": R2_KEY}]},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == {
            "detail": "All records must be reviewed before import."
        }

    def test_rejects_record_without_client_id(self):
        admin = User.objects.create(
            username="admin7@example.com", email="admin7@example.com", is_staff=True
        )
        client = APIClient()
        client.force_authenticate(user=admin)

        response = client.post(
            URL,
            {"records": [{"reviewed": True, "r2_key": R2_KEY}]},
            format="json",
        )

        assert response.status_code == 400
        assert response.json() == {"detail": "Each record must include client_id."}


class TestEnsureCombinationLayers:
    def _make_public_type(self, name: str) -> GlazeType:
        return GlazeType.objects.create(user=None, name=name)

    def _make_combo(self, name: str) -> GlazeCombination:
        return GlazeCombination.objects.create(user=None, name=name)

    @pytest.mark.django_db
    def test_creates_layers_when_none_exist(self):
        from api.manual_tile_imports import ensure_combination_layers

        combo = self._make_combo("A")
        t1 = self._make_public_type("TypeA")
        t2 = self._make_public_type("TypeB")

        ensure_combination_layers(combo, [t1, t2])

        layers = list(combo.layers.order_by("order"))
        assert len(layers) == 2
        assert layers[0].glaze_type_id == t1.id
        assert layers[0].order == 0
        assert layers[1].glaze_type_id == t2.id
        assert layers[1].order == 1

    @pytest.mark.django_db
    def test_no_op_when_layers_already_correct(self):
        from api.manual_tile_imports import ensure_combination_layers
        from api.models import GlazeCombinationLayer

        combo = self._make_combo("B")
        t1 = self._make_public_type("TypeC")
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=t1, order=0)

        ensure_combination_layers(combo, [t1])

        assert combo.layers.count() == 1

    @pytest.mark.django_db
    def test_replaces_layers_when_order_differs(self):
        from api.manual_tile_imports import ensure_combination_layers
        from api.models import GlazeCombinationLayer

        combo = self._make_combo("C")
        t1 = self._make_public_type("TypeD")
        t2 = self._make_public_type("TypeE")
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=t2, order=0)
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=t1, order=1)

        ensure_combination_layers(combo, [t1, t2])

        layers = list(combo.layers.order_by("order"))
        assert layers[0].glaze_type_id == t1.id
        assert layers[1].glaze_type_id == t2.id


@pytest.mark.django_db
class TestImportGlazeCombination:
    def _admin_client(self):
        admin = User.objects.create(
            username="admin@combtest.com",
            email="admin@combtest.com",
            is_staff=True,
        )
        c = APIClient()
        c.force_authenticate(user=admin)
        return c

    def _patch_r2(self, monkeypatch):
        _set_r2_env(monkeypatch)

    def test_error_when_combination_missing_name_and_components(self, monkeypatch):
        self._patch_r2(monkeypatch)
        payload = {
            "records": [
                {
                    "client_id": "c1",
                    "filename": "c.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "",
                        "first_glaze": "",
                        "second_glaze": "",
                    },
                }
            ]
        }
        resp = self._admin_client().post(URL, payload, format="json")
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "Missing parsed glaze combination name" in result["reason"]

    def test_error_when_missing_second_glaze_name(self, monkeypatch):
        self._patch_r2(monkeypatch)
        payload = {
            "records": [
                {
                    "client_id": "c2",
                    "filename": "c.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "A!B",
                        "first_glaze": "A",
                        "second_glaze": "",
                    },
                }
            ]
        }
        resp = self._admin_client().post(URL, payload, format="json")
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "first and second glaze" in result["reason"]

    def test_error_when_referenced_glaze_type_does_not_exist(self, monkeypatch):
        self._patch_r2(monkeypatch)
        payload = {
            "records": [
                {
                    "client_id": "c3",
                    "filename": "c.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "Ghost!Void",
                        "first_glaze": "Ghost",
                        "second_glaze": "Void",
                    },
                }
            ]
        }
        resp = self._admin_client().post(URL, payload, format="json")
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "Missing referenced public glaze type" in result["reason"]

    def test_creates_combination_with_layers_and_flags(self, monkeypatch):
        self._patch_r2(monkeypatch)
        GlazeType.objects.create(user=None, name="Alpha")
        GlazeType.objects.create(user=None, name="Beta")
        payload = {
            "records": [
                {
                    "client_id": "c4",
                    "filename": "c.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "Alpha!Beta",
                        "first_glaze": "Alpha",
                        "second_glaze": "Beta",
                        "runs": True,
                        "is_food_safe": False,
                    },
                }
            ]
        }
        resp = self._admin_client().post(URL, payload, format="json")
        assert resp.status_code == 200
        assert resp.json()["results"][0]["status"] == "created"
        combo = GlazeCombination.objects.get(user=None, name="Alpha!Beta")
        assert combo.runs is True
        assert combo.is_food_safe is False
        assert list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        ) == ["Alpha", "Beta"]

    def test_skips_duplicate_combination(self, monkeypatch):
        self._patch_r2(monkeypatch)
        existing = GlazeCombination.objects.create(
            user=None,
            name="X!Y",
            test_tile_image={"url": "https://x.com/old.png"},
        )
        payload = {
            "records": [
                {
                    "client_id": "c5",
                    "filename": "c.png",
                    "reviewed": True,
                    "r2_key": R2_KEY,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "X!Y",
                        "first_glaze": "X",
                        "second_glaze": "Y",
                    },
                }
            ]
        }
        resp = self._admin_client().post(URL, payload, format="json")
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "skipped_duplicate"
        assert result["object_id"] == str(existing.pk)

    def test_error_when_glaze_type_missing_r2_key(self, monkeypatch):
        self._patch_r2(monkeypatch)
        payload = {
            "records": [
                {
                    "client_id": "c6",
                    "filename": "missing.png",
                    "reviewed": True,
                    "r2_key": "",
                    "parsed_fields": {"kind": "glaze_type", "name": "SomeName"},
                }
            ]
        }
        resp = self._admin_client().post(URL, payload, format="json")
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "Missing cropped image upload" in result["reason"]
