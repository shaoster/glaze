from django.core.management.base import BaseCommand

from api.models import Piece, PieceStateImage


class Command(BaseCommand):
    help = "Clear auto-seeded Cloudinary crops that were generated using g_auto (face-biased)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report counts without writing changes.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        state_qs = PieceStateImage.objects.exclude(crop=None)
        thumb_qs = Piece.objects.exclude(thumbnail_crop=None)

        state_count = state_qs.count()
        thumb_count = thumb_qs.count()

        if not dry_run:
            state_qs.update(crop=None)
            thumb_qs.update(thumbnail_crop=None)

        mode = "Would clear" if dry_run else "Cleared"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} {state_count} state image crops and "
                f"{thumb_count} thumbnail crops."
            )
        )
