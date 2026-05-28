import json

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced


@extend_schema(
    request={
        "multipart/form-data": {
            "type": "object",
            "properties": {
                "payload": {"type": "string"},
            },
            "required": ["payload"],
        }
    },
    responses={200: {"type": "object"}},
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
@traced
def admin_manual_square_crop_import(request: Request) -> Response:
    """Import reviewed manual square crop records from a multipart payload."""
    from .manual_tile_imports import import_manual_tile_records

    payload_raw = request.data.get("payload", "")
    if not payload_raw:
        return Response(
            {"detail": "payload is required."}, status=status.HTTP_400_BAD_REQUEST
        )
    try:
        payload = json.loads(payload_raw)
    except json.JSONDecodeError:
        return Response(
            {"detail": "payload must be valid JSON."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return Response(
            {"detail": "payload.records must be a non-empty list."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if any(not record.get("reviewed") for record in records):
        return Response(
            {"detail": "All records must be reviewed before import."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    uploaded_files = {}
    for record in records:
        client_id = record.get("client_id", "")
        if not client_id:
            return Response(
                {"detail": "Each record must include client_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        file_obj = request.FILES.get(f"crop_image__{client_id}")
        if file_obj is not None:
            uploaded_files[client_id] = file_obj

    try:
        result = import_manual_tile_records(records, uploaded_files)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result)
