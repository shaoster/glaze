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
)
from rest_framework.permissions import AllowAny
from rest_framework.request import Request

from backend.otel import traced


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
    responses={200: None, 202: None, 400: None, 502: None},
    description=(
        "Proxy browser OTLP/HTTP trace uploads to the local collector. "
        "The browser sends the request with the normal session/CSRF flow; "
        "the backend forwards the raw OTLP payload to the collector."
    ),
)
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@traced("telemetry.browser_traces")
def browser_traces(request: Request) -> HttpResponse:
    """Forward a browser OTLP/HTTP trace payload to the collector."""
    body = request.body
    if not body:
        return HttpResponse(status=400)

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
