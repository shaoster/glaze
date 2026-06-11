"""Eager crop pipeline helpers for PieceStateImage.

Crops moved from lazy Cloudinary transform URLs (built at render time) to
eager derivatives materialized in R2 by the ``generate_cropped_image`` task:

- Saving crop coordinates clears the ``cropped_*`` fields and enqueues the
  task; the fields stay NULL until the task writes the JPEG to R2.
- The derived asset key is deterministic per (original r2_key, crop), so
  re-running the task is idempotent and recreated PieceStateImage rows with
  the same (image, crop) pair can reuse the existing object.
- On success the task updates **all** current PieceStateImage rows matching
  (image_id, crop) — rows may have been deleted and recreated while the task
  ran (see ``replace_piece_state_images``).
"""

import logging

logger = logging.getLogger(__name__)

# Derived crop sizing: one asset per crop, long edge capped, JPEG.
CROPPED_IMAGE_MAX_EDGE = 1600
CROPPED_IMAGE_JPEG_QUALITY = 82

GENERATE_CROPPED_IMAGE_TASK_TYPE = "generate_cropped_image"


def crop_key_for(original_r2_key: str, crop: dict) -> str:
    """Return the deterministic R2 key for a crop of an original object.

    Coordinates are rendered at fixed 4-decimal precision so equal crops map
    to the same object regardless of float formatting.
    """
    coords = "-".join(
        format(float(crop[axis]), ".4f") for axis in ("x", "y", "width", "height")
    )
    return f"crops/{original_r2_key}/{coords}.jpg"


def enqueue_generate_cropped_image(image, crop: dict, *, user) -> None:
    """Submit a generate_cropped_image task for (image, crop).

    No-op for crop-less calls and for images that are not R2-backed (legacy
    external URLs keep rendering uncropped until migrated).
    """
    from .models import AsyncTask  # noqa: PLC0415
    from .tasks import get_task_interface  # noqa: PLC0415

    if not crop or not image or not image.r2_key:
        return
    task = AsyncTask.objects.create(
        user=user,
        task_type=GENERATE_CROPPED_IMAGE_TASK_TYPE,
        input_params={"image_id": str(image.id), "crop": crop},
    )
    get_task_interface().submit(task)


def apply_crop(piece_state_image, crop: dict | None) -> None:
    """Set crop coordinates on a PieceStateImage and kick off materialization.

    The ``cropped_*`` fields are cleared immediately (they describe the
    previous crop, if any) and repopulated asynchronously by the task. The
    task's AsyncTask row is owned by the piece owner.
    """
    from .utils import crop_to_dict  # noqa: PLC0415

    normalized = crop_to_dict(crop)
    piece_state_image.crop = normalized
    piece_state_image.cropped_r2_key = None
    piece_state_image.cropped_url = None
    piece_state_image.save(update_fields=["crop", "cropped_r2_key", "cropped_url"])
    if normalized is not None:
        enqueue_generate_cropped_image(
            piece_state_image.image,
            normalized,
            user=piece_state_image.piece_state.piece.user,
        )


def generate_cropped_image_bytes(original_bytes: bytes, crop: dict) -> bytes:
    """Render the cropped JPEG derivative from the original image bytes.

    ``exif_transpose`` first so relative crop coordinates (captured against
    the displayed orientation) land on the right pixels, then a pixel-box
    crop, then a downscale to the long-edge cap.
    """
    import io  # noqa: PLC0415

    from PIL import Image as PILImage  # noqa: PLC0415
    from PIL import ImageOps  # noqa: PLC0415

    with PILImage.open(io.BytesIO(original_bytes)) as source:
        image = ImageOps.exif_transpose(source)
        assert image is not None
        width, height = image.size
        left = max(0, min(width, round(float(crop["x"]) * width)))
        top = max(0, min(height, round(float(crop["y"]) * height)))
        right = max(
            left + 1,
            min(width, round((float(crop["x"]) + float(crop["width"])) * width)),
        )
        bottom = max(
            top + 1,
            min(height, round((float(crop["y"]) + float(crop["height"])) * height)),
        )
        cropped = image.crop((left, top, right, bottom))
        long_edge = max(cropped.size)
        if long_edge > CROPPED_IMAGE_MAX_EDGE:
            scale = CROPPED_IMAGE_MAX_EDGE / long_edge
            cropped = cropped.resize(
                (
                    max(1, round(cropped.size[0] * scale)),
                    max(1, round(cropped.size[1] * scale)),
                )
            )
        if cropped.mode != "RGB":
            cropped = cropped.convert("RGB")
        out = io.BytesIO()
        cropped.save(out, format="JPEG", quality=CROPPED_IMAGE_JPEG_QUALITY)
        return out.getvalue()


def set_cropped_fields(
    image_id, crop: dict, *, cropped_r2_key: str, cropped_url: str
) -> int:
    """Write the cropped asset reference onto all PSI rows matching (image, crop).

    Matching by value (not by PSI pk) makes task completion race-safe: the
    row that triggered the task may have been deleted and recreated with the
    same (image, crop) pair while the task ran.
    """
    from .models import PieceStateImage  # noqa: PLC0415

    return PieceStateImage.objects.filter(image_id=image_id, crop=crop).update(
        cropped_r2_key=cropped_r2_key,
        cropped_url=cropped_url,
    )
