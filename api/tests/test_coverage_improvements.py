"""
Coverage improvements for previously untested codepaths:
- manual_tile_imports.py: _ensure_combination_layers, import_glaze_combination, negative cases
- admin.py: PublicLibraryAdmin base class behavior
- serializers.py: TagEntrySerializer, PieceStateCreateSerializer._write_global_ref_rows
  (clear_fields path), PieceStateUpdateSerializer (clear global ref path)
- views.py: auth_google (happy path, email fallback, new user creation, picture update)
"""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import User
from django.test import RequestFactory
from rest_framework.test import APIClient

import api.workflow as workflow_module
from api.models import (
    GlazeCombination,
    GlazeCombinationLayer,
    GlazeType,
    Piece,
    PieceState,
    Tag,
    UserProfile,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MINIMAL_FAKE_IDINFO = {
    "sub": "google-sub-123",
    "email": "google@example.com",
    "given_name": "Google",
    "family_name": "User",
    "picture": "https://example.com/photo.jpg",
}


# ---------------------------------------------------------------------------
# manual_tile_imports – _ensure_combination_layers
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEnsureCombinationLayers:
    """Unit tests for _ensure_combination_layers."""

    def _make_public_type(self, name: str) -> GlazeType:
        return GlazeType.objects.create(user=None, name=name)

    def _make_combo(self, name: str) -> GlazeCombination:
        return GlazeCombination.objects.create(user=None, name=name)

    def test_creates_layers_when_none_exist(self):
        from api.manual_tile_imports import _ensure_combination_layers

        combo = self._make_combo("A")
        t1 = self._make_public_type("TypeA")
        t2 = self._make_public_type("TypeB")

        _ensure_combination_layers(combo, [t1, t2])

        layers = list(combo.layers.order_by("order"))
        assert len(layers) == 2
        assert layers[0].glaze_type_id == t1.id
        assert layers[0].order == 0
        assert layers[1].glaze_type_id == t2.id
        assert layers[1].order == 1

    def test_no_op_when_layers_already_correct(self):
        from api.manual_tile_imports import _ensure_combination_layers

        combo = self._make_combo("B")
        t1 = self._make_public_type("TypeC")
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=t1, order=0)

        _ensure_combination_layers(combo, [t1])

        assert combo.layers.count() == 1

    def test_replaces_layers_when_order_differs(self):
        from api.manual_tile_imports import _ensure_combination_layers

        combo = self._make_combo("C")
        t1 = self._make_public_type("TypeD")
        t2 = self._make_public_type("TypeE")
        # Wrong order: t2 first, t1 second
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=t2, order=0)
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=t1, order=1)

        _ensure_combination_layers(combo, [t1, t2])

        layers = list(combo.layers.order_by("order"))
        assert layers[0].glaze_type_id == t1.id
        assert layers[1].glaze_type_id == t2.id


# ---------------------------------------------------------------------------
# manual_tile_imports – import_glaze_combination negative cases
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestImportGlazeCombinationNegativeCases:
    def _admin_client(self):
        admin = User.objects.create(
            username="admin@combtest.com",
            email="admin@combtest.com",
            is_staff=True,
        )
        c = APIClient()
        c.force_authenticate(user=admin)
        return c

    def _patch_cloudinary(self, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret")

    def test_error_when_combination_missing_first_and_second_glaze(self, monkeypatch):
        self._patch_cloudinary(monkeypatch)
        monkeypatch.setattr(
            "api.manual_tile_imports.cloudinary.uploader.upload",
            lambda *a, **kw: {"secure_url": "https://x.com/img.png", "public_id": "x"},
        )
        client = self._admin_client()
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGBA", (4, 4)).save(buf, format="PNG")
        f = SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png")

        payload = {
            "records": [
                {
                    "client_id": "c1",
                    "filename": "c.png",
                    "reviewed": True,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "",
                        "first_glaze": "",
                        "second_glaze": "",
                    },
                }
            ]
        }
        resp = client.post(
            "/api/admin/manual-square-crop-import/",
            {"payload": json.dumps(payload), "crop_image__c1": f},
            format="multipart",
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "Missing parsed glaze combination name" in result["reason"]

    def test_error_when_missing_first_or_second_glaze_names(self, monkeypatch):
        self._patch_cloudinary(monkeypatch)
        monkeypatch.setattr(
            "api.manual_tile_imports.cloudinary.uploader.upload",
            lambda *a, **kw: {"secure_url": "https://x.com/img.png", "public_id": "x"},
        )
        client = self._admin_client()
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGBA", (4, 4)).save(buf, format="PNG")
        f = SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png")

        payload = {
            "records": [
                {
                    "client_id": "c2",
                    "filename": "c.png",
                    "reviewed": True,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "A!B",
                        "first_glaze": "A",
                        "second_glaze": "",  # second missing
                    },
                }
            ]
        }
        resp = client.post(
            "/api/admin/manual-square-crop-import/",
            {"payload": json.dumps(payload), "crop_image__c2": f},
            format="multipart",
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "first and second glaze" in result["reason"]

    def test_error_when_referenced_glaze_type_does_not_exist(self, monkeypatch):
        self._patch_cloudinary(monkeypatch)
        monkeypatch.setattr(
            "api.manual_tile_imports.cloudinary.uploader.upload",
            lambda *a, **kw: {"secure_url": "https://x.com/img.png", "public_id": "x"},
        )
        client = self._admin_client()
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGBA", (4, 4)).save(buf, format="PNG")
        f = SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png")

        payload = {
            "records": [
                {
                    "client_id": "c3",
                    "filename": "c.png",
                    "reviewed": True,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "Ghost!Void",
                        "first_glaze": "Ghost",
                        "second_glaze": "Void",
                    },
                }
            ]
        }
        resp = client.post(
            "/api/admin/manual-square-crop-import/",
            {"payload": json.dumps(payload), "crop_image__c3": f},
            format="multipart",
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "Missing referenced public glaze type" in result["reason"]

    def test_creates_combination_with_layers(self, monkeypatch):
        self._patch_cloudinary(monkeypatch)
        monkeypatch.setattr(
            "api.manual_tile_imports.cloudinary.uploader.upload",
            lambda *a, **kw: {
                "secure_url": "https://x.com/combo.png",
                "public_id": "combo",
            },
        )
        GlazeType.objects.create(user=None, name="Alpha")
        GlazeType.objects.create(user=None, name="Beta")
        client = self._admin_client()
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGBA", (4, 4)).save(buf, format="PNG")
        f = SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png")

        payload = {
            "records": [
                {
                    "client_id": "c4",
                    "filename": "c.png",
                    "reviewed": True,
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
        resp = client.post(
            "/api/admin/manual-square-crop-import/",
            {"payload": json.dumps(payload), "crop_image__c4": f},
            format="multipart",
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "created"
        combo = GlazeCombination.objects.get(user=None, name="Alpha!Beta")
        assert combo.runs is True
        assert combo.is_food_safe is False
        layer_names = list(
            combo.layers.order_by("order").values_list("glaze_type__name", flat=True)
        )
        assert layer_names == ["Alpha", "Beta"]

    def test_skips_duplicate_combination(self, monkeypatch):
        self._patch_cloudinary(monkeypatch)
        existing = GlazeCombination.objects.create(
            user=None, name="X!Y", test_tile_image="https://x.com/old.png"
        )
        monkeypatch.setattr(
            "api.manual_tile_imports.cloudinary.uploader.upload",
            lambda *a, **kw: (_ for _ in ()).throw(AssertionError("should not upload")),
        )
        client = self._admin_client()
        import io

        from django.core.files.uploadedfile import SimpleUploadedFile
        from PIL import Image

        buf = io.BytesIO()
        Image.new("RGBA", (4, 4)).save(buf, format="PNG")
        f = SimpleUploadedFile("c.png", buf.getvalue(), content_type="image/png")

        payload = {
            "records": [
                {
                    "client_id": "c5",
                    "filename": "c.png",
                    "reviewed": True,
                    "parsed_fields": {
                        "kind": "glaze_combination",
                        "name": "X!Y",
                        "first_glaze": "X",
                        "second_glaze": "Y",
                    },
                }
            ]
        }
        resp = client.post(
            "/api/admin/manual-square-crop-import/",
            {"payload": json.dumps(payload), "crop_image__c5": f},
            format="multipart",
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "skipped_duplicate"
        assert result["object_id"] == str(existing.pk)

    def test_error_when_glaze_type_missing_image(self, monkeypatch):
        self._patch_cloudinary(monkeypatch)
        monkeypatch.setattr(
            "api.manual_tile_imports.cloudinary.uploader.upload",
            lambda *a, **kw: {"secure_url": "https://x.com/img.png", "public_id": "x"},
        )
        client = self._admin_client()

        # No crop_image__ file supplied for this record
        payload = {
            "records": [
                {
                    "client_id": "c6",
                    "filename": "missing.png",
                    "reviewed": True,
                    "parsed_fields": {
                        "kind": "glaze_type",
                        "name": "SomeName",
                    },
                }
            ]
        }
        resp = client.post(
            "/api/admin/manual-square-crop-import/",
            {"payload": json.dumps(payload)},
            format="multipart",
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "error"
        assert "Missing cropped image upload" in result["reason"]


# ---------------------------------------------------------------------------
# admin.py – PublicLibraryAdmin base class
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPublicLibraryAdmin:
    """Smoke tests for PublicLibraryAdmin behavior."""

    def test_list_view_returns_only_public_objects(self):
        """Admin list for a public global should show public-only rows."""
        superuser = User.objects.create_superuser(
            username="superadmin@example.com",
            email="superadmin@example.com",
            password="password",
        )
        # Create one public and one private GlazeType.
        private_user = User.objects.create(
            username="private@example.com", email="private@example.com"
        )
        GlazeType.objects.create(user=None, name="PublicGlaze")
        GlazeType.objects.create(user=private_user, name="PrivateGlaze")

        from django.test import Client as DjangoClient

        c = DjangoClient()
        c.force_login(superuser)
        resp = c.get("/admin/api/glazetype/")
        assert resp.status_code == 200
        content = resp.content.decode()
        assert "PublicGlaze" in content
        assert "PrivateGlaze" not in content

    def test_save_model_forces_user_to_none(self):
        """PublicLibraryAdmin.save_model should strip the user FK."""
        from api.admin import PublicLibraryAdmin

        superuser = User.objects.create_superuser(
            username="su2@example.com",
            email="su2@example.com",
            password="password",
        )
        site = AdminSite()
        ma = PublicLibraryAdmin(GlazeType, site)
        rf = RequestFactory()
        request = rf.post("/")
        request.user = superuser

        obj = GlazeType(user=superuser, name="WillBePublic")
        form = type("FakeForm", (), {"cleaned_data": {}})()
        ma.save_model(request, obj, form, change=False)
        obj.refresh_from_db()
        assert obj.user is None

    def test_get_queryset_excludes_private_objects(self):
        """get_queryset on PublicLibraryAdmin should filter to user__isnull=True."""
        from api.admin import PublicLibraryAdmin

        private_user = User.objects.create(
            username="priv2@example.com", email="priv2@example.com"
        )
        GlazeType.objects.create(user=None, name="PublicQ")
        GlazeType.objects.create(user=private_user, name="PrivateQ")

        superuser = User.objects.create_superuser(
            username="su3@example.com",
            email="su3@example.com",
            password="password",
        )
        site = AdminSite()
        ma = PublicLibraryAdmin(GlazeType, site)
        rf = RequestFactory()
        request = rf.get("/")
        request.user = superuser

        qs = ma.get_queryset(request)
        names = list(qs.values_list("name", flat=True))
        assert "PublicQ" in names
        assert "PrivateQ" not in names

    def test_is_public_entry_display(self):
        """is_public_entry should return True for public objects, False for private."""
        from api.admin import PublicLibraryAdmin

        private_user = User.objects.create(
            username="priv3@example.com", email="priv3@example.com"
        )
        site = AdminSite()
        ma = PublicLibraryAdmin(GlazeType, site)

        public_obj = GlazeType(user=None, name="Pub")
        private_obj = GlazeType(user=private_user, name="Priv")
        assert ma.is_public_entry(public_obj) is True
        assert ma.is_public_entry(private_obj) is False


# ---------------------------------------------------------------------------
# serializers.py – TagEntrySerializer
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTagEntrySerializer:
    def test_serializes_private_tag(self):
        from api.serializers import TagEntrySerializer

        user = User.objects.create(
            username="taguser@example.com", email="taguser@example.com"
        )
        tag = Tag.objects.create(user=user, name="personal")
        data = TagEntrySerializer(tag).data
        assert data["name"] == "personal"
        assert data["is_public"] is False
        assert isinstance(data["id"], str)

    def test_color_field_present(self):
        from api.serializers import TagEntrySerializer

        user = User.objects.create(
            username="coloruser@example.com", email="coloruser@example.com"
        )
        tag = Tag.objects.create(user=user, name="teal", color="#008080")
        data = TagEntrySerializer(tag).data
        assert data["color"] == "#008080"

    def test_global_entries_endpoint_returns_tags(self):
        """Tags are accessible via the globals endpoint with correct shape."""
        user = User.objects.create(
            username="tagapi@example.com", email="tagapi@example.com"
        )
        Tag.objects.create(user=user, name="ocean", color="#0000ff")
        c = APIClient()
        c.force_authenticate(user=user)
        resp = c.get("/api/globals/tag/")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["name"] == "ocean"
        assert items[0]["color"] == "#0000ff"
        assert items[0]["is_public"] is False
        assert isinstance(items[0]["id"], str)


# ---------------------------------------------------------------------------
# serializers.py – _write_global_ref_rows clear_fields path
# (exercised through PieceStateUpdateSerializer.update)
# ---------------------------------------------------------------------------

# We reuse the mock state/globals map from test_additional_fields.py pattern.

_MOCK_STATE_MAP_REF = {
    "entry_state": {
        "id": "entry_state",
        "visible": True,
        "successors": ["state_with_global"],
    },
    "state_with_global": {
        "id": "state_with_global",
        "visible": True,
        "successors": ["terminal_state"],
        "fields": {
            "loc_ref": {
                "$ref": "@location.name",
            }
        },
    },
    "terminal_state": {
        "id": "terminal_state",
        "visible": True,
        "terminal": True,
    },
}

_MOCK_GLOBALS_MAP_REF = {
    "location": {
        "model": "Location",
        "fields": {"name": {"type": "string"}},
    }
}


@pytest.mark.django_db
class TestWriteGlobalRefRowsClearFields:
    """Verify that passing clear_fields to _write_global_ref_rows deletes the row."""

    def test_clear_fields_deletes_junction_row(self, monkeypatch):
        from django.apps import apps

        monkeypatch.setattr(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP_REF)
        monkeypatch.setattr(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP_REF)

        user = User.objects.create(
            username="ref_clear@example.com", email="ref_clear@example.com"
        )
        from api.models import Location

        loc = Location.objects.create(user=user, name="Studio")

        piece = Piece.objects.create(user=user, name="Ref Piece")
        PieceState.objects.create(piece=piece, state="entry_state", user=user)

        # Create piece_state for state_with_global with the global ref row already set.
        piece_state = PieceState.objects.create(
            piece=piece, state="state_with_global", user=user
        )
        ref_model = apps.get_model("api", "PieceStateLocationRef")
        ref_model.objects.create(
            piece_state=piece_state, field_name="loc_ref", location=loc
        )
        assert ref_model.objects.filter(piece_state=piece_state).count() == 1

        # Now call _write_global_ref_rows with clear_fields={"loc_ref"}
        from api.serializers import _write_global_ref_rows

        global_ref_fields = {"loc_ref": "location"}
        _write_global_ref_rows(
            piece_state,
            global_ref_fields,
            {},
            clear_fields={"loc_ref"},
        )

        assert ref_model.objects.filter(piece_state=piece_state).count() == 0

    def test_patch_current_state_clears_global_ref_when_set_to_null(self, monkeypatch):
        """Sending null/empty for a global-ref field in PATCH should remove the junction row."""
        from django.apps import apps

        monkeypatch.setattr(workflow_module, "_STATE_MAP", _MOCK_STATE_MAP_REF)
        monkeypatch.setattr(workflow_module, "_GLOBALS_MAP", _MOCK_GLOBALS_MAP_REF)
        # Also patch SUCCESSORS and VALID_STATES used by serializers
        monkeypatch.setattr(
            workflow_module,
            "SUCCESSORS",
            {
                "entry_state": ["state_with_global"],
                "state_with_global": ["terminal_state"],
            },
        )
        monkeypatch.setattr(
            workflow_module,
            "VALID_STATES",
            {"entry_state", "state_with_global", "terminal_state"},
        )
        monkeypatch.setattr(workflow_module, "ENTRY_STATE", "entry_state")

        user = User.objects.create(
            username="patch_ref@example.com", email="patch_ref@example.com"
        )
        from api.models import Location

        loc = Location.objects.create(user=user, name="Garage")

        piece = Piece.objects.create(user=user, name="Patch Ref Piece")
        PieceState.objects.create(piece=piece, state="entry_state", user=user)
        piece_state = PieceState.objects.create(
            piece=piece, state="state_with_global", user=user
        )
        ref_model = apps.get_model("api", "PieceStateLocationRef")
        ref_model.objects.create(
            piece_state=piece_state, field_name="loc_ref", location=loc
        )

        client = APIClient()
        client.force_authenticate(user=user)
        resp = client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"additional_fields": {"loc_ref": None}},
            format="json",
        )
        assert resp.status_code == 200
        assert ref_model.objects.filter(piece_state=piece_state).count() == 0


# ---------------------------------------------------------------------------
# views.py – auth_google happy paths
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAuthGoogle:
    URL = "/api/auth/google/"

    def _fake_verify(self, credential, request, client_id):
        return _MINIMAL_FAKE_IDINFO.copy()

    def test_returns_400_on_invalid_credential(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        client = APIClient()

        with patch(
            "api.views.google_id_token.verify_oauth2_token",
            side_effect=ValueError("bad token"),
        ):
            resp = client.post(self.URL, {"credential": "bad-token"}, format="json")

        assert resp.status_code == 400
        assert resp.json() == {"detail": "Invalid Google credential."}

    def test_creates_new_user_on_first_google_login(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        client = APIClient()

        with patch(
            "api.views.google_id_token.verify_oauth2_token",
            return_value=_MINIMAL_FAKE_IDINFO.copy(),
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")

        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "google@example.com"
        user = User.objects.get(email="google@example.com")
        assert user.first_name == "Google"
        profile = UserProfile.objects.get(user=user)
        assert profile.openid_subject == "google-sub-123"
        assert profile.profile_image_url == "https://example.com/photo.jpg"

    def test_existing_user_matched_by_openid_subject(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com",
            email="google@example.com",
            password="pass",
        )
        UserProfile.objects.create(user=user, openid_subject="google-sub-123")

        client = APIClient()
        with patch(
            "api.views.google_id_token.verify_oauth2_token",
            return_value=_MINIMAL_FAKE_IDINFO.copy(),
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")

        assert resp.status_code == 200
        assert resp.json()["email"] == "google@example.com"
        # No duplicate users created
        assert User.objects.filter(email="google@example.com").count() == 1

    def test_existing_email_user_linked_on_first_google_login(self, settings):
        """An existing email/password user should be linked to the Google sub, not duplicated."""
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com",
            email="google@example.com",
            password="somepass",
        )
        UserProfile.objects.create(user=user)

        client = APIClient()
        with patch(
            "api.views.google_id_token.verify_oauth2_token",
            return_value=_MINIMAL_FAKE_IDINFO.copy(),
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")

        assert resp.status_code == 200
        # Still only one user
        assert User.objects.filter(email="google@example.com").count() == 1
        profile = UserProfile.objects.get(user=user)
        assert profile.openid_subject == "google-sub-123"

    def test_profile_picture_updated_on_repeat_login(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com",
            email="google@example.com",
            password="pass",
        )
        profile = UserProfile.objects.create(
            user=user,
            openid_subject="google-sub-123",
            profile_image_url="https://example.com/old.jpg",
        )

        new_idinfo = _MINIMAL_FAKE_IDINFO.copy()
        new_idinfo["picture"] = "https://example.com/new.jpg"

        client = APIClient()
        with patch(
            "api.views.google_id_token.verify_oauth2_token", return_value=new_idinfo
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")

        assert resp.status_code == 200
        profile.refresh_from_db()
        assert profile.profile_image_url == "https://example.com/new.jpg"

    def test_missing_credential_field_returns_400(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        client = APIClient()
        resp = client.post(self.URL, {}, format="json")
        assert resp.status_code == 400
