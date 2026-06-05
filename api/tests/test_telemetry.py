from unittest.mock import Mock

import httpx
import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test.utils import override_settings


@pytest.mark.django_db
class TestTelemetryProxy:
    def test_browser_traces_proxies_raw_otlp_payload(self, client, monkeypatch):
        from api.telemetry_views import _collector_traces_endpoint

        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")

        response_mock = httpx.Response(
            202,
            content=b"",
            headers={"content-type": "text/plain"},
        )
        post_mock = Mock(return_value=response_mock)
        monkeypatch.setattr("api.telemetry_views.httpx.post", post_mock)

        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-bytes",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 202
        assert response.content == b""
        post_mock.assert_called_once_with(
            "http://otelcol:4318/v1/traces",
            content=b"trace-bytes",
            headers={"content-type": "application/x-protobuf"},
            timeout=10.0,
        )
        assert _collector_traces_endpoint() == "http://otelcol:4318/v1/traces"

    def test_browser_traces_rejects_missing_content_length(self, client, monkeypatch):
        # Django's test client does not send Content-Length for empty bodies,
        # so a POST with no body exercises the 411 Length Required guard.
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")

        response = client.post(
            "/api/telemetry/traces/",
            data=b"",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 411

    def test_browser_traces_succeeds_for_authenticated_users(self, client, monkeypatch):
        # Regression for #759: SessionAuthentication.enforce_csrf() accessed
        # DRF's Request.POST which triggered _load_data_and_files(), consuming
        # the body stream before browser_traces() could read it.
        # Fix: @authentication_classes([]) skips SessionAuthentication entirely.
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")
        response_mock = httpx.Response(
            202,
            content=b"",
            headers={"content-type": "text/plain"},
        )
        post_mock = Mock(return_value=response_mock)
        monkeypatch.setattr("api.telemetry_views.httpx.post", post_mock)

        user = User.objects.create_user(username="tester", password="pass")
        client.force_login(user)

        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-bytes",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 202
        post_mock.assert_called_once_with(
            "http://otelcol:4318/v1/traces",
            content=b"trace-bytes",
            headers={"content-type": "application/x-protobuf"},
            timeout=10.0,
        )

    def test_unsupported_content_type_returns_415(self, client):
        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-bytes",
            content_type="text/plain",
        )
        assert response.status_code == 415

    def test_oversized_body_returns_413(self, client):
        from api.telemetry_views import _MAX_TRACE_BODY_BYTES

        response = client.post(
            "/api/telemetry/traces/",
            data=b"x" * (_MAX_TRACE_BODY_BYTES + 1),
            content_type="application/x-protobuf",
        )
        assert response.status_code == 413

    def test_oversized_content_length_header_returns_413_early(self, client):
        from api.telemetry_views import _MAX_TRACE_BODY_BYTES

        # A large Content-Length header is rejected before the body is read.
        response = client.post(
            "/api/telemetry/traces/",
            data=b"\x00",
            content_type="application/x-protobuf",
            CONTENT_LENGTH=str(_MAX_TRACE_BODY_BYTES + 1),
        )
        assert response.status_code == 413

    def test_json_content_type_is_accepted(self, client, monkeypatch):
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")
        response_mock = httpx.Response(
            200, content=b"", headers={"content-type": "application/json"}
        )
        monkeypatch.setattr(
            "api.telemetry_views.httpx.post", Mock(return_value=response_mock)
        )
        response = client.post(
            "/api/telemetry/traces/",
            data=b"{}",
            content_type="application/json",
        )
        assert response.status_code == 200

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            }
        },
    )
    def test_anonymous_requests_are_rate_limited(self, monkeypatch):
        from api.telemetry_views import BrowserTracesThrottle

        cache.clear()
        monkeypatch.setitem(
            BrowserTracesThrottle.THROTTLE_RATES, "browser_traces", "1/min"
        )
        response_mock = httpx.Response(
            200, content=b"", headers={"content-type": "application/json"}
        )
        monkeypatch.setattr(
            "api.telemetry_views.httpx.post", Mock(return_value=response_mock)
        )

        from django.test import Client as DjangoClient

        anon = DjangoClient()
        first = anon.post(
            "/api/telemetry/traces/",
            data=b"\x00",
            content_type="application/x-protobuf",
        )
        second = anon.post(
            "/api/telemetry/traces/",
            data=b"\x00",
            content_type="application/x-protobuf",
        )
        assert first.status_code == 200
        assert second.status_code == 429
