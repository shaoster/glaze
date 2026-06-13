from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import JSONParser
from rest_framework.permissions import IsAdminUser
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced


@extend_schema(
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "records": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "client_id": {"type": "string"},
                            "filename": {"type": "string"},
                            "reviewed": {"type": "boolean"},
                            "r2_key": {"type": "string"},
                            "parsed_fields": {"type": "object"},
                        },
                        "required": ["client_id", "reviewed", "r2_key"],
                    },
                },
            },
            "required": ["records"],
        }
    },
    responses={200: {"type": "object"}},
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([JSONParser])
@traced
def admin_manual_square_crop_import(request: Request) -> Response:
    """Import reviewed manual square crop records from a JSON payload."""
    from .manual_tile_imports import import_manual_tile_records

    records = request.data.get("records")
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
        r2_key = record.get("r2_key", "")
        if r2_key:
            uploaded_files[client_id] = r2_key

    try:
        result = import_manual_tile_records(records, uploaded_files)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result)
