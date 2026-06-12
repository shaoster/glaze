"""Backfill width/height on Image rows that are missing dimensions."""

import io
import time

import requests
from django.core.management.base import BaseCommand
from django.db.models import Q
from PIL import Image as PILImage

from api import r2
from api.models import Image


class Command(BaseCommand):
    help = (
        "Download each Image missing dimensions and record its width/height "
        "from the decoded pixels."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be updated without writing to the database.",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=50,
            help="Number of images to fetch before sleeping 1 second (rate-limit friendly).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        batch_size = options["batch_size"]

        # Restrict to R2-backed images and transitional Cloudinary-hosted images.
        # A broad url__startswith="http" filter would let user-attached arbitrary
        # URLs trigger SSRF fetches from the server when an operator runs this command.
        qs = (
            Image.objects.filter(width__isnull=True)
            .exclude(url="")
            .filter(
                Q(r2_key__isnull=False) | Q(url__icontains="res.cloudinary.com")
            )
            .only("id", "url", "r2_key")
        )

        total = qs.count()
        self.stdout.write(f"Found {total} image(s) missing dimensions.")

        updated = 0
        failed = 0

        for i, image in enumerate(qs.iterator(), start=1):
            try:
                if image.r2_key and r2.is_r2_configured():
                    data = r2.get_object_bytes(image.r2_key)
                else:
                    response = requests.get(image.url, timeout=30)
                    response.raise_for_status()
                    data = response.content
                with PILImage.open(io.BytesIO(data)) as pil_image:
                    w, h = pil_image.size
                if w and h:
                    if not dry_run:
                        Image.objects.filter(pk=image.pk).update(width=w, height=h)
                    self.stdout.write(f"  [{i}/{total}] {image.url} → {w}×{h}")
                    updated += 1
                else:
                    self.stdout.write(f"  [{i}/{total}] {image.url} — no dimensions")
                    failed += 1
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(f"  [{i}/{total}] {image.url} — error: {exc}")
                failed += 1

            if i % batch_size == 0:
                time.sleep(1)

        prefix = "Would update" if dry_run else "Updated"
        self.stdout.write(f"{prefix} {updated} image(s). Failed/skipped: {failed}.")
