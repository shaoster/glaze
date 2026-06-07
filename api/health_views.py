from typing import Callable

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced


def _check_database() -> bool:
    from django.db import connections

    with connections["default"].cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return True


def _check_migrations() -> bool:
    import os

    from django.apps import apps
    from django.db import connections

    with connections["default"].cursor() as cursor:
        cursor.execute("SELECT app, name FROM django_migrations")
        applied = {(row[0], row[1]) for row in cursor.fetchall()}

    for app_config in apps.get_app_configs():
        migrations_dir = os.path.join(app_config.path, "migrations")
        if not os.path.isdir(migrations_dir):
            continue
        for fname in os.listdir(migrations_dir):
            if fname.endswith(".py") and not fname.startswith("_"):
                if (app_config.label, fname[:-3]) not in applied:
                    return False
    return True


def _check_async_tasks() -> bool:
    from .tasks import get_task_interface

    return get_task_interface().health_check()


# Names resolved at request time (not import time) so tests can monkeypatch
# `api.views._check_<name>` and the view will see the patched callable.
_READINESS_CHECKS: tuple[str, ...] = ("database", "migrations", "async_tasks")


@extend_schema(exclude=True)
@api_view(["GET"])
@permission_classes([AllowAny])
@traced
def health_ready(request: Request) -> Response:
    """Return readiness status for database, migrations, and async tasks."""
    checks: dict[str, bool] = {}
    for name in _READINESS_CHECKS:
        check: Callable[[], bool] = globals()[f"_check_{name}"]
        try:
            checks[name] = bool(check())
        except Exception:
            checks[name] = False
    ok = all(checks.values())
    return Response(
        {"status": "ready" if ok else "not_ready", "checks": checks},
        status=status.HTTP_200_OK if ok else status.HTTP_503_SERVICE_UNAVAILABLE,
    )
