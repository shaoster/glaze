from unittest.mock import patch

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from api.models import Piece, UserProfile


@pytest.mark.django_db
class TestAuthEndpoints:
    def test_register_creates_user_and_logs_in(self):
        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            {
                "email": "newuser@example.com",
                "password": "password123",
                "first_name": "New",
                "last_name": "User",
            },
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["is_staff"] is False
        assert User.objects.filter(email="newuser@example.com").exists()
        me_response = client.get("/api/auth/me/")
        assert me_response.status_code == 200
        assert me_response.json()["email"] == "newuser@example.com"

    def test_login_with_email(self):
        User.objects.create_user(
            username="person@example.com",
            email="person@example.com",
            password="password123",
        )
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"email": "person@example.com", "password": "password123"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["email"] == "person@example.com"
        assert response.json()["is_staff"] is False

    def test_login_rejects_invalid_password(self):
        User.objects.create_user(
            username="person@example.com",
            email="person@example.com",
            password="password123",
        )
        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"email": "person@example.com", "password": "wrong-password"},
            format="json",
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid email or password."}

    def test_logout_clears_session(self):
        user = User.objects.create(
            username="logout@example.com",
            email="logout@example.com",
        )
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post("/api/auth/logout/", {}, format="json")
        assert response.status_code == 204

    def test_me_requires_auth(self):
        client = APIClient()
        response = client.get("/api/auth/me/")
        assert response.status_code == 403

    def test_csrf_endpoint_returns_204(self):
        client = APIClient()
        response = client.get("/api/auth/csrf/")
        assert response.status_code == 204

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(
            username="existing@example.com",
            email="existing@example.com",
            password="password123",
        )
        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            {
                "email": "existing@example.com",
                "password": "password123",
            },
            format="json",
        )
        assert response.status_code == 400
        assert response.json() == {"email": ["A user with this email already exists."]}

    def test_google_auth_returns_503_when_not_configured(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = ""
        client = APIClient()
        response = client.post(
            "/api/auth/google/",
            {"credential": "fake-token"},
            format="json",
        )
        assert response.status_code == 503
        assert response.json() == {
            "detail": "Google sign-in is not configured on this server."
        }

    def test_me_includes_staff_flag(self):
        user = User.objects.create(
            username="admin@example.com",
            email="admin@example.com",
            is_staff=True,
        )
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get("/api/auth/me/")
        assert response.status_code == 200
        assert response.json()["is_staff"] is True

    def test_data_endpoints_require_auth(self):
        client = APIClient()
        response = client.get("/api/pieces/")
        assert response.status_code == 403

    def test_register_bootstraps_first_dev_user_when_enabled(self, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True

        client = APIClient()
        response = client.post(
            "/api/auth/register/",
            {
                "email": "devadmin@example.com",
                "password": "password123",
                "first_name": "Dev",
                "last_name": "Admin",
            },
            format="json",
        )
        from api.utils import bootstrap_dev_user

        user = User.objects.get(email="devadmin@example.com")
        bootstrap_dev_user(user, count=5)

        assert response.status_code == 201
        data = response.json()
        assert data["is_staff"] is True

        user = User.objects.get(email="devadmin@example.com")
        assert user.is_staff is True
        assert user.is_superuser is True
        assert Piece.objects.filter(user=user).count() == 5

    def test_login_bootstraps_existing_first_dev_user_when_enabled(self, settings):
        settings.DEV_BOOTSTRAP_ENABLED = True

        user = User.objects.create_user(
            username="person@example.com",
            email="person@example.com",
            password="password123",
        )

        client = APIClient()
        response = client.post(
            "/api/auth/login/",
            {"email": "person@example.com", "password": "password123"},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["is_staff"] is True

        user.refresh_from_db()
        from api.utils import bootstrap_dev_user

        bootstrap_dev_user(user, count=5)
        assert user.is_staff is True
        assert user.is_superuser is True
        assert Piece.objects.filter(user=user).count() == 5


_FAKE_IDINFO = {
    "sub": "google-sub-123",
    "email": "google@example.com",
    "given_name": "Google",
    "family_name": "User",
    "picture": "https://example.com/photo.jpg",
}


@pytest.mark.django_db
class TestAuthGoogle:
    URL = "/api/auth/google/"

    def test_returns_400_on_invalid_credential(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        client = APIClient()
        with patch(
            "api.auth_views.google_id_token.verify_oauth2_token",
            side_effect=ValueError("bad"),
        ):
            resp = client.post(self.URL, {"credential": "bad-token"}, format="json")
        assert resp.status_code == 400
        assert resp.json() == {"detail": "Invalid Google credential."}

    def test_creates_new_user_and_profile_on_first_login(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        client = APIClient()
        with patch(
            "api.auth_views.google_id_token.verify_oauth2_token",
            return_value=_FAKE_IDINFO.copy(),
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        assert resp.json()["email"] == "google@example.com"
        user = User.objects.get(email="google@example.com")
        assert user.first_name == "Google"
        profile = UserProfile.objects.get(user=user)
        assert profile.openid_subject == "google-sub-123"
        assert profile.profile_image_url == "https://example.com/photo.jpg"

    def test_existing_user_matched_by_openid_subject(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com", email="google@example.com", password="pass"
        )
        UserProfile.objects.create(user=user, openid_subject="google-sub-123")
        client = APIClient()
        with patch(
            "api.auth_views.google_id_token.verify_oauth2_token",
            return_value=_FAKE_IDINFO.copy(),
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        assert User.objects.filter(email="google@example.com").count() == 1

    def test_existing_email_user_linked_to_google_sub(self, settings):
        """Email/password account is linked on first Google login instead of duplicated."""
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com",
            email="google@example.com",
            password="somepass",
        )
        UserProfile.objects.create(user=user)
        client = APIClient()
        with patch(
            "api.auth_views.google_id_token.verify_oauth2_token",
            return_value=_FAKE_IDINFO.copy(),
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        assert User.objects.filter(email="google@example.com").count() == 1
        assert UserProfile.objects.get(user=user).openid_subject == "google-sub-123"

    def test_profile_picture_updated_on_repeat_login(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com", email="google@example.com", password="pass"
        )
        profile = UserProfile.objects.create(
            user=user,
            openid_subject="google-sub-123",
            profile_image_url="https://example.com/old.jpg",
        )
        new_idinfo = {**_FAKE_IDINFO, "picture": "https://example.com/new.jpg"}
        client = APIClient()
        with patch(
            "api.auth_views.google_id_token.verify_oauth2_token",
            return_value=new_idinfo,
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        profile.refresh_from_db()
        assert profile.profile_image_url == "https://example.com/new.jpg"

    def test_profile_picture_unchanged_on_repeat_login(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com", email="google@example.com", password="pass"
        )
        profile = UserProfile.objects.create(
            user=user,
            openid_subject="google-sub-123",
            profile_image_url="https://example.com/photo.jpg",
        )
        client = APIClient()
        with patch(
            "api.auth_views.google_id_token.verify_oauth2_token",
            return_value=_FAKE_IDINFO.copy(),
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        profile.refresh_from_db()
        assert profile.profile_image_url == "https://example.com/photo.jpg"

    def test_missing_profile_picture_does_not_clear_existing_picture(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        user = User.objects.create_user(
            username="google@example.com", email="google@example.com", password="pass"
        )
        profile = UserProfile.objects.create(
            user=user,
            openid_subject="google-sub-123",
            profile_image_url="https://example.com/photo.jpg",
        )
        idinfo = {key: value for key, value in _FAKE_IDINFO.items() if key != "picture"}
        client = APIClient()
        with patch(
            "api.auth_views.google_id_token.verify_oauth2_token", return_value=idinfo
        ):
            resp = client.post(self.URL, {"credential": "valid-token"}, format="json")
        assert resp.status_code == 200
        profile.refresh_from_db()
        assert profile.profile_image_url == "https://example.com/photo.jpg"

    def test_missing_credential_returns_400(self, settings):
        settings.GOOGLE_OAUTH_CLIENT_ID = "test-client-id"
        resp = APIClient().post(self.URL, {}, format="json")
        assert resp.status_code == 400
