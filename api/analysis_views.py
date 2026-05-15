# ruff: noqa: F401
import hashlib
import json
import os
import re
from collections import defaultdict
from typing import Callable

from django.apps import apps
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import DateTimeField, OuterRef, Q, Subquery
from django.db.models.functions import Coalesce, Greatest
from django.http import StreamingHttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import (
    AsyncTask,
    FavoriteGlazeCombination,
    GlazeCombination,
    Piece,
    PieceState,
    UserProfile,
)
from .serializer_registry import (
    _GLOBAL_ENTRY_SERIALIZERS,  # auto-generated in _register_globals(); hand-written serializers overwrite
)
from .serializers import (
    AsyncTaskSerializer,
    AuthUserSerializer,
    GlazeCombinationImageEntrySerializer,
    GoogleAuthSerializer,
    LoginSerializer,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceStateCreateSerializer,
    PieceStateSerializer,
    PieceStateUpdateSerializer,
    PieceSummarySerializer,
    PieceUpdateSerializer,
    RegisterSerializer,
    TaskSubmissionSerializer,
)
from .utils import bootstrap_dev_user
from .workflow import (
    get_glaze_image_qualifying_states,
    get_global_model_and_field,
    get_states_with_native_global_ref,
    is_private_global,
    is_public_global,
)


@extend_schema(
    methods=["GET"],
    responses={200: GlazeCombinationImageEntrySerializer(many=True)},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def glaze_combination_images(request: Request) -> Response:
    """Return images from pieces grouped by the glaze combination applied.

    Only includes combinations for which at least one qualifying piece state
    (glazed, glaze_fired, completed — derived from workflow.yml) has images.
    Each piece appears once, with images aggregated from all qualifying states.
    Pieces are sorted by last_modified descending within each combination;
    combinations are sorted by the most-recently-modified qualifying piece.

    Results are scoped to the requesting user's pieces only.
    """
    qualifying = get_glaze_image_qualifying_states()

    # Resolve the GlazeCombination junction model generated at import time.
    GlazeCombinationRef = apps.get_model("api", "PieceStateGlazeCombinationRef")

    # Collect the latest (piece_id → combo_id) mapping for this user's pieces.
    # Current states such as "completed" may not carry their own junction row, so
    # use the most recent state that does. Filter by native_states to ensure
    # we don't pick up stale junction rows inadvertently written to states
    # that inherit their combination via a $ref (e.g. glaze_fired).
    native_states = get_states_with_native_global_ref("glaze_combination")
    refs = (
        GlazeCombinationRef.objects.filter(
            piece_state__piece__user=request.user,
            piece_state__piece__is_editable=False,
            piece_state__state__in=native_states,
        )
        .values("piece_state__piece_id", "glaze_combination_id")
        .order_by("piece_state__piece_id", "-piece_state__created")
    )
    piece_to_combo: dict = {}
    for ref in refs:
        piece_id = ref["piece_state__piece_id"]
        if piece_id in piece_to_combo:
            continue
        combo_id = ref["glaze_combination_id"]
        piece_to_combo[piece_id] = combo_id

    if not piece_to_combo:
        return Response([])

    # Fetch qualifying PieceState records that have at least one image.
    qualifying_ps = (
        PieceState.objects.filter(
            piece_id__in=piece_to_combo.keys(),
            piece__user=request.user,  # type: ignore[misc]
            piece__is_editable=False,
            state__in=qualifying,
            image_links__isnull=False,
        )
        .select_related("piece")
        .prefetch_related("image_links__image")
        .distinct()
        .order_by("-created")
    )

    # Group images and state by piece — collect all images across qualifying states.
    piece_data: dict = {}
    for ps in qualifying_ps:
        images = [
            {
                "url": link.image.url,
                "caption": link.caption,
                "created": link.created,
                "cloudinary_public_id": link.image.cloudinary_public_id,
                "cloud_name": link.image.cloud_name,
            }
            for link in ps.image_links.all()
        ]
        if not images:
            continue
        pid = ps.piece_id
        if pid not in piece_data:
            piece_data[pid] = {
                "id": str(pid),
                "name": ps.piece.name,
                "state": ps.state,
                "images": images,
                "last_modified": ps.last_modified,
            }
        else:
            # Additional qualifying state for the same piece: extend images.
            # The first row is the current/latest qualifying state by creation
            # order; sealed old states do not affect display state or sort order.
            piece_data[pid]["images"].extend(images)

    # Group pieces by combo.
    combo_pieces: dict = defaultdict(list)
    for pid, data in piece_data.items():
        combo_id = piece_to_combo.get(pid)
        if combo_id is not None:
            combo_pieces[combo_id].append(data)

    # Sort pieces within each combo by last_modified descending.
    for combo_id in combo_pieces:
        combo_pieces[combo_id].sort(key=lambda d: d["last_modified"], reverse=True)

    # Sort combos by the most-recently-modified qualifying piece.
    def _combo_latest(combo_id):
        pieces = combo_pieces.get(combo_id, [])
        if not pieces:
            return None
        return max(d["last_modified"] for d in pieces)

    sorted_combo_ids = sorted(combo_pieces.keys(), key=_combo_latest, reverse=True)

    # Bulk-fetch GlazeCombination objects for serialization.
    combos_qs = GlazeCombination.objects.filter(
        pk__in=sorted_combo_ids
    ).prefetch_related("layers__glaze_type", "firing_temperature")
    combo_by_id = {c.pk: c for c in combos_qs}

    favorite_ids = FavoriteGlazeCombination.get_favorite_ids_for(request.user)
    ctx = {"request": request, "favorite_ids": favorite_ids}

    result = []
    for combo_id in sorted_combo_ids:
        combo = combo_by_id.get(combo_id)
        if combo is None:
            continue
        pieces_payload = [
            {
                "id": d["id"],
                "name": d["name"],
                "state": d["state"],
                "images": d["images"],
            }
            for d in combo_pieces[combo_id]
        ]
        result.append(
            {
                # Pass the model instance so the nested GlazeCombinationEntrySerializer
                # can serialize it properly (it expects obj.pk, obj.layers, etc.).
                # Context (favorite_ids) propagates from the top-level serializer.
                "glaze_combination": combo,
                "pieces": pieces_payload,
            }
        )

    return Response(
        GlazeCombinationImageEntrySerializer(result, many=True, context=ctx).data
    )
