import asyncio

from opentelemetry import trace
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.sdk.resources import Resource
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
