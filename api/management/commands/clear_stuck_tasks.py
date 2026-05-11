import logging

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from api.models import AsyncTask

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Clear any background tasks permanently stuck in RUNNING or PENDING state."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be done without modifying the database.",
        )
        parser.add_argument(
            "--hours",
            type=int,
            default=1,
            help="Threshold in hours. Tasks older than this will be failed.",
        )

    def handle(self, *args, **options):
        from api.tasks import fail_stuck_tasks

        dry_run = options["dry_run"]
        hours = options["hours"]

        if dry_run:
            from datetime import timedelta

            from django.utils import timezone

            from api.models import AsyncTask

            threshold = timezone.now() - timedelta(hours=hours)
            stuck_tasks = AsyncTask.objects.filter(
                status__in=[AsyncTask.Status.RUNNING, AsyncTask.Status.PENDING],
                last_modified__lt=threshold,
            )
            count = stuck_tasks.count()
            if count == 0:
                self.stdout.write(self.style.SUCCESS("No stuck tasks found."))
            else:
                self.stdout.write(
                    f"Would mark {count} tasks as FAILED (older than {hours} hour(s))."
                )
                for task in stuck_tasks:
                    self.stdout.write(
                        f"  - Task {task.id} (type: {task.task_type}, status: {task.status})"
                    )
            return

        count = fail_stuck_tasks(hours=hours)
        if count == 0:
            self.stdout.write(self.style.SUCCESS("No stuck tasks found."))
        else:
            self.stdout.write(
                self.style.SUCCESS(f"Successfully marked {count} stuck tasks as FAILED.")
            )
