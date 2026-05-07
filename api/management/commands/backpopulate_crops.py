from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Deprecated no-op: Cloudinary g_auto crops are context-specific."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Accepted for compatibility; this command no longer writes crops.",
        )

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.WARNING(
                "backpopulate_crops is disabled. Cloudinary g_auto_info returns a "
                "crop for a specific requested transformation, not a reusable "
                "subject bounding box. Existing null crops will continue to use "
                "per-context Cloudinary auto gravity at render time."
            )
        )
