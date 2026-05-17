import os

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import TraceIdRatioBased


def configure_otel() -> bool:
    if not os.environ.get("OTEL_ENABLED"):
        return False

    # The OTel gRPC exporter bundles _pb2.py files generated for protobuf<7.
    # protobuf>=4 rejects old generated descriptors unless the pure-Python
    # runtime is used. Set this before importing any opentelemetry.proto module.
    os.environ.setdefault("PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION", "python")

    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor

    sample_rate = float(os.environ.get("OTEL_SAMPLE_RATE", "1.0"))
    provider = TracerProvider(
        resource=Resource.create(
            {
                "service.name": os.environ.get("OTEL_SERVICE_NAME", "glaze"),
            }
        ),
        sampler=TraceIdRatioBased(sample_rate),
    )
    exporter = OTLPSpanExporter(
        endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
        insecure=True,
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    Psycopg2Instrumentor().instrument()
    return True
