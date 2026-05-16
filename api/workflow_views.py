from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .workflow import build_ui_schema


@extend_schema(responses={200: Any})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def workflow_state_schema(request: Request, state_id: str) -> Response:
    """Return the UI-enhanced JSON Schema for a given workflow state."""
    schema = build_ui_schema(state_id)
    return Response(schema)
