import hashlib
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from api.models import InviteCode, UserProfile

FAKE_SUB = "google-subject-12345"
FAKE_HASHED_SUB = hashlib.sha256(FAKE_SUB.encode()).hexdigest()

FAKE_PAYLOAD = {
    "sub": FAKE_SUB,
    "iss": "accounts.google.com",
    "aud": "test-client-id",
    "exp": 9999999999,
}


def _make_google_post_mock(id_token="fake-id-token"):
    token_resp = MagicMock()
    token_resp.raise_for_status = MagicMock()
    token_resp.json.return_value = {
        "id_token": id_token,
        "access_token": "fake-access-token",
    }
    return token_resp


def _make_auth_google_request(
    code="authcode", redirect_uri="http://localhost", invite_code=""
):
    factory = APIRequestFactory()
    return factory.post(
        "/api/auth/google/",
        {"code": code, "redirect_uri": redirect_uri, "invite_code": invite_code},
        format="json",
    )


@pytest.mark.django_db
class TestAuthEndpointsMocked:
    def test_logout_success(self, monkeypatch):
        from api import auth_views

        monkeypatch.setattr(auth_views, "logout", lambda req: None)

        factory = APIRequestFactory()
        request = factory.post("/api/auth/logout/")
        user = User(username="testhash")
        force_authenticate(request, user=user)

        response = auth_views.auth_logout(request)
        assert response.status_code == 204

    def test_csrf_view(self):
        from api import auth_views

        factory = APIRequestFactory()
        request = factory.get("/api/auth/csrf/")
        response = auth_views.csrf(request)
        assert response.status_code == 204

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

    def test_auth_preferences_patch_merges_existing_preferences(self, client, user):
        UserProfile.objects.create(
            user=user,
            preferences={
                "process_summary_fields": ["piece.name"],
                "tutorials": {
                    "summary_customize_popover": "show",
                    "other_tutorial": "show",
                },
                "theme": "dark",
            },
        )

        response = client.patch(
            "/api/auth/preferences/",
            {
                "preferences": {
                    "tutorials": {
                        "summary_customize_popover": "don't",
                    }
                }
            },
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["preferences"] == {
            "process_summary_fields": ["piece.name"],
            "tutorials": {
                "summary_customize_popover": "don't",
                "other_tutorial": "show",
            },
            "theme": "dark",
        }

        user.profile.refresh_from_db()
        assert user.profile.preferences == {
            "process_summary_fields": ["piece.name"],
            "tutorials": {
                "summary_customize_popover": "don't",
                "other_tutorial": "show",
            },
            "theme": "dark",
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


@pytest.mark.django_db
class TestAuthMe:
    def test_returns_config_and_null_user_when_unauthenticated(self, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "my-client-id"
        factory = APIRequestFactory()
        request = factory.get("/api/auth/me/")
        response = auth_views.auth_me(request)
        assert response.status_code == 200
        assert response.data["googleOauthClientId"] == "my-client-id"
        assert response.data["user"] is None

    def test_returns_config_and_user_when_authenticated(self, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "my-client-id"
        factory = APIRequestFactory()
        request = factory.get("/api/auth/me/")
        user = User(username="testhash")
        user.save()
        force_authenticate(request, user=user)
        response = auth_views.auth_me(request)
        assert response.status_code == 200
        assert response.data["googleOauthClientId"] == "my-client-id"
        assert response.data["user"] is not None

    def test_returns_503_when_not_configured(self, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = ""
        factory = APIRequestFactory()
        request = factory.get("/api/auth/me/")
        response = auth_views.auth_me(request)
        assert response.status_code == 503


@pytest.mark.django_db
class TestAuthGoogle:
    def _google_mocks(self, payload=None):
        """Context manager stack: mock token exchange + id_token verification."""
        from contextlib import ExitStack

        stack = ExitStack()
        stack.enter_context(
            patch("api.auth_views.httpx.post", return_value=_make_google_post_mock())
        )
        stack.enter_context(
            patch(
                "api.auth_views._verify_google_id_token",
                return_value=payload or FAKE_PAYLOAD,
            )
        )
        stack.enter_context(patch("api.auth_views.login"))
        stack.enter_context(patch("api.auth_views.bootstrap_dev_user"))
        return stack

    def test_new_user_created_with_valid_invite(self, db, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        invite = InviteCode.objects.create()

        with self._google_mocks():
            request = _make_auth_google_request(invite_code=str(invite.code))
            response = auth_views.auth_google(request)

        assert response.status_code == 200
        assert User.objects.filter(username=FAKE_HASHED_SUB).exists()
        invite.refresh_from_db()
        assert invite.used_at is not None

    def test_sha256_sub_stored_never_raw_sub(self, db, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        invite = InviteCode.objects.create()

        with self._google_mocks():
            request = _make_auth_google_request(invite_code=str(invite.code))
            auth_views.auth_google(request)

        created_user = User.objects.get(username=FAKE_HASHED_SUB)
        assert created_user.email == ""
        assert created_user.first_name == ""
        assert created_user.last_name == ""
        profile = UserProfile.objects.get(user=created_user)
        assert profile.openid_subject == FAKE_HASHED_SUB
        assert FAKE_SUB not in profile.openid_subject

    def test_existing_user_logs_in_without_invite(self, db, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        existing_user = User.objects.create_user(username=FAKE_HASHED_SUB)
        UserProfile.objects.create(user=existing_user, openid_subject=FAKE_HASHED_SUB)

        with self._google_mocks():
            request = _make_auth_google_request()
            response = auth_views.auth_google(request)

        assert response.status_code == 200
        assert User.objects.count() == 1

    def test_new_user_without_invite_gets_403(self, db, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        with self._google_mocks():
            request = _make_auth_google_request()
            response = auth_views.auth_google(request)

        assert response.status_code == 403
        assert response.data["code"] == "invite_required"

    def test_used_invite_code_rejected(self, db, settings, user):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        invite = InviteCode.objects.create()
        invite.used_at = timezone.now()
        invite.used_by = user
        invite.save(update_fields=["used_at", "used_by"])

        with self._google_mocks():
            request = _make_auth_google_request(invite_code=str(invite.code))
            response = auth_views.auth_google(request)

        assert response.status_code == 403

    def test_not_configured_returns_503(self, db, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = ""
        settings.GOOGLE_OAUTH_CLIENT_SECRET = ""

        factory = APIRequestFactory()
        request = factory.post("/api/auth/google/", {}, format="json")
        response = auth_views.auth_google(request)
        assert response.status_code == 503
