"""Delete orphaned derived Image rows and their R2 objects."""

import datetime

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from api import r2
from api.models import Image
from api.workflow import (
    get_global_model_and_field,
    get_global_names,
    get_image_fields_for_global_model,
)


def _global_referenced_ids() -> set:
    """Collect Image PKs referenced by any global-model image field.

    ImageForeignKey uses related_name="+" so there is no reverse accessor;
    we must query each model/field explicitly.
    """
    ids: set = set()
    for global_name in get_global_names():
        try:
            model_cls, _, _ = get_global_model_and_field(global_name)
        except KeyError:
            continue
        for field_name in get_image_fields_for_global_model(model_cls):
            ids.update(
                model_cls.objects.exclude(
                    **{f"{field_name}__isnull": True}
                ).values_list(f"{field_name}_id", flat=True)
            )
    return ids


# Q expression: true if an Image is directly piece-referenced.
_PIECE_REFERENCED = (
    Q(piece_state_links__isnull=False)
    | Q(crop_links__isnull=False)
    | Q(thumbnail_for_pieces__isnull=False)
)


_DERIVATIVE_PIECE_REFERENCED = (
    Q(derivatives__piece_state_links__isnull=False)
    | Q(derivatives__crop_links__isnull=False)
    | Q(derivatives__thumbnail_for_pieces__isnull=False)
)


def _protected_source_ids() -> set:
    """Conversion-source IDs that must not be deleted.

    A conversion source (derived_from=NULL, parent of a jpeg_conversion derivative)
    is protected when at least one of its derivatives is still piece-referenced.
    Deleting a source whose JPEG is live would orphan the derivative's lineage.
    """
    return set(
        Image.objects.filter(derived_from__isnull=True)
        .filter(derivatives__derived_type="jpeg_conversion")
        .filter(_DERIVATIVE_PIECE_REFERENCED)
        .values_list("id", flat=True)
    )


class Command(BaseCommand):
    help = (
        "Identify derived Image rows (and their unreferenced conversion sources) "
        "that are no longer referenced by any piece and delete them along with "
        "their R2 objects."
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
        parser.add_argument(
            "--min-age-minutes",
            type=int,
            default=60,
            help=(
                "Only delete images created at least this many minutes ago "
                "(default: 60). Prevents racing with in-flight upload/conversion tasks."
            ),
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options["limit"]
        min_age_minutes = options["min_age_minutes"]

        cutoff = timezone.now() - datetime.timedelta(minutes=min_age_minutes)

        # Global model image fields use related_name="+" so we collect their IDs
        # explicitly and exclude them.
        global_ids = _global_referenced_ids()

        # Conversion-source images that have a live (piece-referenced) derivative
        # must not be deleted — their derivative still needs the lineage.
        protected_sources = _protected_source_ids()

        # Candidates:
        # 1. Derived images (derived_from IS NOT NULL).
        # 2. Conversion-source images: original uploads (derived_from IS NULL) that
        #    are the source of a jpeg_conversion derivative.  When the frontend only
        #    saves the JPEG URL, the source HEIC/PNG row becomes unreferenced too.
        candidates = Q(derived_from__isnull=False) | Q(
            derived_from__isnull=True,
            derivatives__derived_type="jpeg_conversion",
        )

        qs = (
            Image.objects.filter(candidates)
            .exclude(_PIECE_REFERENCED)
            .filter(created__lt=cutoff)
            .distinct()
            .only("id", "r2_key")
        )
        exclude_ids = global_ids | protected_sources
        if exclude_ids:
            qs = qs.exclude(pk__in=exclude_ids)
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
