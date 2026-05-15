from unittest.mock import patch

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestHealthReady:
    def _get(self):
        return APIClient().get("/api/health/ready/")

    def test_returns_200_when_all_checks_pass(self):
        response = self._get()
        assert response.status_code == 200
        body = response.json()
        assert body == {
            "status": "ready",
            "checks": {
                "database": True,
                "migrations": True,
                "async_tasks": True,
            },
        }

    def test_anonymous_client_succeeds(self):
        # No login_user, no credentials — endpoint must serve infra probes.
        response = self._get()
        assert response.status_code == 200

    def test_returns_503_when_database_check_fails(self):
        with patch(
            "api.health_views._check_database", side_effect=RuntimeError("boom")
        ):
            response = self._get()
        assert response.status_code == 503
        body = response.json()
        assert body["status"] == "not_ready"
        assert body["checks"]["database"] is False
        # Other checks unaffected.
        assert body["checks"]["migrations"] is True
        assert body["checks"]["async_tasks"] is True
        # Exception detail must not leak.
        assert "boom" not in response.content.decode()

    def test_returns_503_when_migrations_pending(self):
        with patch("api.health_views._check_migrations", return_value=False):
            response = self._get()
        assert response.status_code == 503
        assert response.json()["checks"]["migrations"] is False

    def test_returns_503_when_async_tasks_unhealthy(self):
        with patch("api.tasks.InMemoryTaskInterface.health_check", return_value=False):
            response = self._get()
        assert response.status_code == 503
        assert response.json()["checks"]["async_tasks"] is False
