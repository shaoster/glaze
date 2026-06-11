"""Generates schema.graphql (SDL) for the Bazel graphql_schema genrule.

Usage:
    python export_graphql_schema.py <output_path>

Like generate_schema.py, this only introspects code, so a throwaway SQLite
file satisfies Django's startup checks without a real database.
"""

import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
os.environ.setdefault("DATABASE_URL", "sqlite:///schema_gen_tmp.db")

import django  # noqa: E402

django.setup()

from api.graphql.schema import schema  # noqa: E402

output_path = sys.argv[1]
with open(output_path, "w", encoding="utf-8") as fh:
    fh.write(schema.as_str())
    fh.write("\n")
print(f"graphql schema written to {output_path}", file=sys.stderr)
