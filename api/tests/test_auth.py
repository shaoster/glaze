import base64
import hashlib
import json
from unittest.mock import MagicMock, patch

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from api.models import InviteCode, UserProfile

FAKE_SUB = "google-subject-12345"
FAKE_HASHED_SUB = hashlib.sha256(FAKE_SUB.encode()).hexdigest()


def _make_fake_id_token(sub=FAKE_SUB, client_id="test-client-id"):
    payload = {
        "sub": sub,
        "iss": "accounts.google.com",
        "aud": client_id,
        "exp": 9999999999,
    }
    payload_b64 = (
        base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    )
    return f"header.{payload_b64}.sig"


def _make_google_post_mock(sub=FAKE_SUB, client_id="test-client-id"):
    token_resp = MagicMock()
    token_resp.raise_for_status = MagicMock()
    token_resp.json.return_value = {
        "id_token": _make_fake_id_token(sub, client_id),
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

    def test_auth_me_includes_preferences(self, client, user):
        UserProfile.objects.create(
            user=user,
            preferences={"process_summary_fields": ["piece.name"]},
        )
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        assert response.json()["preferences"] == {
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


@pytest.mark.django_db
class TestAuthGoogle:
    def test_new_user_created_with_valid_invite(self, db, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        invite = InviteCode.objects.create()
        mock_resp = _make_google_post_mock()

        with (
            patch("api.auth_views.httpx.post", return_value=mock_resp),
            patch("api.auth_views.login"),
            patch("api.auth_views.bootstrap_dev_user"),
        ):
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
        mock_resp = _make_google_post_mock()

        with (
            patch("api.auth_views.httpx.post", return_value=mock_resp),
            patch("api.auth_views.login"),
            patch("api.auth_views.bootstrap_dev_user"),
        ):
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
        mock_resp = _make_google_post_mock()

        with (
            patch("api.auth_views.httpx.post", return_value=mock_resp),
            patch("api.auth_views.login"),
            patch("api.auth_views.bootstrap_dev_user"),
        ):
            request = _make_auth_google_request()
            response = auth_views.auth_google(request)

        assert response.status_code == 200
        assert User.objects.count() == 1

    def test_new_user_without_invite_gets_403(self, db, settings):
        from api import auth_views

        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        settings.GOOGLE_OAUTH_CLIENT_SECRET = "test-secret"

        mock_resp = _make_google_post_mock()

        with patch("api.auth_views.httpx.post", return_value=mock_resp):
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
        mock_resp = _make_google_post_mock()

        with patch("api.auth_views.httpx.post", return_value=mock_resp):
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
