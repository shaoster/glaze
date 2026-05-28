"""Compatibility and factory helpers for global entry endpoints.

Public functions in this module are traced so the stable import surface and
route factories remain observable while implementation details live in the
shared logic module.
"""

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..serializer_registry import _GLOBAL_ENTRY_SERIALIZERS
from ..workflow import get_global_model_and_field
from .logic import (
    _FAVORITES_REGISTRY,
    _GLOBAL_CREATE_REQUEST_SCHEMA,
    _GLOBAL_ENTRY_SCHEMA,
)
from .logic import (
    global_entries_impl as _global_entries_impl,
)
from .logic import (
    global_entry_favorite_impl as _global_entry_favorite_impl,
)


@traced
def make_global_entry_view(global_name: str):
    """Return a fully-annotated view function for the given global type.

    The GET response schema is derived from _GLOBAL_ENTRY_SERIALIZERS: globals
    with a registered serializer get that serializer's schema; all others get
    the generic {id, name, is_public} schema.  This means extend_schema accuracy
    is mechanically guaranteed by the same registry that drives view behavior —
    adding a richer serializer for a new global requires only one registry entry.
    """
    model_cls, _, _ = get_global_model_and_field(global_name)
    entry_serializer_cls = _GLOBAL_ENTRY_SERIALIZERS.get(model_cls)

    get_responses: dict = (
        {200: entry_serializer_cls(many=True)}
        if entry_serializer_cls is not None
        else {200: {"type": "array", "items": _GLOBAL_ENTRY_SCHEMA}}
    )

    @extend_schema(responses=get_responses, methods=["GET"])
    @extend_schema(
        request=_GLOBAL_CREATE_REQUEST_SCHEMA,
        responses={200: _GLOBAL_ENTRY_SCHEMA, 201: _GLOBAL_ENTRY_SCHEMA},
        methods=["POST"],
    )
    @api_view(["GET", "POST"])
    @permission_classes([IsAuthenticated])
    def view(request: Request) -> Response:
        return _global_entries_impl(request, global_name)

    view.__name__ = f"global_entries_{global_name}"  # type: ignore[attr-defined]
    view.__qualname__ = f"global_entries_{global_name}"  # type: ignore[attr-defined]
    return view


@traced
def make_global_entry_favorite_view(global_name: str):
    """Return an annotated POST/DELETE favorite-toggle view for the given global.

    Only called for globals whose model is in _FAVORITES_REGISTRY; the URL is only
    registered for those globals, so non-favoritable types return 404 (no route)
    rather than 405.
    """
    model_cls, _, _ = get_global_model_and_field(global_name)
    fav_model_cls = _FAVORITES_REGISTRY[model_cls]

    @extend_schema(methods=["POST"], request=None, responses={204: None, 404: None})
    @extend_schema(methods=["DELETE"], request=None, responses={204: None, 404: None})
    @api_view(["POST", "DELETE"])
    @permission_classes([IsAuthenticated])
    def view(request: Request, pk: str) -> Response:
        return _global_entry_favorite_impl(request, model_cls, fav_model_cls, pk)

    view.__name__ = f"global_entry_favorite_{global_name}"  # type: ignore[attr-defined]
    view.__qualname__ = f"global_entry_favorite_{global_name}"  # type: ignore[attr-defined]
    return view
