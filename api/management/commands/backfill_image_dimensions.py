"""Backfill width/height on Image rows that have a Cloudinary identity but no dimensions."""

import os
import time

import cloudinary
import cloudinary.api
from django.core.management.base import BaseCommand

from api.models import Image


class Command(BaseCommand):
    help = (
        "Fetch width/height from Cloudinary for Image rows that are missing dimensions."
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

        cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
        api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip()
        api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip()

        if not cloud_name or not api_key or not api_secret:
            self.stderr.write(
                "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required."
            )
            return

        cloudinary.config(
            cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True
        )

        qs = Image.objects.filter(
            cloudinary_public_id__isnull=False,
            cloud_name=cloud_name,
            width__isnull=True,
        ).only("id", "cloudinary_public_id")

        total = qs.count()
        self.stdout.write(f"Found {total} image(s) missing dimensions.")

        updated = 0
        failed = 0

        for i, image in enumerate(qs.iterator(), start=1):
            try:
                result = cloudinary.api.resource(image.cloudinary_public_id)
                w = result.get("width")
                h = result.get("height")
                if w and h:
                    if not dry_run:
                        Image.objects.filter(pk=image.pk).update(width=w, height=h)
                    self.stdout.write(
                        f"  [{i}/{total}] {image.cloudinary_public_id} → {w}×{h}"
                    )
                    updated += 1
                else:
                    self.stdout.write(
                        f"  [{i}/{total}] {image.cloudinary_public_id} — no dimensions in response"
                    )
                    failed += 1
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(
                    f"  [{i}/{total}] {image.cloudinary_public_id} — error: {exc}"
                )
                failed += 1

            if i % batch_size == 0:
                time.sleep(1)

        prefix = "Would update" if dry_run else "Updated"
        self.stdout.write(f"{prefix} {updated} image(s). Failed/skipped: {failed}.")
