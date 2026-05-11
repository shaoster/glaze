import requests
from django.core.management.base import BaseCommand

from api.models import Image, Piece, PieceStateImage
from api.utils import calculate_subject_crop


class Command(BaseCommand):
    help = "Backpopulate subject-detection crops using rembg for existing piece images."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Fetch crops and report counts without writing changes.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Overwrite existing crops (default skips images that already have a crop).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]
        images = (
            Image.objects.filter(
                cloud_name__isnull=False,
                cloudinary_public_id__isnull=False,
            )
            .exclude(cloud_name="")
            .exclude(cloudinary_public_id="")
            .order_by("cloud_name", "cloudinary_public_id")
        )

        processed = 0
        updated_links = 0
        updated_pieces = 0
        skipped = 0

        for image in images.iterator():
            if not image.cloud_name or not image.cloudinary_public_id:
                skipped += 1
                continue

            # Check if we actually need to do anything for this image
            link_qs = (
                PieceStateImage.objects.filter(image=image)
                if force
                else PieceStateImage.objects.filter(image=image, crop__isnull=True)
            )
            piece_qs = (
                Piece.objects.filter(thumbnail=image)
                if force
                else Piece.objects.filter(thumbnail=image, thumbnail_crop__isnull=True)
            )

            if not link_qs.exists() and not piece_qs.exists():
                skipped += 1
                continue

            try:
                response = requests.get(image.url, timeout=30)
                response.raise_for_status()
                crop = calculate_subject_crop(response.content)
            except Exception as exc:  # noqa: BLE001
                skipped += 1
                self.stderr.write(
                    f"Skipping {image.cloud_name}/{image.cloudinary_public_id}: {exc}"
                )
                continue

            if crop is None:
                skipped += 1
                continue

            processed += 1
            if not dry_run:
                updated_links += link_qs.update(crop=crop)
                updated_pieces += piece_qs.update(thumbnail_crop=crop)
            else:
                updated_links += link_qs.count()
                updated_pieces += piece_qs.count()

        mode = "Would update" if dry_run else "Updated"
        self.stdout.write(
            self.style.SUCCESS(
                f"{mode} {updated_links} piece-state images and "
                f"{updated_pieces} thumbnails from {processed} successful detections; skipped {skipped}."
            )
        )
