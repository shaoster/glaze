from unittest.mock import MagicMock

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIRequestFactory, force_authenticate


@pytest.mark.django_db
class TestAuthEndpointsMocked:
    def test_login_success(self, rf, monkeypatch):
        from api import auth_views

        mock_serializer = MagicMock()
        mock_serializer.return_value.is_valid.return_value = True
        mock_serializer.return_value.validated_data = {
            "email": "test@example.com",
            "password": "password",
        }

        mock_user = MagicMock()
        mock_user.is_authenticated = True

        monkeypatch.setattr(auth_views, "authenticate", lambda **kwargs: mock_user)
        monkeypatch.setattr(auth_views, "login", lambda req, user: None)
        monkeypatch.setattr(auth_views, "LoginSerializer", mock_serializer)
        monkeypatch.setattr(
            auth_views,
            "AuthUserSerializer",
            lambda user, **kwargs: MagicMock(data={"email": "test@example.com"}),
        )

        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/login/",
            {"email": "test@example.com", "password": "password"},
            format="json",
        )
        response = auth_views.auth_login(request)

        assert response.status_code == 200
        assert response.data["email"] == "test@example.com"

    def test_logout_success(self, rf, monkeypatch):
        from api import auth_views

        monkeypatch.setattr(auth_views, "logout", lambda req: None)

        factory = APIRequestFactory()
        request = factory.post("/api/auth/logout/")
        user = User(username="test")
        force_authenticate(request, user=user)

        response = auth_views.auth_logout(request)

        assert response.status_code == 204

    def test_csrf_view(self, rf):
        from api import auth_views

        factory = APIRequestFactory()
        request = factory.get("/api/auth/csrf/")
        response = auth_views.csrf(request)
        assert response.status_code == 204
