"""Resolver functions for piece operations.

These are the authoritative implementation layer. REST views and GraphQL
mutations both delegate to these functions.
"""

from __future__ import annotations

from django.core.exceptions import PermissionDenied
from django.http import Http404
from django.shortcuts import get_object_or_404

from ..serializers import (
    PieceCreateSerializer,
    PieceStateCreateSerializer,
    PieceStateUpdateSerializer,
    PieceUpdateSerializer,
)
from .helpers import (
    piece_detail_queryset,
    piece_queryset,
    serialize_piece_detail,
)


def resolve_piece_detail(piece_id: str, request) -> dict:
    """Returns serialized PieceDetail dict. Raises Http404 if not found."""
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece_id)
    return serialize_piece_detail(piece, request)


def resolve_create_piece(
    name: str,
    notes: str,
    request,
    current_location: str | None = None,
    thumbnail: str | None = None,
) -> dict:
    """Creates piece in entry state, returns serialized PieceDetail dict."""
    data: dict = {"name": name, "notes": notes}
    if current_location is not None:
        data["current_location"] = current_location
    if thumbnail is not None:
        data["thumbnail"] = thumbnail
    serializer = PieceCreateSerializer(
        data=data,
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    piece = serializer.save()
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece.pk)
    return serialize_piece_detail(piece, request)


def resolve_update_piece(piece_id: str, data: dict, request) -> dict:
    """Updates piece metadata, returns serialized PieceDetail dict."""
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    serializer = PieceUpdateSerializer(
        data=data, context={"request": request, "piece": piece}
    )
    serializer.is_valid(raise_exception=True)
    serializer.update(piece, serializer.validated_data)
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece_id)
    return serialize_piece_detail(piece, request)


def resolve_transition_piece(
    piece_id: str, target_state: str, notes: str | None, images: list | None, custom_fields: dict | None, request
) -> dict:
    """Transitions piece to new state, returns serialized PieceDetail dict."""
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    payload: dict = {"state": target_state}
    if notes is not None:
        payload["notes"] = notes
    if images is not None:
        payload["images"] = images
    if custom_fields:
        payload["custom_fields"] = custom_fields
    serializer = PieceStateCreateSerializer(data=payload, context={"piece": piece})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece_id)
    return serialize_piece_detail(piece, request)


def resolve_update_current_state(piece_id: str, data: dict, request) -> dict:
    """Updates current state fields, returns serialized PieceDetail dict."""
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    current = piece.current_state
    if current is None:
        raise Http404("Piece has no states.")
    serializer = PieceStateUpdateSerializer(current, data=data)
    serializer.is_valid(raise_exception=True)
    serializer.update(current, serializer.validated_data)
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece_id)
    return serialize_piece_detail(piece, request)


def resolve_update_past_state(
    piece_id: str, state_id: str, data: dict, request
) -> dict:
    """Updates a past (sealed) state, returns serialized PieceDetail dict."""
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    if not piece.is_editable:
        raise PermissionDenied("Piece is not in editable mode.")
    ps = get_object_or_404(piece.states, pk=state_id)
    serializer = PieceStateUpdateSerializer(ps, data=data)
    serializer.is_valid(raise_exception=True)
    serializer.update(ps, serializer.validated_data)
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece_id)
    return serialize_piece_detail(piece, request)


def resolve_delete_past_state(piece_id: str, state_id: str, request) -> dict:
    """Deletes a past state, returns serialized PieceDetail dict."""
    piece = get_object_or_404(piece_queryset(request), pk=piece_id)
    if not piece.is_editable:
        raise PermissionDenied("Piece is not in editable mode.")
    ps = get_object_or_404(piece.states, pk=state_id)
    if ps.state == "designed":
        raise PermissionDenied("Cannot delete the 'designed' state.")
    if piece.thumbnail:
        state_image_urls = {img["url"] for img in ps.images}
        if piece.thumbnail.url in state_image_urls:
            raise PermissionDenied(
                "Cannot delete a state that contains the current piece thumbnail."
            )
    ps.delete()
    piece = get_object_or_404(piece_detail_queryset(request), pk=piece_id)
    return serialize_piece_detail(piece, request)
