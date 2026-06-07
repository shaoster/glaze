import threading
import time
from unittest.mock import Mock

import httpx
import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test.utils import override_settings


def _signalling_mock(event: threading.Event, response: httpx.Response) -> Mock:
    """Return a Mock for httpx.post that sets *event* when called."""
    mock = Mock()

    def side_effect(*args, **kwargs):
        result = response
        mock.call_args_list.append(mock.call(*args, **kwargs))
        event.set()
        return result

    mock.side_effect = side_effect
    return mock


@pytest.mark.django_db
class TestTelemetryProxy:
    def test_browser_traces_does_not_block_on_collector(self, client, monkeypatch):
        """Response arrives before the slow collector round-trip completes.

        The collector mock sleeps for 2s. The view must return well under 1s —
        a threshold that safely absorbs Django/OTel request overhead (~200ms)
        while still proving the view did not wait for the collector.
        """
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")
        collector_called = threading.Event()

        def slow_post(*args, **kwargs):
            time.sleep(2.0)
            collector_called.set()
            return httpx.Response(202, content=b"", headers={})

        monkeypatch.setattr("api.telemetry_views.httpx.post", slow_post)
        t0 = time.monotonic()
        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-payload",
            content_type="application/x-protobuf",
        )
        elapsed = time.monotonic() - t0

        assert response.status_code == 202
        assert elapsed < 1.0, f"view blocked for {elapsed:.3f}s waiting for collector"
        assert collector_called.wait(timeout=5.0), "collector was never called"

    def test_browser_traces_proxies_raw_otlp_payload(self, client, monkeypatch):
        from api.telemetry_views import _collector_traces_endpoint

        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")

        called = threading.Event()
        post_mock = Mock(return_value=httpx.Response(202, content=b"", headers={}))

        def side_effect(*args, **kwargs):
            result = post_mock.return_value
            called.set()
            return result

        post_mock.side_effect = side_effect
        monkeypatch.setattr("api.telemetry_views.httpx.post", post_mock)

        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-bytes",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 202
        assert called.wait(timeout=2.0), "httpx.post was never called"
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

        called = threading.Event()
        post_mock = Mock(return_value=httpx.Response(202, content=b"", headers={}))

        def side_effect(*args, **kwargs):
            result = post_mock.return_value
            called.set()
            return result

        post_mock.side_effect = side_effect
        monkeypatch.setattr("api.telemetry_views.httpx.post", post_mock)

        user = User.objects.create_user(username="tester", password="pass")
        client.force_login(user)

        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-bytes",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 202
        assert called.wait(timeout=2.0), "httpx.post was never called"
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

        called = threading.Event()

        def post_side_effect(*args, **kwargs):
            called.set()
            return httpx.Response(202, content=b"", headers={"content-type": "application/json"})

        monkeypatch.setattr("api.telemetry_views.httpx.post", post_side_effect)
        response = client.post(
            "/api/telemetry/traces/",
            data=b"{}",
            content_type="application/json",
        )
        assert response.status_code == 202
        assert called.wait(timeout=2.0), "httpx.post was never called"

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

        called = threading.Event()

        def post_side_effect(*args, **kwargs):
            called.set()
            return httpx.Response(202, content=b"", headers={"content-type": "application/json"})

        monkeypatch.setattr("api.telemetry_views.httpx.post", post_side_effect)

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
        assert first.status_code == 202
        assert second.status_code == 429
        assert called.wait(timeout=2.0), "httpx.post was never called"
