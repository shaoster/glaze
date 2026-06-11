"""Glaze-specific utility helpers.

This module holds business-logic helpers that are shared across multiple parts
of the api app but do not belong in workflow.py (which is reserved for
workflow-state-machine logic derived from workflow.yml).
"""

import logging
from typing import TYPE_CHECKING

import requests

if TYPE_CHECKING:
    from .models import CropRun
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .dev.bootstrap import bootstrap_dev_user as _bootstrap_dev_user

bootstrap_dev_user = _bootstrap_dev_user

logger = logging.getLogger(__name__)


def get_rss() -> float:
    """Return the current process Resident Set Size in MB."""
    import gc

    try:
        gc.collect()
        with open("/proc/self/status", "r") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) / 1024
    except (FileNotFoundError, IndexError, ValueError):
        pass
    return 0.0


DEV_THUMBNAIL_URLS = {
    "bowl": "/thumbnails/bowl.svg",
    "mug": "/thumbnails/mug.svg",
    "plate": "/thumbnails/plate.svg",
    "vase": "/thumbnails/vase.svg",
}


# Fields that are mirrored between a public GlazeType and its singleton
# single-layer GlazeCombination.  Kept here so both admin.py and
# manual_tile_imports.py can import from one place without pulling in the
# full workflow module.
SHARED_GLAZE_FIELDS: tuple[str, ...] = (
    "test_tile_image",
    "is_food_safe",
    "runs",
    "highlights_grooves",
    "is_different_on_white_and_brown_clay",
    "apply_thin",
)


def calculate_subject_mask_remote(
    image_bytes: bytes | None = None, image_url: str | None = None
) -> dict | None:
    """Offload subject segmentation to a remote ML service.

    Accepts either raw image bytes or a public image URL.
    Returns {"mask": "<b64>"} on success, {"mask": None} when no subject found,
    or None on network/service error.
    """
    remote_url = getattr(settings, "REMOTE_REMBG_URL", None)
    auth_token = getattr(settings, "MODAL_AUTH_TOKEN", None)

    if not remote_url:
        logger.warning(
            "calculate_subject_mask_remote called but REMOTE_REMBG_URL is not set."
        )
        return None

    logger.info(f"Offloading subject segmentation to remote service: {remote_url}")
    headers = {}
    if auth_token:
        headers["X-API-Key"] = auth_token

    try:
        if image_url:
            # URL-based dispatch (saves bandwidth and memory on the host)
            response = requests.post(
                remote_url, json={"url": image_url}, headers=headers, timeout=60
            )
        elif image_bytes:
            # Fallback to byte-based dispatch
            headers["Content-Type"] = "application/octet-stream"
            response = requests.post(
                remote_url, data=image_bytes, headers=headers, timeout=60
            )
        else:
            raise ValueError("Either image_bytes or image_url must be provided")

        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Remote subject segmentation failed: {e}")
        return None


def upload_mask_to_r2(mask_bytes: bytes, image) -> dict:
    """Upload a PNG segmentation mask to R2 and return the asset reference dict.

    The mask is stored under the crop-masks/ prefix, keyed by image.id. This
    asset is the segmentation mask that the crop bbox is derived from.
    """
    from . import r2  # noqa: PLC0415

    if not r2.is_r2_configured():
        raise ValueError("R2 object storage is not configured.")

    key = f"crop-masks/{image.id}.png"
    url = r2.upload_bytes(key, mask_bytes, "image/png")
    return {"r2_key": key, "url": url}


def run_crop_inference(piece_state_image, async_task=None) -> "CropRun":
    """Call the segment service, derive a crop bbox from its mask, persist CropRun."""
    import base64  # noqa: PLC0415
    import binascii  # noqa: PLC0415
    import io  # noqa: PLC0415
    import time  # noqa: PLC0415

    from PIL import Image as PILImage  # noqa: PLC0415

    from .models import CropRun  # noqa: PLC0415

    image = piece_state_image.image

    remote_url = getattr(settings, "REMOTE_REMBG_URL", None)
    source = {
        "type": "automated",
        "backend": "rembg-u2net" if remote_url else "rembg-u2netp",
        "deployment": "modal" if remote_url else "local",
        "version": None,
    }

    start = time.monotonic()
    try:
        mask_response = calculate_subject_mask_remote(image_url=image.url)
    except Exception as e:
        logger.error(f"Segment service call failed for image {image.id}: {e}")
        return CropRun.objects.create(
            image=image,
            piece_state_image=piece_state_image,
            source=source,
            status=CropRun.Status.ERROR,
            error=str(e),
            latency_ms=int((time.monotonic() - start) * 1000),
            async_task=async_task,
        )

    latency_ms = int((time.monotonic() - start) * 1000)

    if not mask_response or not mask_response.get("mask"):
        return CropRun.objects.create(
            image=image,
            piece_state_image=piece_state_image,
            source=source,
            status=CropRun.Status.NO_SUBJECT,
            latency_ms=latency_ms,
            async_task=async_task,
        )

    try:
        mask_bytes = base64.b64decode(mask_response["mask"], validate=True)

        # The remote service returns a mask; derive the crop box locally.
        pil_img = PILImage.open(io.BytesIO(mask_bytes))
        pil_img.load()
        alpha = pil_img.split()[3]
        bbox = alpha.getbbox()  # (left, upper, right, lower) or None
        if not bbox:
            return CropRun.objects.create(
                image=image,
                piece_state_image=piece_state_image,
                source=source,
                status=CropRun.Status.NO_SUBJECT,
                latency_ms=latency_ms,
                async_task=async_task,
            )
    except (binascii.Error, OSError, IndexError, ValueError) as e:
        logger.warning(f"Invalid segmentation mask for image {image.id}: {e}")
        return CropRun.objects.create(
            image=image,
            piece_state_image=piece_state_image,
            source=source,
            status=CropRun.Status.ERROR,
            error=str(e),
            latency_ms=latency_ms,
            async_task=async_task,
        )

    w, h = alpha.size
    crop = {
        "x": bbox[0] / w,
        "y": bbox[1] / h,
        "width": (bbox[2] - bbox[0]) / w,
        "height": (bbox[3] - bbox[1]) / h,
    }

    mask_asset = None
    try:
        mask_asset = upload_mask_to_r2(mask_bytes, image)
    except Exception as e:
        logger.warning(f"Mask upload failed for image {image.id}: {e}")

    return CropRun.objects.create(
        image=image,
        piece_state_image=piece_state_image,
        source=source,
        status=CropRun.Status.SUCCESS,
        crop=crop,
        mask_asset=mask_asset,
        latency_ms=latency_ms,
        async_task=async_task,
    )


def get_or_create_location(user, name: str | None):
    """Return a Location for *user* with the given *name*, creating it if needed.

    Returns ``None`` when *name* is falsy so callers can assign the result
    directly to ``piece.current_location``.
    """
    if not name:
        return None
    from .models import Location  # noqa: PLC0415

    location, _ = Location.objects.get_or_create(user=user, name=name)
    return location


def image_to_dict(image) -> dict | None:
    """Serialize an Image model instance to the stable API image object."""
    if image is None:
        return None
    if isinstance(image, dict):
        return {
            "url": image.get("url") or "",
            "image_id": image.get("image_id"),
        }
    if isinstance(image, str):
        return {
            "url": image,
            "image_id": None,
        }
    return {
        "url": image.url,
        "image_id": str(image.id) if hasattr(image, "id") else None,
        "width": getattr(image, "width", None),
        "height": getattr(image, "height", None),
    }


def crop_to_dict(crop: object) -> dict | None:
    """Normalize crop payloads to relative {x, y, width, height} coordinates."""
    if not isinstance(crop, dict):
        return None
    try:
        normalized = {
            "x": float(crop["x"]),
            "y": float(crop["y"]),
            "width": float(crop["width"]),
            "height": float(crop["height"]),
        }
    except (KeyError, TypeError, ValueError):
        return None
    if normalized["width"] <= 0 or normalized["height"] <= 0:
        return None
    return {key: min(max(value, 0.0), 1.0) for key, value in normalized.items()}


def normalize_image_payload(payload: object, user=None):
    """Return an Image row for an API/admin image payload.

    Images are deduplicated by URL. The R2 object key is derived server-side
    from the URL (never trusted from the client); URLs outside the configured
    R2 public domain (curated local SVGs, external assets) get r2_key=None.
    """
    if payload in (None, ""):
        return None
    if isinstance(payload, str):
        data: dict = {"url": payload}
    elif isinstance(payload, dict):
        data = {"url": payload.get("url") or ""}
    else:
        return None

    url = str(data["url"]).strip()
    if not url:
        return None

    from . import r2  # noqa: PLC0415
    from .models import Image  # noqa: PLC0415

    defaults: dict = {"user": user, "r2_key": r2.key_for_public_url(url)}
    raw_width = payload.get("width") if isinstance(payload, dict) else None
    raw_height = payload.get("height") if isinstance(payload, dict) else None
    if raw_width:
        defaults["width"] = int(raw_width)
    if raw_height:
        defaults["height"] = int(raw_height)

    image, created = Image.objects.get_or_create(url=url, defaults=defaults)
    if not created and image.r2_key is None and defaults["r2_key"]:
        image.r2_key = defaults["r2_key"]
        image.save(update_fields=["r2_key"])
    return image


def captioned_image_to_dict(link) -> dict:
    """Serialize a PieceStateImage link to the stable CaptionedImage shape."""
    image_payload = image_to_dict(link.image) or {}
    return {
        **image_payload,
        "caption": link.caption,
        "crop": link.crop,
        "cropped_url": link.cropped_url,
        "created": link.created,
        "image_id": str(link.image_id) if link.image_id else None,
    }


def _crop_pair_key(image_id, crop: dict | None):
    """Hashable identity for an (image, crop) value pair."""
    if crop is None:
        return None
    return (
        str(image_id),
        tuple(
            format(float(crop[axis]), ".4f") for axis in ("x", "y", "width", "height")
        ),
    )


@transaction.atomic
def replace_piece_state_images(piece_state, images: list[dict], user=None) -> None:
    """Replace a PieceState's ordered image attachments from API payloads.

    Cropped derivatives are carried over from the deleted links when the
    (image, crop) pair is unchanged; the generate_cropped_image task is
    enqueued only for new or changed pairs (eager crop pipeline).
    """
    from .crops import enqueue_generate_cropped_image  # noqa: PLC0415
    from .models import PieceStateImage  # noqa: PLC0415

    # Capture (image, crop) → cropped_* from the links being replaced so
    # unchanged pairs keep their already-materialized derivative.
    previous_cropped: dict = {}
    for link in piece_state.image_links.all():
        pair = _crop_pair_key(link.image_id, link.crop)
        if pair is not None and link.cropped_r2_key:
            previous_cropped[pair] = (link.cropped_r2_key, link.cropped_url)

    piece_state.image_links.all().delete()
    for order, payload in enumerate(images):
        image = normalize_image_payload(payload, user=user)
        if image is None:
            continue
        created_val = payload.get("created") or timezone.now()
        crop = crop_to_dict(payload.get("crop"))
        pair = _crop_pair_key(image.id, crop)
        carried = previous_cropped.get(pair) if pair is not None else None
        PieceStateImage.objects.create(
            piece_state=piece_state,
            image=image,
            caption=payload.get("caption") or "",
            crop=crop,
            cropped_r2_key=carried[0] if carried else None,
            cropped_url=carried[1] if carried else None,
            created=created_val,
            order=order,
        )
        if crop is not None and carried is None:
            enqueue_generate_cropped_image(image, crop, user=piece_state.piece.user)


def sync_glaze_type_singleton_combination(
    glaze_type, *, old_name: str | None = None
) -> None:
    """Ensure a matching public single-layer GlazeCombination exists for a public GlazeType.

    Creates or updates the singleton combination so that its name and shared
    property fields stay in sync with the given GlazeType.

    When ``old_name`` is provided and differs from ``glaze_type.name``, any
    existing combination named ``old_name`` is renamed before the sync step
    (handles the admin rename-GlazeType case).

    The layer check avoids unnecessary delete/create cycles: if a single layer
    already points at the correct GlazeType, the layers are left unchanged.

    Imports are deferred to the function body to avoid circular imports at
    module load time (models import workflow at the module level).
    """
    # Deferred imports to avoid circular dependency (models import workflow).
    from .models import GlazeCombination, GlazeCombinationLayer  # noqa: PLC0415

    combo_props = {field: getattr(glaze_type, field) for field in SHARED_GLAZE_FIELDS}
    combo = None

    if old_name and old_name != glaze_type.name:
        # GlazeType was renamed — rename the existing singleton combination too.
        combo = GlazeCombination.objects.filter(user=None, name=old_name).first()
        if combo is not None:
            combo.name = glaze_type.name
            for field, value in combo_props.items():
                setattr(combo, field, value)
            combo.save(update_fields=["name", *SHARED_GLAZE_FIELDS])

    if combo is None:
        combo, created = GlazeCombination.objects.get_or_create(
            user=None,
            name=glaze_type.name,
            defaults=combo_props,
        )
        if not created:
            for field, value in combo_props.items():
                setattr(combo, field, value)
            combo.save(update_fields=list(SHARED_GLAZE_FIELDS))

    # Ensure exactly one layer pointing at this GlazeType.
    layers = list(combo.layers.select_related("glaze_type").order_by("order"))
    if len(layers) != 1 or layers[0].glaze_type_id != glaze_type.id:
        combo.layers.all().delete()
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=glaze_type, order=0
        )
