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
                "key": {"type": "string"},
                "public_url": {"type": "string"},
                "expires_in": {"type": "integer"},
            },
            "required": ["upload_url", "key", "public_url", "expires_in"],
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

    upload_url = r2.generate_presigned_put(
        key,
        content_type,
        expires=r2.PRESIGNED_PUT_EXPIRES_SECONDS,
    )
    return Response(
        {
            "upload_url": upload_url,
            "key": key,
            "public_url": r2.public_url_for_key(key),
            "expires_in": r2.PRESIGNED_PUT_EXPIRES_SECONDS,
        }
    )


__all__ = ["r2_presigned_upload_url"]
