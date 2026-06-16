"""Backfill existing JPEG images through the convert_image_to_jpeg pipeline.

Raw JPEG/MPO uploads made before PR #967 were stored in R2 with EXIF orientation
tags intact.  The conversion pipeline bakes the orientation into the pixel data so
the stored bytes always match the displayed image, eliminating EXIF-related crop
mismatches.

This command enqueues a convert_image_to_jpeg AsyncTask for each original JPEG Image
row (r2_key ending in .jpg or .jpeg, no derived_from).  The task creates a clean JPEG
derivative, redirects all PieceStateImage rows to it, and preserves the source object
in R2 for provenance.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from api.models import AsyncTask, Image
from api.tasks import get_task_interface


class Command(BaseCommand):
    help = (
        "Enqueue convert_image_to_jpeg tasks for existing JPEG images that were "
        "uploaded before EXIF normalization was enforced."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print a summary without enqueuing any tasks.",
        )
        parser.add_argument(
            "--user-id",
            type=int,
            help="Restrict to images owned by this user ID (default: all users).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        user_id = options.get("user_id")

        qs = (
            Image.objects.filter(
                Q(r2_key__endswith=".jpg") | Q(r2_key__endswith=".jpeg"),
                derived_from__isnull=True,
                user__isnull=False,
            )
            .exclude(derivatives__derived_type="jpeg_conversion")
            .select_related("user")
            .order_by("id")
        )

        if user_id is not None:
            qs = qs.filter(user_id=user_id)

        images = list(qs)
        total = len(images)

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Dry run: would enqueue {total} convert_image_to_jpeg task(s)."
                )
            )
            for img in images:
                self.stdout.write(f"  {img.id}  {img.r2_key}")
            return

        if total == 0:
            self.stdout.write("No qualifying images found.")
            return

        interface = get_task_interface()
        enqueued = 0
        failed = 0

        for img in images:
            try:
                task = AsyncTask.objects.create(
                    user=img.user,  # type: ignore[misc]  # queryset filtered user__isnull=False
                    task_type="convert_image_to_jpeg",
                    input_params={"key": img.r2_key, "image_id": str(img.id)},
                )
                interface.submit(task)
                enqueued += 1
                self.stdout.write(f"\rQueued {enqueued} / {total}...", ending="")
                self.stdout.flush()
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(f"\n  Failed for {img.id} ({img.r2_key}): {exc}")
                failed += 1

        self.stdout.write("")
        if failed:
            raise CommandError(
                f"Enqueued {enqueued} task(s); {failed} failed. "
                "Check stderr for details."
            )
        self.stdout.write(
            self.style.SUCCESS(f"Enqueued {enqueued} convert_image_to_jpeg task(s).")
        )
