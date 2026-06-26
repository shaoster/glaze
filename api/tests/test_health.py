from unittest.mock import patch

import pytest


@pytest.mark.django_db
class TestHealthReady:
    def _get_direct(self, rf):
        from api.health_views import health_ready

        request = rf.get("/api/health/ready/")
        return health_ready(request)

    def test_returns_200_when_all_checks_pass(self, rf):
        response = self._get_direct(rf)
        assert response.status_code == 200
        body = response.data
        assert body == {
            "status": "ready",
            "checks": {
                "database": True,
                "migrations": True,
                "async_tasks": True,
            },
        }

    def test_anonymous_client_succeeds(self, rf):
        # No login_user, no credentials — endpoint must serve infra probes.
        response = self._get_direct(rf)
        assert response.status_code == 200

    def test_returns_503_when_database_check_fails(self, rf):
        with patch(
            "api.health_views._check_database", side_effect=RuntimeError("boom")
        ):
            response = self._get_direct(rf)
        assert response.status_code == 503
        body = response.data
        assert body["status"] == "not_ready"
        assert body["checks"]["database"] is False
        # Other checks unaffected.
        assert body["checks"]["migrations"] is True
        assert body["checks"]["async_tasks"] is True
        # Exception detail must not leak.
        response.render()
        assert "boom" not in response.content.decode()

    def test_returns_503_when_migrations_pending(self, rf):
        with patch("api.health_views._check_migrations", return_value=False):
            response = self._get_direct(rf)
        assert response.status_code == 503
        assert response.data["checks"]["migrations"] is False

    def test_returns_503_when_async_tasks_unhealthy(self, rf):
        with patch("api.tasks.InMemoryTaskInterface.health_check", return_value=False):
            response = self._get_direct(rf)
        assert response.status_code == 503
        assert response.data["checks"]["async_tasks"] is False

    def test_migrations_check_caching(self, rf):
        from api import health_views

        # Reset global state to clean test state
        original_migrations_ok = health_views._MIGRATIONS_OK
        health_views._MIGRATIONS_OK = False

        try:
            # First call should execute the actual check logic and cache the result
            response = self._get_direct(rf)
            assert response.status_code == 200
            assert health_views._MIGRATIONS_OK is True

            # Subsequent calls should return True instantly from _check_migrations,
            # even if the database connection is broken (because it's cached).
            with patch("django.db.connections") as mock_connections:
                mock_connections.__getitem__.side_effect = RuntimeError(
                    "should not be called"
                )
                assert health_views._check_migrations() is True

        finally:
            health_views._MIGRATIONS_OK = original_migrations_ok

    def test_ignores_untrusted_forwarded_host_header(self, rf):
        # Direct view call doesn't use standard Django settings for X-Forwarded-Host
        # in the same way the test client does, but we can still test the logic.
        from api.health_views import health_ready

        request = rf.get("/api/health/ready/", HTTP_X_FORWARDED_HOST="159.223.154.68")
        response = health_ready(request)
        assert response.status_code == 200

    def test_openapi_schema_contains_only_api_endpoints(self):
        from drf_spectacular.generators import SchemaGenerator

        generator = SchemaGenerator()
        schema = generator.get_schema(request=None, public=True)
        assert len(schema["paths"]) > 0
        for path in schema["paths"].keys():
            assert path.startswith("/api/")

    def test_openapi_schema_registers_agent_token_security_scheme(self):
        from drf_spectacular.generators import SchemaGenerator

        generator = SchemaGenerator()
        schema = generator.get_schema(request=None, public=True)
        security_schemes = schema.get("components", {}).get("securitySchemes", {})
        assert "agentTokenAuth" in security_schemes, (
            f"Expected 'agentTokenAuth' in securitySchemes, got: {list(security_schemes.keys())}"
        )

    def test_openapi_schema_no_illegal_component_names(self):
        import re

        from drf_spectacular.generators import SchemaGenerator

        generator = SchemaGenerator()
        schema = generator.get_schema(request=None, public=True)
        component_names = list(schema.get("components", {}).get("schemas", {}).keys())
        legal_pattern = re.compile(r"^[A-Za-z0-9_.\-]+$")
        illegal = [name for name in component_names if not legal_pattern.match(name)]
        assert illegal == [], (
            f"Expected all component names to be legal identifiers, got illegal: {illegal}"
        )

    def test_openapi_schema_has_zero_generation_errors(self):
        """Regression test for #1001: bridge views without extend_schema_kwargs
        were generating 102 'unable to guess serializer' errors during schema generation.
        """
        from drf_spectacular.drainage import GENERATOR_STATS, reset_generator_stats
        from drf_spectacular.generators import SchemaGenerator

        reset_generator_stats()
        SchemaGenerator().get_schema(request=None, public=True)

        total_errors = sum(GENERATOR_STATS._error_cache.values())
        assert total_errors == 0, (
            f"Expected 0 schema generation errors, got {total_errors}:\n"
            + "\n".join(GENERATOR_STATS._error_cache.keys())
        )
