from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from api.models import AsyncTask, Image, Piece, PieceStateImage
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

        images = (
            Image.objects.filter(
                cloud_name__isnull=False,
                cloudinary_public_id__isnull=False,
            )
            .exclude(cloud_name="")
            .exclude(cloudinary_public_id="")
            .order_by("cloud_name", "cloudinary_public_id")
        )

        # Build the list of work items: one entry per (image, piece) or (image, psi).
        work_items: list[dict] = []
        skipped = 0

        for image in images.iterator():
            if not image.cloud_name or not image.cloudinary_public_id:
                skipped += 1
                continue

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

            piece_ids = list(piece_qs.values_list("id", flat=True))
            psi_ids = list(link_qs.values_list("id", flat=True))

            if not piece_ids and not psi_ids:
                skipped += 1
                continue

            for piece_id in piece_ids:
                work_items.append(
                    {
                        "image_id": str(image.id),
                        "piece_id": str(piece_id),
                    }
                )
            for psi_id in psi_ids:
                work_items.append(
                    {
                        "image_id": str(image.id),
                        "piece_state_image_id": str(psi_id),
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

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                f"Enqueued {total} detect_subject_crop task(s) "
                f"({skipped} image(s) skipped). "
                f"Monitor progress at /admin/api/asynctask/."
            )
        )
