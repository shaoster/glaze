"""Resolver functions for global entry GraphQL mutations."""

from __future__ import annotations

from rest_framework.exceptions import ValidationError

from ..workflow import get_global_model_and_field, is_private_global
from .logic import (
    _FAVORITES_REGISTRY,
    global_entries_impl_with_resolvers,
    global_entry_favorite_impl,
)


def resolve_create_global(global_name: str, data: dict, request) -> dict:
    """Create a private global entry and return its serialized dict.

    ``data`` maps directly to what the REST POST body accepts:
    - Compose globals (e.g. glaze_combination): ``{"layers": [pk1, pk2]}``
    - Simple globals: ``{"field": "name", "value": "My Clay Body"}`` or
      ``{"values": {"name": "...", "color": "#abc"}}``
    """
    from django.test import RequestFactory
    from rest_framework.request import Request as DRFRequest

    # Build a synthetic DRF POST request carrying the data dict.
    factory = RequestFactory()
    raw = factory.post("/", data=data, content_type="application/json")
    raw.user = request.user

    # Wrap with DRF Request so .data, .user, etc. are available.
    drf_request = DRFRequest(raw)
    drf_request._full_data = data  # type: ignore[attr-defined]

    from ..workflow import (
        get_global_model_and_field,
        is_public_global,
    )

    response = global_entries_impl_with_resolvers(
        drf_request,
        global_name,
        resolve_global=get_global_model_and_field,
        public_global=is_public_global,
        private_global=is_private_global,
    )

    if response.status_code in (200, 201):
        return response.data
    detail = response.data.get("detail", "Failed to create global entry.")
    raise ValidationError(detail)


def resolve_add_favorite(global_name: str, pk: str, request) -> bool:
    """Add a global entry to the user's favorites. Returns True on success."""
    from django.test import RequestFactory
    from rest_framework.request import Request as DRFRequest

    model_cls, _, _ = get_global_model_and_field(global_name)
    fav_model_cls = _FAVORITES_REGISTRY.get(model_cls)
    if fav_model_cls is None:
        raise ValidationError(
            f"Global type '{global_name}' does not support favorites."
        )

    factory = RequestFactory()
    raw = factory.post("/")
    raw.user = request.user
    drf_request = DRFRequest(raw)

    response = global_entry_favorite_impl(drf_request, model_cls, fav_model_cls, pk)
    if response.status_code == 404:
        from django.http import Http404

        raise Http404
    return True


def resolve_remove_favorite(global_name: str, pk: str, request) -> bool:
    """Remove a global entry from the user's favorites. Returns True on success."""
    from django.test import RequestFactory
    from rest_framework.request import Request as DRFRequest

    model_cls, _, _ = get_global_model_and_field(global_name)
    fav_model_cls = _FAVORITES_REGISTRY.get(model_cls)
    if fav_model_cls is None:
        raise ValidationError(
            f"Global type '{global_name}' does not support favorites."
        )

    factory = RequestFactory()
    raw = factory.delete("/")
    raw.user = request.user
    drf_request = DRFRequest(raw)

    response = global_entry_favorite_impl(drf_request, model_cls, fav_model_cls, pk)
    if response.status_code == 404:
        from django.http import Http404

        raise Http404
    return True
