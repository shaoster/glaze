"""Direct-to-R2 upload endpoints.

The client asks for a presigned PUT URL, uploads the file straight to R2, and
then persists the returned ``public_url`` through the normal piece/global
PATCH flows. The server controls the object key entirely — the client never
influences where an object lands beyond choosing an allowed content type.
"""

import uuid
from typing import NamedTuple

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from .. import r2

# Maps each resource type to its allowed content types and the file extension
# derived from the validated content type (never from a client filename).
_IMAGE_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
}
_VIDEO_CONTENT_TYPES = {
    "video/mp4": "mp4",
    "video/webm": "webm",
}
_AUDIO_CONTENT_TYPES = {
    "audio/flac": "flac",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
}


class _ResourceConfig(NamedTuple):
    content_types: dict[str, str]
    prefix: str


_RESOURCE_TYPES = {
    "image": _ResourceConfig(content_types=_IMAGE_CONTENT_TYPES, prefix="images"),
    "video": _ResourceConfig(content_types=_VIDEO_CONTENT_TYPES, prefix="videos"),
    "audio": _ResourceConfig(content_types=_AUDIO_CONTENT_TYPES, prefix="audio"),
}

# Resource types whose uploads are restricted to staff accounts.
_STAFF_ONLY_RESOURCE_TYPES = {"video", "audio"}


@extend_schema(
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "content_type": {"type": "string"},
                "resource_type": {
                    "type": "string",
                    "enum": sorted(_RESOURCE_TYPES),
                    "default": "image",
                },
            },
            "required": ["content_type"],
        }
    },
    responses={
        200: {
            "type": "object",
            "properties": {
                "upload_url": {"type": "string"},
                "fields": {
                    "type": "object",
                    "additionalProperties": {"type": "string"},
                },
                "key": {"type": "string"},
                "public_url": {"type": "string"},
                "expires_in": {"type": "integer"},
                "max_bytes": {"type": "integer"},
            },
            "required": [
                "upload_url",
                "fields",
                "key",
                "public_url",
                "expires_in",
                "max_bytes",
            ],
        },
        400: {"type": "object"},
        403: {"type": "object"},
        503: {"type": "object"},
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def r2_presigned_upload_url(request: Request) -> Response:
    """Issue a presigned R2 PUT URL with a server-generated object key."""
    if not r2.is_r2_configured():
        return Response(
            {"detail": "Object storage is not configured on the server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    resource_type = request.data.get("resource_type", "image")
    resource_config = _RESOURCE_TYPES.get(resource_type)
    if resource_config is None:
        return Response(
            {"detail": f"Unsupported resource_type: {resource_type!r}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # [SECURITY] Video/audio uploads are an admin-only capability (showcase
    # assets); regular users may upload images only.
    if resource_type in _STAFF_ONLY_RESOURCE_TYPES and not request.user.is_staff:
        return Response(
            {"detail": f"Only staff may upload {resource_type} assets."},
            status=status.HTTP_403_FORBIDDEN,
        )

    content_type = request.data.get("content_type")
    if not isinstance(content_type, str):
        return Response(
            {"detail": "content_type is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    content_type = content_type.strip().lower()
    extension = resource_config.content_types.get(content_type)
    if extension is None:
        return Response(
            {"detail": f"Unsupported content type: {content_type!r}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # [SECURITY] The key is fully server-generated: prefix from the validated
    # resource type, owner scoping from the session user, a random UUID, and
    # an extension derived from the validated content type. Client filenames
    # never reach the key, so collisions/overwrites/traversal are impossible.
    key = f"{resource_config.prefix}/{request.user.id}/{uuid.uuid4()}.{extension}"

    presigned = r2.generate_presigned_post(
        key,
        content_type,
        expires=r2.PRESIGNED_PUT_EXPIRES_SECONDS,
    )
    return Response(
        {
            "upload_url": presigned["url"],
            "fields": presigned["fields"],
            "key": key,
            "public_url": r2.public_url_for_key(key),
            "expires_in": r2.PRESIGNED_PUT_EXPIRES_SECONDS,
            "max_bytes": r2.MAX_UPLOAD_BYTES,
        }
    )


_JPEG_EXTENSIONS = {"jpg", "jpeg"}

# Non-JPEG image extensions that need server-side JPEG conversion.
_NEEDS_CONVERSION_EXTENSIONS = set(_IMAGE_CONTENT_TYPES.values()) - _JPEG_EXTENSIONS


def _needs_jpeg_conversion(key: str) -> bool:
    ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
    return ext in _NEEDS_CONVERSION_EXTENSIONS


@extend_schema(
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": "R2 key returned by presigned-url endpoint",
                },
                "image_id": {
                    "type": "string",
                    "format": "uuid",
                    "description": "Image UUID to rewrite after conversion (optional)",
                    "nullable": True,
                },
            },
            "required": ["key"],
        }
    },
    responses={
        202: {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "format": "uuid"},
                "needs_conversion": {"type": "boolean"},
            },
        },
        400: {"type": "object"},
        403: {"type": "object"},
        503: {"type": "object"},
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@traced
def r2_convert_image(request: Request) -> Response:
    """Enqueue a convert_image_to_jpeg task for an uploaded non-JPEG image.

    The client calls this immediately after the presigned PUT completes for
    any image whose key does not end in ``.jpg``/``.jpeg``. The returned
    ``task_id`` is polled via ``GET uploads/r2/convert-image/<task_id>/``.

    When ``needs_conversion`` is False (source is already JPEG) no task is
    created and ``task_id`` is None — the caller may use the original URL.
    """
    from ..models import AsyncTask
    from ..tasks import get_task_interface

    if not r2.is_r2_configured():
        return Response(
            {"detail": "Object storage is not configured on the server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    key = request.data.get("key")
    if not isinstance(key, str) or not key.strip():
        return Response(
            {"detail": "key is required."}, status=status.HTTP_400_BAD_REQUEST
        )
    key = key.strip()

    # [SECURITY] Only allow converting keys that belong to this user.
    user_prefix = f"images/{request.user.id}/"
    if not key.startswith(user_prefix):
        return Response(
            {"detail": "Key does not belong to your account."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if not _needs_jpeg_conversion(key):
        return Response({"task_id": None, "needs_conversion": False})

    image_id = request.data.get("image_id")
    task = AsyncTask.objects.create(  # type: ignore[misc]
        user=request.user,
        task_type="convert_image_to_jpeg",
        input_params={"key": key, "image_id": image_id},
    )
    get_task_interface().submit(task)
    return Response(
        {"task_id": str(task.id), "needs_conversion": True},
        status=status.HTTP_202_ACCEPTED,
    )


@extend_schema(
    responses={
        200: {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["pending", "running", "success", "failure"],
                },
                "result": {
                    "type": "object",
                    "nullable": True,
                    "properties": {
                        "url": {"type": "string"},
                        "key": {"type": "string"},
                        "width": {"type": "integer", "nullable": True},
                        "height": {"type": "integer", "nullable": True},
                    },
                },
                "error": {"type": "string", "nullable": True},
            },
        },
        404: {"type": "object"},
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@traced
def r2_convert_image_status(request: Request, task_id: str) -> Response:
    """Poll the status of a convert_image_to_jpeg task."""
    from django.shortcuts import get_object_or_404

    from ..models import AsyncTask

    task = get_object_or_404(
        AsyncTask, id=task_id, user=request.user, task_type="convert_image_to_jpeg"
    )
    result = task.result if task.status == AsyncTask.Status.SUCCESS else None
    return Response(
        {
            "status": task.status,
            "result": result,
            "error": task.error,
        }
    )


__all__ = ["r2_presigned_upload_url", "r2_convert_image", "r2_convert_image_status"]
