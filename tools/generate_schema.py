"""Generates openapi.json via drf-spectacular for the Bazel openapi_schema genrule.

Usage:
    python generate_schema.py <output_path>

Django setup requirements:
    - DJANGO_SETTINGS_MODULE must resolve (defaults to backend.settings).
    - No real database is needed: spectacular generates the schema entirely
      from code introspection (models, serializers, views).
"""

import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
# Spectacular only introspects code; a temporary SQLite file satisfies
# Django's startup checks without requiring a real database.
os.environ.setdefault("DATABASE_URL", "sqlite:///schema_gen_tmp.db")

import django  # noqa: E402

django.setup()

from django.core.management import call_command  # noqa: E402

output_path = sys.argv[1]
call_command("spectacular", "--format", "openapi-json", "--file", output_path)
print(f"openapi schema written to {output_path}", file=sys.stderr)
