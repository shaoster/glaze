import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.django import DjangoInstrumentor
from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import TraceIdRatioBased


def configure_otel() -> None:
    if not os.environ.get("OTEL_ENABLED"):
        return
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
