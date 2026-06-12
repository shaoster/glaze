from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import models

from api.models import AsyncTask, Image, PieceStateImage
from api.tasks import get_task_interface


class Command(BaseCommand):
    help = (
        "Backpopulate subject-detection crops for existing piece images "
        "by enqueuing async tasks through the production AsyncTask pipeline."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Count qualifying images and print a summary without enqueuing any tasks.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Queue tasks even for images that already have a crop (default skips them).",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        force = options["force"]

        # Resolve a superuser to own the enqueued tasks.
        user = None
        if not dry_run:
            User = get_user_model()
            user = User.objects.filter(is_superuser=True).order_by("pk").first()
            if user is None:
                raise CommandError(
                    "No superuser found. Create one with "
                    "'python manage.py createsuperuser' before running this command."
                )

        # Restrict to R2-backed images and Cloudinary-hosted images; avoid
        # enqueuing subject-detection tasks for arbitrary user-supplied URLs.
        images = (
            Image.objects.exclude(url="")
            .filter(
                models.Q(r2_key__isnull=False)
                | models.Q(url__icontains="res.cloudinary.com")
            )
            .order_by("url")
        )

        # Build the list of work items: one entry per (image, piece) or (image, psi).
        work_items: list[dict] = []
        skipped = 0

        for image in images.iterator():
            link_qs = (
                PieceStateImage.objects.filter(image=image)
                if force
                else PieceStateImage.objects.filter(image=image, crop__isnull=True)
            )
            psi_ids = list(link_qs.values_list("id", flat=True))

            if not psi_ids:
                skipped += 1
                continue

            for psi_id in psi_ids:
                work_items.append(
                    {
                        "image_id": str(image.id),
                        "piece_state_image_id": psi_id,
                    }
                )

        total = len(work_items)

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Dry run: would enqueue {total} task(s) "
                    f"({skipped} image(s) skipped — no qualifying crops needed)."
                )
            )
            return

        # Enqueue tasks and print inline progress.
        interface = get_task_interface()
        for n, params in enumerate(work_items, start=1):
            task = AsyncTask.objects.create(  # type: ignore[misc]
                user=user,
                task_type="detect_subject_crop",
                input_params=params,
            )
            interface.submit(task)
            self.stdout.write(f"\rQueued {n} / {total} task(s)...", ending="")
            self.stdout.flush()

        from django.urls import reverse

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Enqueued {total} detect_subject_crop task(s) "
                f"({skipped} image(s) skipped). "
                f"Monitor progress at {reverse('admin:api_asynctask_changelist')}."
            )
        )
