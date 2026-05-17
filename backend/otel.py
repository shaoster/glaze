import os


def configure_otel() -> None:
    if not os.environ.get("OTEL_ENABLED"):
        return

    # The OTel gRPC exporter bundles _pb2.py files generated for protobuf<7.
    # protobuf>=4 rejects old generated descriptors unless the pure-Python
    # runtime is used. Set this before importing any opentelemetry.proto module.
    os.environ.setdefault("PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION", "python")

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.django import DjangoInstrumentor
    from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.trace.sampling import TraceIdRatioBased

    sample_rate = float(os.environ.get("OTEL_SAMPLE_RATE", "1.0"))
    provider = TracerProvider(sampler=TraceIdRatioBased(sample_rate))
    exporter = OTLPSpanExporter(
        endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
        insecure=True,
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    DjangoInstrumentor().instrument()
    Psycopg2Instrumentor().instrument()

    # opentelemetry-instrumentation-django 0.62b1's _DjangoMiddleware has no
    # __acall__, so under ASGI/uvicorn it runs in a thread executor and loses
    # the OTel context — Django HTTP spans never appear. Patch it async-capable.
    from asgiref.sync import markcoroutinefunction
    from opentelemetry.instrumentation.django.middleware.otel_middleware import _DjangoMiddleware

    async def __acall__(self, request):
        self.process_request(request)
        response = await self.get_response(request)
        return self.process_response(request, response)

    _DjangoMiddleware.__acall__ = __acall__
    markcoroutinefunction(_DjangoMiddleware)
