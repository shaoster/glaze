import time

import pytest
from django.contrib.auth.models import User
from django.core import mail, signing
from rest_framework.test import APIRequestFactory, force_authenticate

from api.invitations import make_invite_token, verify_invite_token


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        username="admin@example.com",
        email="admin@example.com",
        password="adminpass",
    )


@pytest.mark.django_db
class TestInvitationViewsMocked:
    def test_admin_invite_sends_email(self, admin_user):
        from api.auth_views import admin_invite

        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/admin/invite/", {"email": "guest@example.com"}, format="json"
        )
        force_authenticate(request, user=admin_user)

        response = admin_invite(request)
        assert response.status_code == 204
        assert len(mail.outbox) == 1
        assert "guest@example.com" in mail.outbox[0].to

    def test_accept_invite_validates_token(self, db):
        from api.auth_views import accept_invite

        token = make_invite_token("guest@example.com")
        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/accept-invite/", {"token": token}, format="json"
        )

        response = accept_invite(request)
        assert response.status_code == 200
        assert response.data["email"] == "guest@example.com"


class TestInviteTokenLogic:
    def test_round_trip(self):
        email = "test@example.com"
        token = make_invite_token(email)
        assert verify_invite_token(token) == email

    def test_expired_token(self, monkeypatch):
        email = "test@example.com"
        token = make_invite_token(email)
        # Use a fixed start time to avoid recursion
        start_time = time.time()
        monkeypatch.setattr(time, "time", lambda: start_time + 3600 * 24 * 8)
        with pytest.raises(signing.SignatureExpired):
            verify_invite_token(token)

    def test_invalid_token(self):
        with pytest.raises(signing.BadSignature):
            verify_invite_token("not-a-token")
