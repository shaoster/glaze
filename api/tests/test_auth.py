import asyncio
import hashlib
import json
from collections.abc import AsyncIterable
from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile

import pytest
from django.apps import apps as django_apps
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import Client
from django.test.utils import override_settings
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, force_authenticate

from api.models import (
    ENTRY_STATE,
    CropRun,
    Image,
    InviteCode,
    Piece,
    PieceState,
    PieceStateImage,
    UserProfile,
)

FAKE_SUB = "google-subject-12345"
FAKE_HASHED_SUB = hashlib.sha256(FAKE_SUB.encode()).hexdigest()

FAKE_PAYLOAD = {
    "sub": FAKE_SUB,
    "iss": "accounts.google.com",
    "aud": "test-client-id",
    "exp": 9999999999,
}


def _make_auth_google_request(
    code="authcode", redirect_uri="http://localhost", invite_code=""
):
    factory = APIRequestFactory()
    return factory.post(
        "/api/auth/google/",
        {"code": code, "redirect_uri": redirect_uri, "invite_code": invite_code},
        format="json",
    )


def _make_auth_google_impl_request(
    code="authcode", redirect_uri="http://localhost", invite_code=""
):
    return SimpleNamespace(
        data={"code": code, "redirect_uri": redirect_uri, "invite_code": invite_code},
        _request=_make_auth_google_request(code, redirect_uri, invite_code),
    )


@pytest.mark.django_db
class TestAuthEndpointsMocked:
    def test_logout_success(self, settings):
        from rest_framework.test import APIClient

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"

        login_user = User.objects.create_user(
            username="logout-test@example.com",
            email="logout-test@example.com",
            password="password123",
        )
        session_client = APIClient()
        assert session_client.login(
            username=login_user.username, password="password123"
        )

        response = session_client.post("/api/auth/logout/")
        assert response.status_code == 204

        assert session_client.session.get("_auth_user_id") is None

        followup = session_client.post("/api/auth/logout/")
        assert followup.status_code == 403, followup.content

    def test_csrf_view(self):
        from api.auth.views import csrf

        factory = APIRequestFactory()
        request = factory.get("/api/auth/csrf/")
        response = csrf(request)
        assert response.status_code == 204

    def test_auth_me_sets_csrf_cookie(self, client, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        assert "potterdoc_csrftoken" in response.cookies

    def test_auth_me_includes_preferences(self, client, user, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        UserProfile.objects.create(
            user=user,
            preferences={"process_summary_fields": ["piece.name"]},
        )
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        assert response.json()["user"]["preferences"] == {
            "process_summary_fields": ["piece.name"],
        }

    def test_tutorial_preferences_backfill_normalizes_wire_responses(
        self, client, user, settings
    ):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        profile = UserProfile.objects.create(
            user=user,
            preferences={
                "process_summary_fields": ["piece.name"],
                "tutorials": {
                    "summary_customize_popover": "show",
                    "change_alias_prompt": "don't",
                    "legacy_tutorial": "show",
                },
            },
        )

        def _normalize_tutorial_value(value) -> bool:
            return value is not False and value != "don't"

        def backfill_tutorial_preferences(apps, schema_editor) -> None:
            UserProfile = apps.get_model("api", "UserProfile")
            db_alias = schema_editor.connection.alias

            for p in UserProfile.objects.using(db_alias).all():
                preferences = p.preferences
                if not isinstance(preferences, dict):
                    continue

                tutorials = preferences.get("tutorials")
                if not isinstance(tutorials, dict):
                    continue

                normalized_tutorials = {
                    key: _normalize_tutorial_value(val)
                    for key, val in tutorials.items()
                }
                if normalized_tutorials == tutorials:
                    continue

                updated_preferences = dict(preferences)
                updated_preferences["tutorials"] = normalized_tutorials
                UserProfile.objects.using(db_alias).filter(pk=p.pk).update(
                    preferences=updated_preferences
                )

        backfill_tutorial_preferences(
            django_apps,
            SimpleNamespace(connection=SimpleNamespace(alias=profile._state.db)),
        )
        profile.refresh_from_db()
        assert profile.preferences == {
            "process_summary_fields": ["piece.name"],
            "tutorials": {
                "summary_customize_popover": True,
                "change_alias_prompt": False,
                "legacy_tutorial": True,
            },
        }
        assert all(
            isinstance(value, bool)
            for value in profile.preferences["tutorials"].values()
        )

        me_response = client.get("/api/auth/me/")
        assert me_response.status_code == 200
        assert me_response.json()["user"]["preferences"] == {
            "process_summary_fields": ["piece.name"],
            "tutorials": {
                "summary_customize_popover": True,
                "change_alias_prompt": False,
                "legacy_tutorial": True,
            },
        }
        assert all(
            isinstance(value, bool)
            for value in me_response.json()["user"]["preferences"]["tutorials"].values()
        )

        preferences_response = client.get("/api/auth/preferences/")
        assert preferences_response.status_code == 200
        assert preferences_response.json()["preferences"] == {
            "process_summary_fields": ["piece.name"],
            "tutorials": {
                "summary_customize_popover": True,
                "change_alias_prompt": False,
                "legacy_tutorial": True,
            },
        }
        assert all(
            isinstance(value, bool)
            for value in preferences_response.json()["preferences"][
                "tutorials"
            ].values()
        )

    def test_auth_preferences_round_trip(self, client, user):
        UserProfile.objects.create(user=user)
        response = client.patch(
            "/api/auth/preferences/",
            {"preferences": {"process_summary_fields": ["piece.created"]}},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["preferences"] == {
            "process_summary_fields": ["piece.created"],
        }
        user.profile.refresh_from_db()
        assert user.profile.preferences == {
            "process_summary_fields": ["piece.created"],
        }

    def test_auth_preferences_rejects_privileged_account_fields(self, client, user):
        profile = UserProfile.objects.create(
            user=user,
            alias="Studio Mug",
            preferences={
                "process_summary_fields": ["piece.name"],
                "summary_customize_popover": True,
            },
        )

        response = client.patch(
            "/api/auth/preferences/",
            {
                "is_staff": True,
                "is_superuser": True,
                "groups": [1],
                "user": "not-a-user-id",
            },
            format="json",
        )

        assert response.status_code in {200, 400}

        user.refresh_from_db()
        profile.refresh_from_db()
        assert user.is_staff is False
        assert user.is_superuser is False
        assert profile.alias == "Studio Mug"
        assert profile.preferences == {
            "process_summary_fields": ["piece.name"],
            "summary_customize_popover": True,
        }

    def test_auth_preferences_patch_merges_existing_preferences(self, client, user):
        UserProfile.objects.create(
            user=user,
            preferences={
                "process_summary_fields": ["piece.name"],
                "summary_customize_popover": True,
                "other_tutorial": True,
                "theme": "dark",
            },
        )

        response = client.patch(
            "/api/auth/preferences/",
            {
                "preferences": {
                    "summary_customize_popover": False,
                }
            },
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["preferences"] == {
            "process_summary_fields": ["piece.name"],
            "summary_customize_popover": False,
            "other_tutorial": True,
            "theme": "dark",
        }

        user.profile.refresh_from_db()
        assert user.profile.preferences == {
            "process_summary_fields": ["piece.name"],
            "summary_customize_popover": False,
            "other_tutorial": True,
            "theme": "dark",
        }

    def test_auth_preferences_patch_accepts_alias_prompt(self, client, user):
        UserProfile.objects.create(
            user=user,
            preferences={
                "summary_customize_popover": True,
            },
        )

        response = client.patch(
            "/api/auth/preferences/",
            {
                "preferences": {
                    "change_alias_prompt": False,
                }
            },
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["preferences"] == {
            "summary_customize_popover": True,
            "change_alias_prompt": False,
        }

        user.profile.refresh_from_db()
        assert user.profile.preferences == {
            "summary_customize_popover": True,
            "change_alias_prompt": False,
        }

    def test_auth_me_includes_alias(self, client, user, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        UserProfile.objects.create(user=user, alias="Pottery Phil")
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        assert response.json()["user"]["alias"] == "Pottery Phil"

    def test_auth_me_alias_defaults_to_empty_string(self, client, user, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        UserProfile.objects.create(user=user)
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        assert response.json()["user"]["alias"] == ""

    def test_auth_preferences_patch_sets_alias(self, client, user):
        UserProfile.objects.create(user=user)
        response = client.patch(
            "/api/auth/preferences/",
            {"alias": "Studio Mug"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["alias"] == "Studio Mug"
        user.profile.refresh_from_db()
        assert user.profile.alias == "Studio Mug"

    def test_auth_preferences_patch_clears_alias(self, client, user):
        UserProfile.objects.create(user=user, alias="Old Name")
        response = client.patch(
            "/api/auth/preferences/",
            {"alias": ""},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["alias"] == ""
        user.profile.refresh_from_db()
        assert user.profile.alias == ""

    def test_auth_preferences_get_includes_alias(self, client, user):
        UserProfile.objects.create(user=user, alias="My Alias")
        response = client.get("/api/auth/preferences/")
        assert response.status_code == 200
        assert response.json()["alias"] == "My Alias"

    def test_auth_preferences_patch_combined_alias_and_tutorials(self, client, user):
        UserProfile.objects.create(user=user)
        response = client.patch(
            "/api/auth/preferences/",
            {
                "alias": "Studio Mug",
                "preferences": {
                    "process_summary_fields": ["piece.name"],
                    "summary_customize_popover": False,
                },
            },
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["alias"] == "Studio Mug"
        assert data["preferences"]["process_summary_fields"] == ["piece.name"]
        assert data["preferences"]["summary_customize_popover"] is False
        user.profile.refresh_from_db()
        assert user.profile.alias == "Studio Mug"


@pytest.mark.django_db
class TestAuthMe:
    def test_returns_config_and_null_user_when_unauthenticated(self, settings):
        from api.auth.views import auth_me

        settings.GOOGLE_OAUTH_CLIENT_ID = "my-client-id"
        factory = APIRequestFactory()
        request = factory.get("/api/auth/me/")
        response = auth_me(request)
        assert response.status_code == 200
        assert response.data["googleOauthClientId"] == "my-client-id"
        assert response.data["user"] is None

    def test_returns_config_and_user_when_authenticated(self, settings):
        from api.auth.views import auth_me

        settings.GOOGLE_OAUTH_CLIENT_ID = "my-client-id"
        factory = APIRequestFactory()
        request = factory.get("/api/auth/me/")
        user = User(username="testhash")
        user.save()
        force_authenticate(request, user=user)
        response = auth_me(request)
        assert response.status_code == 200
        assert response.data["googleOauthClientId"] == "my-client-id"
        assert response.data["user"] is not None

    def test_returns_503_when_not_configured(self, settings):
        from api.auth.views import auth_me

        settings.GOOGLE_OAUTH_CLIENT_ID = ""
        factory = APIRequestFactory()
        request = factory.get("/api/auth/me/")
        response = auth_me(request)
        assert response.status_code == 503

    def test_refreshes_session_cookie_for_shared_admin_domain(self, user, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "my-client-id"
        settings.SESSION_COOKIE_DOMAIN = ".potterdoc.com"

        browser = Client()
        browser.force_login(user)

        response = browser.get("/api/auth/me/")

        assert response.status_code == 200
        assert (
            response.cookies[settings.SESSION_COOKIE_NAME]["domain"] == ".potterdoc.com"
        )


@pytest.mark.django_db
class TestAuthGoogle:
    def test_new_user_created_with_valid_invite(self, db, settings):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        invite = InviteCode.objects.create()

        response = auth_google_impl(
            _make_auth_google_impl_request(invite_code=str(invite.code)),
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=lambda req, user: None,
        )

        assert response.status_code == 200
        assert User.objects.filter(username=FAKE_HASHED_SUB).exists()
        # The code is deleted on redemption so no code↔account tuple survives.
        assert not InviteCode.objects.filter(pk=invite.pk).exists()

    def test_sha256_sub_stored_never_raw_sub(self, db, settings):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        invite = InviteCode.objects.create()

        auth_google_impl(
            _make_auth_google_impl_request(invite_code=str(invite.code)),
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=lambda req, user: None,
        )

        created_user = User.objects.get(username=FAKE_HASHED_SUB)
        assert created_user.email == ""
        assert created_user.first_name == ""
        assert created_user.last_name == ""
        profile = UserProfile.objects.get(user=created_user)
        assert profile.openid_subject == FAKE_HASHED_SUB
        assert FAKE_SUB not in profile.openid_subject

    def test_existing_user_logs_in_without_invite(self, db, settings):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        existing_user = User.objects.create_user(username=FAKE_HASHED_SUB)
        UserProfile.objects.create(user=existing_user, openid_subject=FAKE_HASHED_SUB)

        response = auth_google_impl(
            _make_auth_google_impl_request(),
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=lambda req, user: None,
        )

        assert response.status_code == 200
        assert User.objects.count() == 1

    def test_new_user_without_invite_gets_403(self, db, settings):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        response = auth_google_impl(
            _make_auth_google_impl_request(),
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=lambda req, user: None,
        )

        assert response.status_code == 403
        assert response.data["code"] == "invite_required"

    def test_redeemed_invite_code_rejected(self, db, settings):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        # A redeemed code no longer exists (redemption deletes it), so a second
        # attempt with the same value must be rejected — single-use semantics.
        invite = InviteCode.objects.create()
        code_value = str(invite.code)
        invite.delete()

        response = auth_google_impl(
            _make_auth_google_impl_request(invite_code=code_value),
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=lambda req, user: None,
        )

        assert response.status_code == 403

    def test_malformed_invite_code_rejected_not_500(self, db, settings):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        # A non-UUID code must be treated as invalid, not raise (would be a 500).
        response = auth_google_impl(
            _make_auth_google_impl_request(invite_code="not-a-uuid"),
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=lambda req, user: None,
        )

        assert response.status_code == 403
        assert response.data["code"] == "invite_required"

    def test_not_configured_returns_503(self, db, settings):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = ""
        settings.GOOGLE_OAUTH_CLIENT_SECRET = ""

        response = auth_google_impl(
            _make_auth_google_impl_request(),
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=lambda req, user: None,
        )
        assert response.status_code == 503

    def test_auth_google_impl_creates_user_and_logs_in(self, db, settings, monkeypatch):
        from api.auth.google_views import auth_google_impl

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"
        invite = InviteCode.objects.create()
        monkeypatch.setattr(
            "api.auth.google_views.bootstrap_dev_user", lambda user: None
        )
        login_calls = []

        def fake_login(request, user):
            login_calls.append(user)

        request = SimpleNamespace(
            data={
                "code": "authcode",
                "redirect_uri": "http://localhost",
                "invite_code": str(invite.code),
            }
        )
        response = auth_google_impl(
            request,
            exchange_auth_code=lambda code, redirect_uri: {"id_token": "fake-id-token"},
            verify_id_token=lambda id_token: FAKE_PAYLOAD,
            login_fn=fake_login,
        )

        assert response.status_code == 200
        assert login_calls and login_calls[0].username == FAKE_HASHED_SUB

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            }
        },
    )
    def test_google_auth_endpoint_is_rate_limited(self, monkeypatch):
        from api.auth.google_views import GoogleAuthThrottle, auth_google

        cache.clear()
        monkeypatch.setitem(GoogleAuthThrottle.THROTTLE_RATES, "google_auth", "1/min")

        factory = APIRequestFactory()
        first_request = factory.post(
            "/api/auth/google/",
            {"code": "c1", "redirect_uri": "http://localhost", "invite_code": ""},
            format="json",
        )
        second_request = factory.post(
            "/api/auth/google/",
            {"code": "c2", "redirect_uri": "http://localhost", "invite_code": ""},
            format="json",
        )

        first = auth_google(first_request)
        second = auth_google(second_request)

        # First request is processed (may fail for other reasons — no Google creds);
        # second must be throttled regardless of outcome.
        assert first.status_code != 429
        assert second.status_code == 429


async def _collect_async_bytes(chunks: AsyncIterable[bytes]) -> bytes:
    return b"".join([chunk async for chunk in chunks])


@pytest.mark.django_db
class TestAuthExport:
    def test_export_requires_authentication(self):
        from api.auth.views import auth_export

        factory = APIRequestFactory()
        request = factory.get("/api/auth/export/")
        response = auth_export(request)
        assert response.status_code == 403

    def test_export_returns_zip_with_pieces_json(self, user, piece):
        from api.auth.views import auth_export

        factory = APIRequestFactory()
        request = factory.get("/api/auth/export/")
        force_authenticate(request, user=user)
        response = auth_export(request)

        assert response.status_code == 200
        assert response["Content-Type"] == "application/zip"
        assert "potterdoc-export.zip" in response["Content-Disposition"]

        archive_bytes = asyncio.run(_collect_async_bytes(response.streaming_content))
        with ZipFile(BytesIO(archive_bytes)) as archive:
            names = archive.namelist()
            assert "pieces.json" in names
            assert "profile.json" in names
            pieces = json.loads(archive.read("pieces.json"))
            assert isinstance(pieces, list)
            assert any(str(piece.id) == p["id"] for p in pieces)

    def test_export_user_isolation(self, user, other_user):
        from api.auth.views import auth_export
        from api.models import PieceState
        from api.workflow import ENTRY_STATE

        my_piece = Piece.objects.create(user=user, name="My Bowl")
        PieceState.objects.create(user=user, piece=my_piece, state=ENTRY_STATE, order=1)

        other_piece = Piece.objects.create(user=other_user, name="Other piece")
        PieceState.objects.create(
            user=other_user, piece=other_piece, state=ENTRY_STATE, order=1
        )

        factory = APIRequestFactory()
        request = factory.get("/api/auth/export/")
        force_authenticate(request, user=user)
        response = auth_export(request)

        archive_bytes = asyncio.run(_collect_async_bytes(response.streaming_content))
        with ZipFile(BytesIO(archive_bytes)) as archive:
            pieces = json.loads(archive.read("pieces.json"))
            piece_ids = {p["id"] for p in pieces}
            assert str(my_piece.id) in piece_ids
            assert str(other_piece.id) not in piece_ids

    def test_collect_export_data_returns_profile_and_piece_payloads(self, user, piece):
        from api.auth.export_data import collect_export_data

        UserProfile.objects.create(
            user=user,
            alias="Studio Alias",
            preferences={"process_summary_fields": ["piece.name"]},
        )
        factory = APIRequestFactory()
        request = Request(factory.get("/api/auth/export/"))
        request._user = user

        pieces_json, profile_json, images = collect_export_data(user, request)

        pieces = json.loads(pieces_json)
        profile = json.loads(profile_json)
        assert any(str(piece.id) == item["id"] for item in pieces)
        assert profile == {
            "alias": "Studio Alias",
            "preferences": {"process_summary_fields": ["piece.name"]},
        }
        assert images == []

    def test_export_image_name_uses_public_id_and_url_extension(self, user):
        from api.auth.export_archive import export_image_name

        image = Image.objects.create(
            user=user,
            url="https://res.cloudinary.com/demo/image/upload/v1/photos/glaze/test.jpg",
            cloudinary_public_id="exports/gallery/test",
        )

        assert export_image_name(image) == "images/exports__gallery__test.jpg"

    def test_stream_export_archive_writes_zip_entries(self, monkeypatch):
        from api.auth.export_archive import stream_export_archive

        image = Image.objects.create(
            url="https://example.com/path/to/image.png",
            cloudinary_public_id="exports/path/to/image",
        )

        class FakeResponse:
            def raise_for_status(self):
                return None

            async def aiter_bytes(self, chunk_size):
                yield b"fake-image-bytes"

        class FakeStreamContext:
            def __init__(self, response):
                self.response = response

            async def __aenter__(self):
                return self.response

            async def __aexit__(self, exc_type, exc, tb):
                return False

        class FakeAsyncClient:
            def __init__(self, timeout=None):
                self.timeout = timeout

            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            def stream(self, method, url):
                assert method == "GET"
                assert url == image.url
                return FakeStreamContext(FakeResponse())

        monkeypatch.setattr(
            "api.auth.export_archive.httpx.AsyncClient", FakeAsyncClient
        )

        archive_bytes = asyncio.run(
            _collect_async_bytes(
                stream_export_archive(
                    '[{"id": "piece-1"}]', '{"alias": "Studio Alias"}', [image]
                )
            )
        )
        with ZipFile(BytesIO(archive_bytes)) as archive:
            assert archive.read("pieces.json") == b'[{"id": "piece-1"}]'
            assert archive.read("profile.json") == b'{"alias": "Studio Alias"}'
            assert (
                archive.read("images/exports__path__to__image.png")
                == b"fake-image-bytes"
            )


@pytest.mark.django_db
class TestAuthDeleteAccount:
    def test_delete_account_requires_authentication(self):
        from api.auth.views import auth_delete_account

        factory = APIRequestFactory()
        request = factory.delete("/api/auth/account/")
        response = auth_delete_account(request)
        assert response.status_code == 403

    def test_delete_account_removes_user_and_returns_204(self, user):
        from api.auth.account_views import delete_account_impl

        factory = APIRequestFactory()
        request = factory.delete("/api/auth/account/")
        request.user = user
        user_id = user.id

        response = delete_account_impl(request, logout_fn=lambda req: None)

        assert response.status_code == 204
        assert not User.objects.filter(id=user_id).exists()

    def test_delete_account_removes_user_with_protected_image_refs(self, user):
        from rest_framework.test import APIClient

        piece = Piece.objects.create(user=user, name="Protected Bowl")
        state = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        image = Image.objects.create(
            user=user,
            url="https://example.com/protected.jpg",
        )
        piece_state_image = PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            order=0,
        )
        CropRun.objects.create(
            image=image,
            piece_state_image=piece_state_image,
            source={
                "type": "automated",
                "backend": "test",
                "deployment": "local",
                "version": "1",
            },
            status=CropRun.Status.SUCCESS,
        )

        client = APIClient()
        client.force_authenticate(user=user)

        response = client.delete("/api/auth/account/")

        assert response.status_code == 204
        assert not User.objects.filter(id=user.id).exists()
        assert not Piece.objects.filter(id=piece.id).exists()
        assert not Image.objects.filter(id=image.id).exists()
        assert not PieceStateImage.objects.filter(id=piece_state_image.id).exists()
        assert not CropRun.objects.filter(image=image).exists()

    def test_delete_account_removes_piece_state_images_for_owned_images(
        self, user, other_user
    ):
        from rest_framework.test import APIClient

        piece = Piece.objects.create(user=other_user, name="Other Bowl")
        state = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        image = Image.objects.create(
            user=user,
            url="https://example.com/shared.jpg",
        )
        piece_state_image = PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            order=0,
        )

        client = APIClient()
        client.force_authenticate(user=user)

        response = client.delete("/api/auth/account/")

        assert response.status_code == 204
        assert not User.objects.filter(id=user.id).exists()
        assert not Image.objects.filter(id=image.id).exists()
        assert not PieceStateImage.objects.filter(id=piece_state_image.id).exists()

    def test_delete_account_invalidates_session_before_deletion(self, user):
        from api.auth.account_views import delete_account_impl

        deletion_order: list[str] = []

        def fake_logout(req):
            assert User.objects.filter(id=user.id).exists(), (
                "logout must be called before user is deleted"
            )
            deletion_order.append("logout")

        factory = APIRequestFactory()
        request = factory.delete("/api/auth/account/")
        request.user = user
        delete_account_impl(request, logout_fn=fake_logout)

        assert deletion_order == ["logout"]
        assert not User.objects.filter(id=user.id).exists()

    def test_delete_account_only_affects_own_account(self, user, other_user):
        from api.auth.account_views import delete_account_impl

        factory = APIRequestFactory()
        request = factory.delete("/api/auth/account/")
        request.user = user
        other_user_id = other_user.id

        delete_account_impl(request, logout_fn=lambda req: None)

        assert User.objects.filter(id=other_user_id).exists()


@pytest.mark.django_db
class TestMockIdp:
    def test_authorize_get_blocked_when_disabled(self, settings):
        settings.DEV_BOOTSTRAP_ENABLED = False
        client = Client()
        response = client.get(
            "/api/auth/mock-idp/authorize/",
            {"redirect_uri": "/api/auth/mock-idp/complete/", "state": "x"},
        )
        assert response.status_code == 403

    def test_authorize_get_shows_accept_form(self, db, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True
        client = Client()
        response = client.get(
            "/api/auth/mock-idp/authorize/",
            {"redirect_uri": "/api/auth/mock-idp/complete/", "state": "x"},
        )
        assert response.status_code == 200
        assert b"Accept" in response.content
        assert b"dev@localhost" in response.content

    def test_authorize_get_shows_login_hint(self, db, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True
        client = Client()
        response = client.get(
            "/api/auth/mock-idp/authorize/",
            {
                "redirect_uri": "/api/auth/mock-idp/complete/",
                "state": "x",
                "login_hint": "pm@example.com",
            },
        )
        assert response.status_code == 200
        assert b"pm@example.com" in response.content

    def test_authorize_post_redirects_with_code(self, db, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True
        client = Client()
        response = client.post(
            "/api/auth/mock-idp/authorize/",
            {
                "redirect_uri": "/api/auth/mock-idp/complete/",
                "state": "mystate",
                "login_hint": "dev@localhost",
            },
        )
        assert response.status_code == 302
        location = response["Location"]
        assert "code=" in location
        assert "state=mystate" in location
        assert location.startswith("/api/auth/mock-idp/complete/")

    def test_authorize_post_rejects_invalid_redirect_uri(self, db, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True
        client = Client()
        response = client.post(
            "/api/auth/mock-idp/authorize/",
            {
                "redirect_uri": "https://evil.example.com/steal",
                "state": "x",
                "login_hint": "dev@localhost",
            },
        )
        assert response.status_code == 400

    def test_complete_creates_session(self, db, settings, monkeypatch):
        settings.DEV_BOOTSTRAP_ENABLED = True
        monkeypatch.setattr(
            "api.auth.mock_idp_views.seed_dev_pieces", lambda u, **kw: None
        )
        client = Client()
        # POST authorize to get code
        auth_response = client.post(
            "/api/auth/mock-idp/authorize/",
            {
                "redirect_uri": "/api/auth/mock-idp/complete/",
                "state": "x",
                "login_hint": "dev@localhost",
            },
        )
        complete_url = auth_response["Location"]
        complete_response = client.get(complete_url)
        assert complete_response.status_code == 302
        assert complete_response["Location"] == "/"
        # Session should now be authenticated
        me_response = client.get("/api/auth/me/")
        assert me_response.status_code == 200
        assert me_response.json()["user"] is not None
        # AuthUserSerializer exposes openid_subject, not email.
        # For mock-IdP users the subject is sha256("mock-idp:<email>").
        assert me_response.json()["user"]["openid_subject"] != ""

    def test_complete_creates_user_if_missing(self, db, settings, monkeypatch):
        settings.DEV_BOOTSTRAP_ENABLED = True
        monkeypatch.setattr(
            "api.auth.mock_idp_views.seed_dev_pieces", lambda u, **kw: None
        )
        from django.contrib.auth import get_user_model

        User = get_user_model()
        assert not User.objects.filter(email="new@example.com").exists()

        client = Client()
        auth_response = client.post(
            "/api/auth/mock-idp/authorize/",
            {
                "redirect_uri": "/api/auth/mock-idp/complete/",
                "state": "x",
                "login_hint": "new@example.com",
            },
        )
        client.get(auth_response["Location"])
        assert User.objects.filter(email="new@example.com").exists()

    def test_complete_rejects_tampered_code(self, db, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True
        client = Client()
        response = client.get(
            "/api/auth/mock-idp/complete/",
            {"code": "tampered.invalid.code", "state": "x"},
        )
        assert response.status_code == 400

    def test_complete_blocked_when_disabled(self, settings):
        settings.DEV_BOOTSTRAP_ENABLED = False
        client = Client()
        response = client.get(
            "/api/auth/mock-idp/complete/",
            {"code": "anycode", "state": "x"},
        )
        assert response.status_code == 403

    def test_auth_me_includes_mock_idp_url_when_enabled(self, db, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True
        settings.GOOGLE_OAUTH_CLIENT_ID = ""
        client = Client()
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        data = response.json()
        assert data["mockIdpUrl"] is not None
        assert "mock-idp/authorize" in data["mockIdpUrl"]

    def test_auth_me_mock_idp_url_absent_in_prod(self, db, settings):
        settings.DEV_BOOTSTRAP_ENABLED = False
        settings.GOOGLE_OAUTH_CLIENT_ID = "real-client-id"
        client = Client()
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        assert response.json()["mockIdpUrl"] is None
