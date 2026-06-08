import threading
import time
from unittest.mock import Mock

import httpx
import pytest
from django.contrib.auth.models import User
from django.core.cache import cache
from django.test.utils import override_settings


@pytest.mark.django_db
class TestTelemetryProxy:
    def test_browser_traces_does_not_block_on_collector(self, client, monkeypatch):
        """Response arrives before the collector httpx.post call completes.

        The mock blocks on permit_return until the test explicitly releases it.
        In the blocking (pre-fix) code path the view calls httpx.post()
        synchronously, so client.post() cannot return until the mock does — but
        the mock waits for permit_return which is only set after client.post()
        returns, so the mock times out after 30s and elapsed >> 5s.
        With fire-and-forget (correct behavior) the view submits to the
        executor and returns immediately; we then set permit_return so the
        background thread can complete without delay.
        """
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")
        permit_return = threading.Event()
        collector_called = threading.Event()

        def gated_post(*args, **kwargs):
            collector_called.set()
            permit_return.wait(timeout=30.0)
            return httpx.Response(200, content=b"", headers={})

        monkeypatch.setattr("api.telemetry_views.httpx.post", gated_post)
        t0 = time.monotonic()
        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-payload",
            content_type="application/x-protobuf",
        )
        elapsed = time.monotonic() - t0
        permit_return.set()  # release the background thread immediately

        assert response.status_code == 200
        assert elapsed < 5.0, (
            f"view blocked for {elapsed:.3f}s — should return before collector"
        )
        assert collector_called.wait(timeout=5.0), "collector was never called"

    def test_browser_traces_proxies_raw_otlp_payload(self, client, monkeypatch):
        from api.telemetry_views import _collector_traces_endpoint

        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")

        called = threading.Event()
        post_mock = Mock(return_value=httpx.Response(200, content=b"", headers={}))

        def side_effect(*args, **kwargs):
            called.set()
            return post_mock.return_value

        post_mock.side_effect = side_effect
        monkeypatch.setattr("api.telemetry_views.httpx.post", post_mock)

        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-bytes",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 200
        assert called.wait(timeout=5.0), "httpx.post was never called"
        post_mock.assert_called_once_with(
            "http://otelcol:4318/v1/traces",
            content=b"trace-bytes",
            headers={"content-type": "application/x-protobuf"},
            timeout=5.0,
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
        post_mock = Mock(return_value=httpx.Response(200, content=b"", headers={}))

        def side_effect(*args, **kwargs):
            called.set()
            return post_mock.return_value

        post_mock.side_effect = side_effect
        monkeypatch.setattr("api.telemetry_views.httpx.post", post_mock)

        user = User.objects.create_user(username="tester", password="pass")
        client.force_login(user)

        response = client.post(
            "/api/telemetry/traces/",
            data=b"trace-bytes",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 200
        assert called.wait(timeout=5.0), "httpx.post was never called"
        post_mock.assert_called_once_with(
            "http://otelcol:4318/v1/traces",
            content=b"trace-bytes",
            headers={"content-type": "application/x-protobuf"},
            timeout=5.0,
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
            return httpx.Response(
                200, content=b"", headers={"content-type": "application/json"}
            )

        monkeypatch.setattr("api.telemetry_views.httpx.post", post_side_effect)
        response = client.post(
            "/api/telemetry/traces/",
            data=b"{}",
            content_type="application/json",
        )
        assert response.status_code == 200
        assert called.wait(timeout=5.0), "httpx.post was never called"

    def test_collector_error_response_is_logged(self, client, monkeypatch):
        import logging as _logging

        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")
        # LOGGING["loggers"]["api"]["propagate"] = False, so caplog (root logger)
        # never sees records from api.telemetry_views. Attach a handler directly.
        logged = threading.Event()

        class _Capture(_logging.Handler):
            def emit(self, record):
                if "503" in record.getMessage():
                    logged.set()

        tv_logger = _logging.getLogger("api.telemetry_views")
        handler = _Capture()
        tv_logger.addHandler(handler)
        try:
            monkeypatch.setattr(
                "api.telemetry_views.httpx.post",
                lambda *a, **kw: httpx.Response(503, content=b"", headers={}),
            )
            response = client.post(
                "/api/telemetry/traces/",
                data=b"trace-payload",
                content_type="application/x-protobuf",
            )
            assert logged.wait(timeout=5.0), "warning for 503 was never logged"
        finally:
            tv_logger.removeHandler(handler)

        assert response.status_code == 200

    def test_collector_connection_error_is_logged(self, client, monkeypatch):
        import logging as _logging

        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")
        logged = threading.Event()

        class _Capture(_logging.Handler):
            def emit(self, record):
                if "refused" in record.getMessage():
                    logged.set()

        tv_logger = _logging.getLogger("api.telemetry_views")
        handler = _Capture()
        tv_logger.addHandler(handler)
        try:
            monkeypatch.setattr(
                "api.telemetry_views.httpx.post",
                lambda *a, **kw: (_ for _ in ()).throw(httpx.ConnectError("refused")),
            )
            response = client.post(
                "/api/telemetry/traces/",
                data=b"trace-payload",
                content_type="application/x-protobuf",
            )
            assert logged.wait(timeout=5.0), (
                "warning for connection error was never logged"
            )
        finally:
            tv_logger.removeHandler(handler)

        assert response.status_code == 200

    def test_saturated_queue_still_returns_200(self, client, monkeypatch):
        """When the semaphore is exhausted the view drops the upload but still returns 200."""
        from api.telemetry_views import _forward_semaphore

        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")
        # Drain all semaphore permits so the next request finds none available.
        acquired = 0
        while _forward_semaphore.acquire(blocking=False):
            acquired += 1

        try:
            response = client.post(
                "/api/telemetry/traces/",
                data=b"trace-payload",
                content_type="application/x-protobuf",
            )
            assert response.status_code == 200
        finally:
            for _ in range(acquired):
                _forward_semaphore.release()

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
            return httpx.Response(
                200, content=b"", headers={"content-type": "application/json"}
            )

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
        assert first.status_code == 200
        assert second.status_code == 429
        assert called.wait(timeout=5.0), "httpx.post was never called"
