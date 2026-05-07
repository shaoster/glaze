import time

from django.core.management.base import BaseCommand

from api.models import Image, Piece, PieceStateImage
from api.utils import fetch_cloudinary_auto_crop


class Command(BaseCommand):
    help = "Backpopulate Cloudinary auto crops for existing piece images."

    def add_arguments(self, parser):
        parser.add_argument(
            "--delay-ms",
            type=int,
            default=100,
            help="Delay between Cloudinary delivery requests.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch crops and report counts without writing changes.",
        )

    def handle(self, *args, **options):
        delay_seconds = max(options["delay_ms"], 0) / 1000
        dry_run = options["dry_run"]
        images = (
            Image.objects.filter(
                cloud_name__isnull=False,
                cloudinary_public_id__isnull=False,
            )
            .exclude(cloud_name="")
            .exclude(cloudinary_public_id="")
            .order_by("cloud_name", "cloudinary_public_id")
        )

        fetched = 0
        updated_links = 0
        updated_pieces = 0
        skipped = 0

        for image in images.iterator():
            if not image.cloud_name or not image.cloudinary_public_id:
                skipped += 1
                continue
            try:
                crop = fetch_cloudinary_auto_crop(
                    image.cloud_name, image.cloudinary_public_id
                )
            except Exception as exc:  # noqa: BLE001
                skipped += 1
                self.stderr.write(
                    f"Skipping {image.cloud_name}/{image.cloudinary_public_id}: {exc}"
                )
                continue

            if crop is None:
                skipped += 1
                continue

            fetched += 1
            link_qs = PieceStateImage.objects.filter(image=image, crop__isnull=True)
            piece_qs = Piece.objects.filter(
                thumbnail=image, thumbnail_crop__isnull=True
            )
            link_count = link_qs.count()
            piece_count = piece_qs.count()
            if not dry_run:
                updated_links += link_qs.update(crop=crop)
                updated_pieces += piece_qs.update(thumbnail_crop=crop)
            else:
                updated_links += link_count
                updated_pieces += piece_count

            if delay_seconds:
                time.sleep(delay_seconds)

        mode = "Would update" if dry_run else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} {updated_links} piece-state images and "
                f"{updated_pieces} thumbnails from {fetched} crops; skipped {skipped}."
            )
        )
