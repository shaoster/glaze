"""Frontend telemetry proxy endpoints."""

from __future__ import annotations

import os
from urllib.parse import urlparse, urlunparse

import httpx
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle

from backend.otel import traced

_MAX_TRACE_BODY_BYTES = 512 * 1024  # 512 KB

_ALLOWED_CONTENT_TYPES = frozenset(
    [
        "application/x-protobuf",
        "application/json",
        "application/x-ndjson",
    ]
)


class BrowserTracesThrottle(SimpleRateThrottle):
    """Per-IP throttle for the browser telemetry proxy, applied to all callers.

    Uses ``SimpleRateThrottle`` (not ``AnonRateThrottle``) so the limit is
    enforced even when an authenticated session cookie is present.  The key is
    always the client IP resolved via NUM_PROXIES-aware ``get_ident()``.

    Rate comes from ``REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]["browser_traces"]``.
    Requires a shared cache (``REDIS_CACHE_URL`` in production); the counter is
    not persisted with ``DummyCache``.
    """

    scope = "browser_traces"

    def get_cache_key(self, request, view):
        ident = self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


def _collector_traces_endpoint() -> str:
    """Return the collector URL that accepts browser OTLP/HTTP trace uploads."""
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    parsed = urlparse(endpoint)
    host = parsed.hostname or "localhost"
    port = parsed.port or 4317
    http_port = 4318 if port == 4317 else port
    path = parsed.path.rstrip("/")
    if path:
        path = f"{path}/v1/traces"
    else:
        path = "/v1/traces"
    return urlunparse(
        parsed._replace(
            netloc=f"{host}:{http_port}",
            path=path,
            params="",
            query="",
            fragment="",
        )
    )


@extend_schema(
    request=None,
    responses={200: None, 202: None, 400: None, 411: None, 413: None, 415: None, 502: None},
    description=(
        "Proxy browser OTLP/HTTP trace uploads to the local collector. "
        "The browser sends the request with the normal session/CSRF flow; "
        "the backend forwards the raw OTLP payload to the collector. "
        "Requests without Content-Length are rejected (411). "
        "Payloads larger than 512 KB are rejected (413). "
        "Only application/x-protobuf, application/json, and application/x-ndjson "
        "content types are accepted (415)."
    ),
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([BrowserTracesThrottle])
@traced("telemetry.browser_traces")
def browser_traces(request: Request) -> HttpResponse:
    """Forward a browser OTLP/HTTP trace payload to the collector."""
    content_type = (request.headers.get("content-type") or "").split(";")[0].strip()
    if content_type not in _ALLOWED_CONTENT_TYPES:
        return HttpResponse(status=415)

    # Require Content-Length so we can enforce the cap before reading the body.
    # Chunked or unknown-length uploads are rejected here (411 Length Required).
    content_length_raw = request.headers.get("content-length")
    if content_length_raw is None:
        return HttpResponse(status=411)
    try:
        content_length = int(content_length_raw)
    except ValueError:
        return HttpResponse(status=400)
    if content_length > _MAX_TRACE_BODY_BYTES:
        return HttpResponse(status=413)

    body = request.body
    if not body:
        return HttpResponse(status=400)

    # Belt-and-suspenders: also cap the actual buffered length in case the
    # Content-Length header was understated.
    if len(body) > _MAX_TRACE_BODY_BYTES:
        return HttpResponse(status=413)

    collector_endpoint = _collector_traces_endpoint()
    forward_headers = {}
    for header_name in ("content-type", "content-encoding"):
        header_value = request.headers.get(header_name)
        if header_value:
            forward_headers[header_name] = header_value

    try:
        response = httpx.post(
            collector_endpoint,
            content=body,
            headers=forward_headers,
            timeout=10.0,
        )
    except httpx.RequestError:
        return HttpResponse(status=502)

    proxied = HttpResponse(
        response.content,
        status=response.status_code,
        content_type=response.headers.get("content-type", "application/json"),
    )
    for header_name in ("content-encoding", "cache-control"):
        header_value = response.headers.get(header_name)
        if header_value:
            proxied[header_name] = header_value
    return proxied
