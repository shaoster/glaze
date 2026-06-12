"""Migrate Cloudinary-hosted assets to Cloudflare R2.

Usage:
    python manage.py migrate_assets_to_r2 [--dry-run] [--limit N]

Two idempotent passes:

1. **Originals** — every ``Image`` whose ``r2_key`` is NULL and whose ``url``
   points at Cloudinary is streamed down and re-uploaded to R2 under
   ``images/{user_id|"public"}/{image.id}.{ext}``; ``url`` and ``r2_key`` are
   rewritten in place. Rows already migrated (``r2_key`` set, or ``url``
   already under ``R2_PUBLIC_URL``) are skipped, so re-running is a no-op.
2. **Crop backfill** — every ``PieceStateImage`` with crop coordinates but no
   materialized crop, whose image is R2-backed, gets its derivative rendered
   synchronously (same core as the ``generate_cropped_image`` task) and its
   ``cropped_*`` fields set.

Showcase-video artifacts recorded in old AsyncTask results are intentionally
left untouched: videos are deterministic per ``input_hash`` and re-render to
R2 on demand under the new pipeline.
"""

import httpx
from django.core.management.base import BaseCommand, CommandError

from api import r2
from api.crops import crop_key_for, generate_cropped_image_bytes, set_cropped_fields
from api.models import Image, PieceStateImage

_NON_BROWSER_CONTENT_TYPES = {"image/heic", "image/heif", "image/avif"}

CLOUDINARY_URL_MARKER = "res.cloudinary.com"

# Extension by response content type; URL suffix is the fallback.
_CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "audio/flac": "flac",
}


def _convert_to_jpeg(image_bytes: bytes) -> bytes:
    """Convert image bytes to a JPEG (handles HEIC/HEIF/AVIF via pillow-heif)."""
    import io  # noqa: PLC0415

    from PIL import Image as PILImage  # noqa: PLC0415
    from PIL import ImageOps  # noqa: PLC0415
    from pillow_heif import register_heif_opener  # noqa: PLC0415

    register_heif_opener()
    with PILImage.open(io.BytesIO(image_bytes)) as src:
        img = ImageOps.exif_transpose(src)
        assert img is not None
        if img.mode == "RGBA":
            bg = PILImage.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            img = bg
        elif img.mode != "RGB":
            img = img.convert("RGB")
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue()


def _extension_for(content_type: str, url: str) -> str:
    ext = _CONTENT_TYPE_EXTENSIONS.get(content_type.split(";")[0].strip().lower())
    if ext:
        return ext
    url_ext = url.rsplit("?", 1)[0].rsplit(".", 1)[-1].lower()
    if 1 <= len(url_ext) <= 4 and url_ext.isalnum():
        return url_ext
    return "jpg"


class Command(BaseCommand):
    help = "Migrate Cloudinary-hosted images to R2 and backfill eager crops."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be migrated without writing anything",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Migrate at most N images (crop backfill is not limited)",
        )

    def handle(self, *args, **options):
        if not r2.is_r2_configured():
            raise CommandError(
                "R2 is not configured — set the R2_* environment variables first."
            )
        dry_run: bool = options["dry_run"]
        limit: int | None = options["limit"]

        migrated, failed = self._migrate_originals(dry_run=dry_run, limit=limit)
        backfilled, backfill_failed = self._backfill_crops(dry_run=dry_run)

        summary = (
            f"originals: {migrated} migrated, {failed} failed; "
            f"crops: {backfilled} backfilled, {backfill_failed} failed"
        )
        if failed or backfill_failed:
            self.stderr.write(self.style.WARNING(summary))
        else:
            self.stdout.write(self.style.SUCCESS(summary))

    def _migrate_originals(self, *, dry_run: bool, limit: int | None):
        pending = Image.objects.filter(
            r2_key__isnull=True, url__contains=CLOUDINARY_URL_MARKER
        ).order_by("created")
        if limit is not None:
            pending = pending[:limit]

        migrated = 0
        failed = 0
        with httpx.Client(timeout=60.0, follow_redirects=True) as http:
            for image in pending:
                owner = image.user_id or "public"
                if dry_run:
                    self.stdout.write(f"would migrate {image.id} ({image.url})")
                    migrated += 1
                    continue
                try:
                    response = http.get(image.url)
                    response.raise_for_status()
                    content_type = response.headers.get(
                        "content-type", "application/octet-stream"
                    ).split(";")[0].strip().lower()
                    image_bytes = response.content
                    # Convert non-browser-renderable formats (HEIC/HEIF/AVIF) to
                    # JPEG so migrated assets display in Chrome/Firefox directly.
                    if content_type in _NON_BROWSER_CONTENT_TYPES:
                        image_bytes = _convert_to_jpeg(image_bytes)
                        content_type = "image/jpeg"
                    extension = _extension_for(content_type, image.url)
                    key = f"images/{owner}/{image.id}.{extension}"
                    new_url = r2.upload_bytes(key, image_bytes, content_type)
                except Exception as exc:  # noqa: BLE001 — keep migrating the rest
                    failed += 1
                    self.stderr.write(
                        self.style.WARNING(f"failed {image.id} ({image.url}): {exc}")
                    )
                    continue
                image.url = new_url
                image.r2_key = key
                image.save(update_fields=["url", "r2_key", "last_modified"])
                migrated += 1
                self.stdout.write(f"migrated {image.id} -> {key}")
        return migrated, failed

    def _backfill_crops(self, *, dry_run: bool):
        pending = (
            PieceStateImage.objects.filter(
                crop__isnull=False,
                cropped_image__isnull=True,
                image__r2_key__isnull=False,
            )
            .select_related("image")
            .order_by("created")
        )

        backfilled = 0
        failed = 0
        # The crop key is deterministic per (image, crop), so render each
        # distinct pair once; set_cropped_fields updates every matching row.
        rendered: dict[tuple[str, str], str] = {}
        for link in pending:
            crop = link.crop
            original_key = link.image.r2_key
            if not crop or not original_key:  # narrows the queryset filter for mypy
                continue
            key = crop_key_for(original_key, crop)
            pair = (str(link.image_id), key)
            if pair in rendered:
                continue  # earlier set_cropped_fields call updated all rows
            if dry_run:
                self.stdout.write(f"would backfill crop {key}")
                rendered[pair] = ""
                backfilled += 1
                continue
            try:
                if not r2.object_exists(key):
                    original = r2.get_object_bytes(original_key)
                    derived = generate_cropped_image_bytes(original, crop)
                    r2.upload_bytes(key, derived, "image/jpeg")
                updated = set_cropped_fields(
                    link.image,
                    crop,
                    r2_key=key,
                    url=r2.public_url_for_key(key),
                )
                rendered[pair] = key
            except Exception as exc:  # noqa: BLE001 — keep backfilling the rest
                failed += 1
                self.stderr.write(self.style.WARNING(f"failed crop {key}: {exc}"))
                continue
            backfilled += updated
            self.stdout.write(f"backfilled crop {key} ({updated} rows)")
        return backfilled, failed
