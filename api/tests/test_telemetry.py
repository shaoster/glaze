from unittest.mock import Mock

import httpx
import pytest


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

    def test_browser_traces_rejects_empty_payloads(self, client, monkeypatch):
        monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otelcol:4317")

        response = client.post(
            "/api/telemetry/traces/",
            data=b"",
            content_type="application/x-protobuf",
        )

        assert response.status_code == 400
