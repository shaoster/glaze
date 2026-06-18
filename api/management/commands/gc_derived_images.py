"""Delete orphaned derived Image rows and their R2 objects."""

from django.core.management.base import BaseCommand
from django.db.models import Q

from api import r2
from api.models import Image


class Command(BaseCommand):
    help = (
        "Identify derived Image rows that are no longer referenced by any piece "
        "and delete them along with their R2 objects."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be deleted without making any changes.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Maximum number of orphaned images to delete in one run.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options["limit"]

        # An Image is referenced if any of these FKs point to it.
        referenced = (
            Q(piece_state_links__isnull=False)
            | Q(crop_links__isnull=False)
            | Q(thumbnail_for_pieces__isnull=False)
        )

        qs = (
            Image.objects.filter(derived_from__isnull=False)
            .exclude(referenced)
            .distinct()
            .only("id", "r2_key")
        )
        if limit is not None:
            qs = qs[:limit]

        deleted = 0
        for image in qs.iterator():
            if dry_run:
                self.stdout.write(
                    f"Would delete image {image.id} (r2_key={image.r2_key})"
                )
                deleted += 1
                continue
            if image.r2_key:
                r2.delete_object(image.r2_key)
            image.delete()
            deleted += 1

        label = "Would delete" if dry_run else "Deleted"
        self.stdout.write(
            self.style.SUCCESS(f"{label} {deleted} orphaned derived image(s).")
        )
