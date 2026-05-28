"""User data export endpoint for the Glaze API."""

from django.http import StreamingHttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from backend.otel import traced

from .auth_export_archive import _stream_export_archive
from .auth_export_data import _collect_export_data


@extend_schema(
    request=None,
    responses={200: None},
    description=(
        "Download a ZIP archive of all the current user's data: "
        "pieces.json (full piece history as JSON), profile.json (alias and preferences), "
        "and images/ (Cloudinary-backed images). Download this before deleting your account."
    ),
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
@traced
def auth_export(request: Request) -> StreamingHttpResponse:
    """Download a ZIP archive of the current user's data."""
    pieces_json, profile_json, images = _collect_export_data(request.user, request)
    response = StreamingHttpResponse(
        _stream_export_archive(pieces_json, profile_json, images),
        content_type="application/zip",
    )
    response["Content-Disposition"] = 'attachment; filename="potterdoc-export.zip"'
    response["Cache-Control"] = "no-store"
    response["X-Accel-Buffering"] = "no"
    return response
