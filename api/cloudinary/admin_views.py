"""Admin-only Cloudinary maintenance endpoints."""

from django.http import StreamingHttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced


@extend_schema(
    methods=["GET"],
    responses={
        200: {
            "type": "object",
            "properties": {
                "assets": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "public_id": {"type": "string"},
                            "cloud_name": {"type": "string"},
                            "path_prefix": {"type": ["string", "null"]},
                            "url": {"type": "string"},
                            "thumbnail_url": {"type": "string"},
                            "bytes": {"type": ["integer", "null"]},
                            "created_at": {"type": ["string", "null"]},
                            "referenced": {"type": "boolean"},
                        },
                    },
                },
                "summary": {
                    "type": "object",
                    "properties": {
                        "total": {"type": "integer"},
                        "referenced": {"type": "integer"},
                        "unused": {"type": "integer"},
                        "referenced_breakdown": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "key": {"type": "string"},
                                    "label": {"type": "string"},
                                    "count": {"type": "integer"},
                                },
                            },
                        },
                        "reference_warnings": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                },
            },
        },
        503: {"type": "object"},
    },
)
@extend_schema(
    methods=["DELETE"],
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "public_ids": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["public_ids"],
        }
    },
    responses={
        200: {"type": "object"},
        400: {"type": "object"},
        503: {"type": "object"},
    },
)
@api_view(["GET", "DELETE"])
@permission_classes([IsAdminUser])
@traced
def admin_cloudinary_cleanup(request: Request) -> Response:
    """List or delete Cloudinary assets for admin cleanup."""
    from .cloudinary_cleanup import (
        delete_cloudinary_assets,
        list_cloudinary_assets,
        summarize_referenced_public_ids,
    )

    if request.method == "GET":
        try:
            assets = list_cloudinary_assets()
        except ValueError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        unused = [asset for asset in assets if not asset.referenced]
        referenced_breakdown = summarize_referenced_public_ids(
            {asset.public_id for asset in assets}
        )
        return Response(
            {
                "assets": [
                    {
                        "public_id": asset.public_id,
                        "cloud_name": asset.cloud_name,
                        "path_prefix": asset.path_prefix,
                        "url": asset.url,
                        "thumbnail_url": asset.thumbnail_url,
                        "bytes": asset.bytes,
                        "created_at": asset.created_at,
                    }
                    for asset in unused
                ],
                "summary": {
                    "total": len(assets),
                    "referenced": len(assets) - len(unused),
                    "unused": len(unused),
                    "referenced_breakdown": [
                        {
                            "key": source.key,
                            "label": source.label,
                            "count": source.count,
                        }
                        for source in referenced_breakdown.sources
                    ],
                    "reference_warnings": referenced_breakdown.warnings,
                },
            }
        )

    public_ids = request.data.get("public_ids")
    if not isinstance(public_ids, list) or not all(
        isinstance(public_id, str) and public_id for public_id in public_ids
    ):
        return Response(
            {"detail": "public_ids must be a non-empty list of strings."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        deleted = delete_cloudinary_assets(public_ids)
    except ValueError as exc:
        message = str(exc)
        service_unavailable_messages = {
            "Cloudinary is not configured on the server.",
            "Unable to delete Cloudinary assets.",
        }
        response_status: int = status.HTTP_400_BAD_REQUEST
        if message in service_unavailable_messages:
            response_status = status.HTTP_503_SERVICE_UNAVAILABLE
        return Response({"detail": message}, status=response_status)

    return Response({"deleted": deleted})


@extend_schema(
    parameters=[
        OpenApiParameter(
            name="unreferenced_only",
            type=bool,
            location=OpenApiParameter.QUERY,
            description="Restrict the archive to assets not referenced by PotterDoc. Defaults to false (all assets).",
        ),
    ],
    responses={
        200: {"type": "string", "format": "binary"},
        503: {"type": "object"},
    },
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
@traced
def admin_cloudinary_cleanup_archive(
    request: Request,
) -> StreamingHttpResponse | Response:
    """Download a ZIP archive of Cloudinary assets for admin cleanup."""
    from .cloudinary_cleanup import (
        list_cloudinary_assets,
        stream_cloudinary_cleanup_archive,
    )

    unreferenced_only = request.query_params.get("unreferenced_only", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    try:
        # list_cloudinary_assets does synchronous network I/O; run in a thread.
        assets = list_cloudinary_assets()
    except ValueError as exc:
        return Response(
            {"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    selected = [a for a in assets if not a.referenced] if unreferenced_only else assets
    filename = (
        "cloudinary-unreferenced-images.zip"
        if unreferenced_only
        else "cloudinary-all-images.zip"
    )
    # stream_cloudinary_cleanup_archive is an async generator (AsyncIterator).
    # Django's StreamingHttpResponse in ASGI mode handles this correctly without warnings.
    response = StreamingHttpResponse(
        stream_cloudinary_cleanup_archive(selected),
        content_type="application/zip",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["Cache-Control"] = "no-store"
    response["X-Accel-Buffering"] = "no"
    return response
