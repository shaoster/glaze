"""Seed the dev database with pieces backed by real Cloudinary images.

Queries the configured Cloudinary account for existing uploaded images and
creates Piece rows pointing at them. This exercises the full AdvancedImage
render path (including the opacity:0 loading state) so the masonry overlap
bug is reproducible locally without manual uploads.

Usage:
    python manage.py seed_cloudinary_pieces
    python manage.py seed_cloudinary_pieces --count 20 --username phil@example.com
"""

from __future__ import annotations

import os

import cloudinary
import cloudinary.api
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from api.models import Piece, PieceState
from api.utils import normalize_image_payload
from api.workflow import ENTRY_STATE


def _configure_cloudinary() -> str:
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip()
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip()
    if not cloud_name or not api_key or not api_secret:
        raise CommandError(
            "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET "
            "must be set (check .env.local)."
        )
    cloudinary.config(
        cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True
    )
    return cloud_name


class Command(BaseCommand):
    help = (
        "Seed dev pieces backed by real Cloudinary images so the AdvancedImage "
        "load path and masonry layout are exercisable locally."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=12,
            help="Number of pieces to create (capped by available Cloudinary assets).",
        )
        parser.add_argument(
            "--username",
            default=None,
            help="Username/email to attach pieces to. Defaults to the first superuser.",
        )

    def handle(self, *args, **options):
        cloud_name = _configure_cloudinary()

        User = get_user_model()
        if options["username"]:
            try:
                user = User.objects.get(username=options["username"])
            except User.DoesNotExist:
                try:
                    user = User.objects.get(email=options["username"])
                except User.DoesNotExist:
                    raise CommandError(f"No user found for {options['username']!r}.")
        else:
            user = User.objects.filter(is_superuser=True).order_by("date_joined").first()
            if user is None:
                raise CommandError(
                    "No superuser found. Create one first or pass --username."
                )

        count = options["count"]
        self.stdout.write(f"Fetching up to {count} images from Cloudinary ({cloud_name})...")

        try:
            result = cloudinary.api.resources(
                resource_type="image",
                type="upload",
                max_results=count,
            )
        except Exception as exc:
            raise CommandError(f"Cloudinary API call failed: {exc}") from exc

        resources = result.get("resources", [])
        if not resources:
            raise CommandError("No images found in the Cloudinary account.")

        created = 0
        for i, asset in enumerate(resources):
            public_id = asset["public_id"]
            secure_url = asset["secure_url"]
            width = asset.get("width", 0)
            height = asset.get("height", 0)

            # Derive a crop covering the full image so masonic pre-seeds heights
            # from the real aspect ratio. Use relative coords (0–1).
            crop = None
            if width > 0 and height > 0:
                crop = {"x": 0.0, "y": 0.0, "width": 1.0, "height": height / width}

            image = normalize_image_payload(
                {
                    "url": secure_url,
                    "cloudinary_public_id": public_id,
                    "cloud_name": cloud_name,
                },
                user=user,
            )
            piece = Piece.objects.create(
                user=user,
                name=f"Cloudinary seed #{i + 1} ({public_id.split('/')[-1][:24]})",
                thumbnail=image,
                thumbnail_crop=crop,
            )
            PieceState.objects.create(
                user=user, piece=piece, state=ENTRY_STATE, notes="", order=1
            )

            created += 1
            self.stdout.write(f"  created piece {piece.id} → {public_id}")

        self.stdout.write(
            self.style.SUCCESS(f"Done. Created {created} Cloudinary-backed piece(s).")
        )
