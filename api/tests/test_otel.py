import asyncio
import os
import tempfile

from opentelemetry import trace
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.sdk.resources import SERVICE_VERSION, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind


def test_open_telemetry_middleware_creates_request_span_from_traceparent():
    exporter = InMemorySpanExporter()
    provider = TracerProvider(
        resource=Resource.create({"service.name": "glaze-test"}),
    )
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    current_span_ids: list[int] = []

    async def app(scope, receive, send):
        current_span = trace.get_current_span()
        current_span_ids.append(current_span.get_span_context().span_id)
        assert current_span.get_span_context().is_valid

        await send(
            {
                "type": "http.response.start",
                "status": 204,
                "headers": [],
            }
        )
        await send(
            {
                "type": "http.response.body",
                "body": b"",
                "more_body": False,
            }
        )

    wrapped = OpenTelemetryMiddleware(
        app,
        tracer_provider=provider,
        exclude_spans=["receive", "send"],
    )
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/pieces/123",
        "raw_path": b"/pieces/123",
        "scheme": "https",
        "server": ("example.com", 443),
        "headers": [
            (
                b"traceparent",
                b"00-11111111111111111111111111111111-2222222222222222-01",
            )
        ],
    }
    sent_messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent_messages.append(message)

    asyncio.run(wrapped(scope, receive, send))

    spans = exporter.get_finished_spans()
    assert len(spans) == 1

    request_span = spans[0]
    assert request_span.name == "GET /pieces/123"
    assert request_span.kind == SpanKind.SERVER
    assert request_span.parent.span_id == int("2222222222222222", 16)
    assert current_span_ids == [request_span.context.span_id]
    assert request_span.attributes["http.method"] == "GET"
    assert request_span.attributes["http.status_code"] == 204
    assert sent_messages[0]["status"] == 204


def _make_otel_mocks(monkeypatch, version_file_data):
    """Patch configure_otel's lazy imports to avoid real gRPC/Django/psycopg2 setup."""
    import sys
    import types
    import unittest.mock as mock

    # Stub the OTLP gRPC exporter module so it doesn't need grpcio at import time.
    fake_exporter_mod = types.ModuleType(
        "opentelemetry.exporter.otlp.proto.grpc.trace_exporter"
    )
    fake_exporter_mod.OTLPSpanExporter = mock.MagicMock()
    monkeypatch.setitem(
        sys.modules,
        "opentelemetry.exporter.otlp.proto.grpc.trace_exporter",
        fake_exporter_mod,
    )

    # Stub DjangoInstrumentor and Psycopg2Instrumentor.
    django_instr_mod = types.ModuleType("opentelemetry.instrumentation.django")
    django_instr_mod.DjangoInstrumentor = mock.MagicMock()
    monkeypatch.setitem(
        sys.modules, "opentelemetry.instrumentation.django", django_instr_mod
    )
    psycopg2_instr_mod = types.ModuleType("opentelemetry.instrumentation.psycopg2")
    psycopg2_instr_mod.Psycopg2Instrumentor = mock.MagicMock()
    monkeypatch.setitem(
        sys.modules, "opentelemetry.instrumentation.psycopg2", psycopg2_instr_mod
    )

    # Stub the async-patch imports.
    asgiref_mod = types.ModuleType("asgiref.sync")
    asgiref_mod.markcoroutinefunction = mock.MagicMock()
    monkeypatch.setitem(sys.modules, "asgiref.sync", asgiref_mod)
    otel_mw_mod = types.ModuleType(
        "opentelemetry.instrumentation.django.middleware.otel_middleware"
    )
    otel_mw_mod._DjangoMiddleware = type("_DjangoMiddleware", (), {})
    monkeypatch.setitem(
        sys.modules,
        "opentelemetry.instrumentation.django.middleware.otel_middleware",
        otel_mw_mod,
    )

    open_mock = mock.mock_open(read_data=version_file_data)
    if version_file_data is None:
        open_mock = mock.MagicMock(side_effect=FileNotFoundError)
    return mock.patch("builtins.open", open_mock)


def test_configure_otel_stamps_version_from_file(monkeypatch):
    import importlib

    import backend.otel as otel_mod

    monkeypatch.setenv("OTEL_ENABLED", "1")
    open_patch = _make_otel_mocks(monkeypatch, "abc1234\n")

    captured = []

    import unittest.mock as mock

    original_TracerProvider = __import__(
        "opentelemetry.sdk.trace", fromlist=["TracerProvider"]
    ).TracerProvider

    class CapturingTracerProvider(original_TracerProvider):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            captured.append(self)

    with (
        open_patch,
        mock.patch("opentelemetry.sdk.trace.TracerProvider", CapturingTracerProvider),
    ):
        importlib.reload(otel_mod)
        result = otel_mod.configure_otel()

    assert result is True
    assert len(captured) == 1
    assert captured[0].resource.attributes[SERVICE_VERSION] == "abc1234"


def test_configure_otel_uses_dev_version_when_file_missing(monkeypatch):
    import importlib

    import backend.otel as otel_mod

    monkeypatch.setenv("OTEL_ENABLED", "1")
    open_patch = _make_otel_mocks(monkeypatch, None)

    captured = []

    import unittest.mock as mock

    original_TracerProvider = __import__(
        "opentelemetry.sdk.trace", fromlist=["TracerProvider"]
    ).TracerProvider

    class CapturingTracerProvider(original_TracerProvider):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            captured.append(self)

    with (
        open_patch,
        mock.patch("opentelemetry.sdk.trace.TracerProvider", CapturingTracerProvider),
    ):
        importlib.reload(otel_mod)
        result = otel_mod.configure_otel()

    assert result is True
    assert len(captured) == 1
    assert captured[0].resource.attributes[SERVICE_VERSION] == "dev"
