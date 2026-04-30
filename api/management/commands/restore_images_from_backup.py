"""Restore piece images and thumbnails from a pre-migration YAML backup.

Usage:
    python manage.py restore_images_from_backup <backup.yaml> [--dry-run]

The backup YAML is a list of piece records (as produced by the data export)
with full history and thumbnail fields.  For each piece/state found in the
backup, this command checks whether the current DB record has lost images
that were present in the backup, and restores them if so.

Only the following are treated as restorable:
  - PieceState.images: restored when the DB array is empty and the backup has
    at least one image, OR when the DB array contains fewer images than the
    backup and the extra backup images are not present at all in the DB list.
  - Piece.thumbnail: restored when the DB thumbnail is null/empty and the
    backup has a non-null, non-question-mark thumbnail.

Images are written as {url, cloudinary_public_id, cloud_name} dicts; the
command derives cloudinary_public_id and cloud_name from the URL using the
same logic as migration 0026 so restored images are immediately usable.
"""

import re
import sys
from pathlib import Path
from urllib.parse import urlparse

import yaml
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from api.models import Piece, PieceState


_CLOUDINARY_HOSTNAME = 'res.cloudinary.com'
_TRANSFORM_RE = re.compile(r'^[a-z]{1,4}_')
_VERSION_RE = re.compile(r'^v\d+$')


def _parse_cloudinary_url(url: str) -> tuple[str | None, str | None]:
    try:
        parsed = urlparse(url)
    except Exception:
        return None, None
    if parsed.hostname != _CLOUDINARY_HOSTNAME:
        return None, None
    parts = parsed.path.split('/')
    if len(parts) < 5 or parts[2] != 'image' or parts[3] != 'upload':
        return None, None
    cloud_name = parts[1] or None
    after_upload = parts[4:]
    i = 0
    while i < len(after_upload) - 1 and (
        _TRANSFORM_RE.match(after_upload[i]) or _VERSION_RE.match(after_upload[i])
    ):
        i += 1
    public_id_parts = after_upload[i:]
    if not public_id_parts:
        return cloud_name, None
    public_id_parts[-1] = re.sub(r'\.[^.]+$', '', public_id_parts[-1])
    result = '/'.join(public_id_parts)
    return cloud_name, (result or None)


def _normalize_image(img: dict) -> dict:
    """Ensure the image dict has cloudinary_public_id and cloud_name set."""
    url = img.get('url') or ''
    cloud_name = img.get('cloud_name')
    public_id = img.get('cloudinary_public_id')
    if not cloud_name or not public_id:
        derived_cloud, derived_id = _parse_cloudinary_url(url)
        cloud_name = cloud_name or derived_cloud
        public_id = public_id or derived_id
    return {
        'url': url,
        'cloudinary_public_id': public_id,
        'cloud_name': cloud_name,
        'caption': img.get('caption', ''),
        'created': img.get('created'),
    }


def _is_placeholder_thumbnail(thumb: dict | None) -> bool:
    if not thumb:
        return True
    url = thumb.get('url') or ''
    return not url or 'question-mark' in url


class Command(BaseCommand):
    help = "Restore piece images and thumbnails from a pre-migration YAML backup."

    def add_arguments(self, parser):
        parser.add_argument('backup', type=Path, help='Path to the backup YAML file')
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without writing to the database',
        )

    def handle(self, *args, **options):
        backup_path: Path = options['backup']
        dry_run: bool = options['dry_run']

        if not backup_path.exists():
            raise CommandError(f"Backup file not found: {backup_path}")

        with open(backup_path) as f:
            records = yaml.safe_load(f)

        if not isinstance(records, list):
            raise CommandError("Backup YAML must be a list of piece records")

        restored_states = 0
        restored_thumbnails = 0
        skipped = 0

        for record in records:
            piece_id = record.get('id')
            if not piece_id:
                continue

            try:
                piece = Piece.objects.get(pk=piece_id)
            except Piece.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f"Piece {piece_id} not found in DB — skipping")
                )
                skipped += 1
                continue

            history = record.get('history') or []

            # --- Restore PieceState images ---
            # Build a dict: state_name → list of state records from backup
            # (a piece can pass through the same state multiple times, so we
            # pair by position in creation order)
            db_states = list(
                PieceState.objects.filter(piece=piece).order_by('created')
            )
            backup_states = list(history)

            # Match by index position (creation order preserved in backup)
            for i, backup_state in enumerate(backup_states):
                backup_images = backup_state.get('images') or []
                if not backup_images:
                    continue  # Nothing to restore for this state

                if i >= len(db_states):
                    self.stdout.write(
                        self.style.WARNING(
                            f"Piece {piece_id}: backup has more states than DB "
                            f"(backup index {i}) — skipping extra"
                        )
                    )
                    break

                db_state = db_states[i]
                db_images = db_state.images or []

                # Check if DB images are missing entries found in backup
                db_urls = {img.get('url') for img in db_images if isinstance(img, dict)}
                missing = [
                    img for img in backup_images
                    if isinstance(img, dict) and img.get('url') not in db_urls
                ]

                if not missing:
                    continue  # DB already has all backup images

                # Merge: keep existing DB images, append missing ones from backup
                restored = [_normalize_image(img) for img in missing]
                new_images = db_images + restored

                self.stdout.write(
                    f"Piece {piece_id} / state {db_state.pk} ({backup_state.get('state')}): "
                    f"restoring {len(missing)} image(s)"
                )
                if not dry_run:
                    with transaction.atomic():
                        PieceState.objects.filter(pk=db_state.pk).update(images=new_images)

                restored_states += 1

            # --- Restore thumbnail ---
            backup_thumb_raw = record.get('thumbnail')
            if isinstance(backup_thumb_raw, str):
                import json as _json
                try:
                    backup_thumb = _json.loads(backup_thumb_raw)
                except (ValueError, TypeError):
                    backup_thumb = {'url': backup_thumb_raw, 'cloudinary_public_id': None, 'cloud_name': None}
            elif isinstance(backup_thumb_raw, dict):
                backup_thumb = backup_thumb_raw
            else:
                backup_thumb = None

            if _is_placeholder_thumbnail(backup_thumb):
                continue  # Backup thumb is a placeholder — nothing to restore

            current_thumb = piece.thumbnail
            if current_thumb and not _is_placeholder_thumbnail(current_thumb):
                continue  # DB already has a real thumbnail

            normalized = _normalize_image(backup_thumb)
            self.stdout.write(
                f"Piece {piece_id} ({record.get('name')}): restoring thumbnail {normalized['url']}"
            )
            if not dry_run:
                with transaction.atomic():
                    Piece.objects.filter(pk=piece_id).update(thumbnail=normalized)

            restored_thumbnails += 1

        prefix = "[DRY RUN] " if dry_run else ""
        self.stdout.write(
            self.style.SUCCESS(
                f"{prefix}Done. Restored {restored_states} state image set(s), "
                f"{restored_thumbnails} thumbnail(s). Skipped {skipped} missing piece(s)."
            )
        )
