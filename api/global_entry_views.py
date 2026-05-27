"""Compatibility views for global entry endpoints.

The implementation lives in ``api.global_entry_logic`` so this module can stay
focused on view factories and preserve the public import surface.
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .global_entry_logic import (
    _FAVORITES_REGISTRY,
    _GLOBAL_CREATE_REQUEST_SCHEMA,
    _GLOBAL_ENTRY_SCHEMA,
    _apply_global_filters,
    _global_entry_favorite_impl,
    get_global_model_and_field,
    is_private_global,
    is_public_global,
)
from .global_entry_logic import (
    _global_entries_impl_with_resolvers as _global_entries_impl_logic,
)


def _global_entries_impl(request: Request, global_name: str) -> Response:
    return _global_entries_impl_logic(
        request,
        global_name,
        resolve_global=get_global_model_and_field,
        public_global=is_public_global,
        private_global=is_private_global,
    )


def make_global_entry_view(global_name: str):
    """Return a fully-annotated view function for the given global type."""
    from drf_spectacular.utils import extend_schema

    model_cls, _, _ = get_global_model_and_field(global_name)
    from .serializer_registry import _GLOBAL_ENTRY_SERIALIZERS

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


def make_global_entry_favorite_view(global_name: str):
    """Return an annotated POST/DELETE favorite-toggle view for the given global."""
    from drf_spectacular.utils import extend_schema

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


__all__ = [
    "_FAVORITES_REGISTRY",
    "_apply_global_filters",
    "_global_entries_impl",
    "get_global_model_and_field",
    "is_private_global",
    "is_public_global",
    "make_global_entry_favorite_view",
    "make_global_entry_view",
]
