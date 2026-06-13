"""Tests for AgentToken model, AgentTokenAuthentication, and token management endpoints."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from api.auth.agent_token_views import _generate_token, _hash_token
from api.models import AgentToken

User = get_user_model()

_MANAGEMENT_URL = "/api/auth/agent-tokens/"
_STAFF_URL = "/api/staff/invite-code/"


def _create_token(user, name="test token") -> tuple[AgentToken, str]:
    plain = _generate_token()
    token = AgentToken.objects.create(
        user=user, name=name, token_hash=_hash_token(plain)
    )
    return token, plain


def _bearer(plain: str) -> str:
    return f"Bearer {plain}"


@pytest.fixture
def agent_client(user):
    _, plain = _create_token(user)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
    return c


@pytest.mark.django_db
class TestAgentTokenAuthentication:
    def test_valid_token_authenticates_user(self, user):
        _, plain = _create_token(user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.get("/api/pieces/")
        assert response.status_code == 200

    def test_invalid_token_returns_401(self):
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer pdagent_totallyFakeToken")
        response = c.get("/api/pieces/")
        assert response.status_code == 401

    def test_non_agent_bearer_is_ignored_by_agent_auth(self, user):
        """A plain Bearer token (no pdagent_ prefix) should not trigger agent auth."""
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION="Bearer somejwttoken")
        # Should fall through to JWT/session auth, ultimately unauthenticated
        response = c.get("/api/pieces/")
        assert response.status_code == 401

    def test_revoked_token_returns_401(self, user):
        token, plain = _create_token(user)
        token.delete()
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.get("/api/pieces/")
        assert response.status_code == 401

    def test_deactivated_user_token_returns_401(self, db):
        inactive_user = User.objects.create(
            username="inactive@example.com",
            email="inactive@example.com",
            is_active=False,
        )
        _, plain = _create_token(inactive_user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.get("/api/pieces/")
        assert response.status_code == 401

    def test_agent_token_forces_is_staff_false(self, db):
        staff_user = User.objects.create(
            username="staff@example.com", email="staff@example.com", is_staff=True
        )
        _, plain = _create_token(staff_user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.get(_STAFF_URL)
        assert response.status_code == 403

    def test_agent_token_forces_is_superuser_false(self, db):
        super_user = User.objects.create(
            username="super@example.com",
            email="super@example.com",
            is_staff=True,
            is_superuser=True,
        )
        _, plain = _create_token(super_user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.get(_STAFF_URL)
        assert response.status_code == 403

    def test_user_isolation(self, user, other_user):
        """An agent token only grants access to the token owner's data."""
        from api.models import ENTRY_STATE, Piece, PieceState

        other_piece = Piece.objects.create(user=other_user, name="Other's Piece")
        PieceState.objects.create(piece=other_piece, state=ENTRY_STATE, order=1)

        _, plain = _create_token(user)
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.get("/api/pieces/")
        assert response.status_code == 200
        ids = [r["id"] for r in response.json()["results"]]
        assert str(other_piece.id) not in ids


@pytest.mark.django_db
class TestAgentTokenManagement:
    def test_list_tokens(self, user):
        _create_token(user, "token-a")
        _create_token(user, "token-b")
        c = APIClient()
        c.force_login(user)
        response = c.get(_MANAGEMENT_URL)
        assert response.status_code == 200
        names = [t["name"] for t in response.json()]
        assert "token-a" in names
        assert "token-b" in names

    def test_list_tokens_excludes_other_users(self, user, other_user):
        _create_token(other_user, "theirs")
        c = APIClient()
        c.force_login(user)
        response = c.get(_MANAGEMENT_URL)
        assert response.status_code == 200
        assert response.json() == []

    def test_create_token_returns_plain_text_once(self, user):
        c = APIClient()
        c.force_login(user)
        response = c.post(_MANAGEMENT_URL, {"name": "Claude MCP"}, format="json")
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Claude MCP"
        assert "token" in data
        assert data["token"].startswith("pdagent_")
        # Plain-text is NOT retrievable from list endpoint
        list_response = c.get(_MANAGEMENT_URL)
        for t in list_response.json():
            assert "token" not in t

    def test_create_token_name_too_long_returns_400(self, user):
        c = APIClient()
        c.force_login(user)
        response = c.post(_MANAGEMENT_URL, {"name": "x" * 101}, format="json")
        assert response.status_code == 400

    def test_create_token_missing_name_returns_400(self, user):
        c = APIClient()
        c.force_login(user)
        response = c.post(_MANAGEMENT_URL, {}, format="json")
        assert response.status_code == 400

    def test_delete_token(self, user):
        token, _ = _create_token(user)
        c = APIClient()
        c.force_login(user)
        response = c.delete(f"{_MANAGEMENT_URL}{token.id}/")
        assert response.status_code == 204
        assert not AgentToken.objects.filter(id=token.id).exists()

    def test_delete_other_users_token_returns_404(self, user, other_user):
        other_token, _ = _create_token(other_user)
        c = APIClient()
        c.force_login(user)
        response = c.delete(f"{_MANAGEMENT_URL}{other_token.id}/")
        assert response.status_code == 404

    def test_management_rejects_agent_token_auth_on_list(self, user):
        """Agent token auth is not in the view's auth classes — DRF yields anonymous, IsAuthenticated → 403."""
        _, plain = _create_token(user, "self-managing")
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.get(_MANAGEMENT_URL)
        assert response.status_code == 403

    def test_management_rejects_agent_token_auth_on_create(self, user):
        _, plain = _create_token(user, "self-managing")
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.post(_MANAGEMENT_URL, {"name": "new token"}, format="json")
        assert response.status_code == 403

    def test_management_rejects_agent_token_auth_on_delete(self, user):
        token, plain = _create_token(user, "self-revoking")
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=_bearer(plain))
        response = c.delete(f"{_MANAGEMENT_URL}{token.id}/")
        assert response.status_code == 403

    def test_unauthenticated_returns_403(self):
        c = APIClient()
        response = c.get(_MANAGEMENT_URL)
        assert response.status_code == 403
