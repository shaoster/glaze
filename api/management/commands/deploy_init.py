"""Management command: deploy_init

Runs all deploy-time initialization steps in a single Django process to avoid
paying the full Python/Django startup cost three times on every deploy.

Steps (in order):
  1. migrate           — apply any pending database migrations
  2. load_public_library --skip-if-missing  — import public fixture if changed
  3. clear_stuck_tasks --hours 1            — clean up stale async tasks
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run all deploy-time init steps in a single process."

    def handle(self, *args, **options):
        verbosity = options.get("verbosity", 1)

        self.stdout.write("=== deploy_init: migrate ===")
        call_command("migrate", "--no-input", verbosity=verbosity)

        self.stdout.write("=== deploy_init: load_public_library ===")
        call_command("load_public_library", skip_if_missing=True, verbosity=verbosity)

        self.stdout.write("=== deploy_init: clear_stuck_tasks ===")
        call_command("clear_stuck_tasks", hours=1, verbosity=verbosity)

        self.stdout.write(self.style.SUCCESS("deploy_init complete."))
