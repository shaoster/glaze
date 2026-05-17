"""
ASGI config for backend project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

from backend.otel import configure_otel
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware

application = get_asgi_application()  # noqa: E402
if configure_otel():
    application = OpenTelemetryMiddleware(application)
