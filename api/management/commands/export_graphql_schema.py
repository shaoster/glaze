"""Print the GraphQL SDL for the Glaze schema.

Used by the frontend codegen pipeline (web/BUILD.bazel) to generate typed
operations. Writing to stdout keeps it composable with Bazel genrules.
"""

from django.core.management.base import BaseCommand

from api.graphql.schema import schema


class Command(BaseCommand):
    help = "Print the GraphQL schema as SDL to stdout."

    def handle(self, *args, **options):
        self.stdout.write(schema.as_str())
