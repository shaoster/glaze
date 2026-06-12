import functools
import logging
import os


class _TracedHandle:
    """Supports @traced("name") as decorator and `with traced("name"):` as context manager."""

    def __init__(self, name: str) -> None:
        self._name = name

    def __call__(self, fn):  # type: ignore[override]
        name = self._name

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            from opentelemetry import trace as _trace

            with _trace.get_tracer(__name__).start_as_current_span(name):
                return fn(*args, **kwargs)

        return wrapper

    def __enter__(self):
        from opentelemetry import trace as _trace

        self._span_ctx = _trace.get_tracer(__name__).start_as_current_span(self._name)
        self._span_ctx.__enter__()
        return self

    def __exit__(self, *args):
        return self._span_ctx.__exit__(*args)


def traced(name_or_fn=None):
    """Decorator and context manager for creating OTel child spans.

    Usage::

        @traced                    # span name = function qualname
        def my_fn(): ...

        @traced("custom.name")     # explicit span name
        def my_fn(): ...

        with traced("my_op"):      # context manager
            ...

    No-op when no OTel provider is configured (uses the SDK's no-op tracer).
    """
    if callable(name_or_fn):
        return _TracedHandle(name_or_fn.__qualname__)(name_or_fn)
    if name_or_fn is None:
        return lambda fn: traced(fn)
    return _TracedHandle(name_or_fn)


def traced_class(cls):
    """Wrap all public methods of a class with traced(), using ClassName.method as span name.

    Skips dunder methods, properties, and inner class definitions. Works on abstract
    base classes — subclasses inherit the wrapped methods.
    """
    for attr_name, attr_val in list(vars(cls).items()):
        if attr_name.startswith("_") or attr_name == "resolve_custom_field":
            continue
        if isinstance(attr_val, (property, type)):
            continue
        if isinstance(attr_val, staticmethod):
            inner = attr_val.__func__
            wrapped = traced(f"{cls.__name__}.{attr_name}")(inner)
            setattr(cls, attr_name, staticmethod(wrapped))
        elif isinstance(attr_val, classmethod):
            inner = attr_val.__func__
            wrapped = traced(f"{cls.__name__}.{attr_name}")(inner)
            setattr(cls, attr_name, classmethod(wrapped))
        elif callable(attr_val):
            setattr(cls, attr_name, traced(f"{cls.__name__}.{attr_name}")(attr_val))
    return cls


def configure_otel() -> bool:
    if not os.environ.get("OTEL_ENABLED"):
        return False

    # The OTel gRPC exporter bundles _pb2.py files generated for protobuf<7.
    # protobuf>=4 rejects old generated descriptors unless the pure-Python
    # runtime is used. Set this before importing any opentelemetry.proto module.
    os.environ.setdefault("PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION", "python")

    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.django import DjangoInstrumentor
    from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
    from opentelemetry.sdk.resources import SERVICE_NAME, SERVICE_VERSION, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.sdk.trace.sampling import TraceIdRatioBased

    try:
        service_version = open("/app/version.txt").read().strip()
    except FileNotFoundError:
        service_version = "dev"

    resource = Resource.create(
        {
            SERVICE_NAME: os.environ.get("OTEL_SERVICE_NAME", "glaze"),
            SERVICE_VERSION: service_version,
        }
    )
    sample_rate = float(os.environ.get("OTEL_SAMPLE_RATE", "1.0"))
    provider = TracerProvider(sampler=TraceIdRatioBased(sample_rate), resource=resource)
    exporter = OTLPSpanExporter(
        endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
        insecure=True,
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    from opentelemetry import metrics
    from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import (
        OTLPMetricExporter,
    )
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
    from opentelemetry.sdk.metrics.view import View

    metric_exporter = OTLPMetricExporter(
        endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
        insecure=True,
    )
    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[
            PeriodicExportingMetricReader(
                metric_exporter, export_interval_millis=30_000
            )
        ],
        views=[
            # Keep only http.status_code on the duration histogram; all other
            # dimensions (route, method, scheme, host, port) are unused by the
            # dashboard and inflate Grafana Cloud series quota.
            View(
                instrument_name="http.server.duration",
                attribute_keys={"http.status_code"},
            ),
            # Active-requests gauge is only queried as a scalar sum — no per-label breakdown needed.
            View(instrument_name="http.server.active_requests", attribute_keys=set()),
        ],
    )
    metrics.set_meter_provider(meter_provider)

    from opentelemetry import _logs as otel_logs
    from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
    from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

    log_exporter = OTLPLogExporter(
        endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
        insecure=True,
    )
    log_provider = LoggerProvider(resource=resource)
    log_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))
    otel_logs.set_logger_provider(log_provider)
    otel_handler = LoggingHandler(level=logging.INFO, logger_provider=log_provider)
    # Attach to root and to every logger that opts out of propagation in settings.LOGGING,
    # because non-propagating loggers never reach the root handler.
    for name in ("", "api", "django", "django.request"):
        logging.getLogger(name).addHandler(otel_handler)

    DjangoInstrumentor().instrument()
    PsycopgInstrumentor().instrument()

    from opentelemetry.instrumentation.redis import RedisInstrumentor

    RedisInstrumentor().instrument()

    # opentelemetry-instrumentation-django 0.62b1's _DjangoMiddleware has no
    # __acall__, so under ASGI/uvicorn it runs in a thread executor and loses
    # the OTel context — Django HTTP spans never appear. Patch it async-capable.
    from asgiref.sync import markcoroutinefunction
    from opentelemetry.instrumentation.django.middleware.otel_middleware import (
        _DjangoMiddleware,
    )

    async def __acall__(self, request):
        self.process_request(request)
        response = await self.get_response(request)
        return self.process_response(request, response)

    _DjangoMiddleware.__acall__ = __acall__
    markcoroutinefunction(_DjangoMiddleware)
    return True
