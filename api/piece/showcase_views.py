"""Piece-scoped Showcase video API endpoints."""

from __future__ import annotations

from typing import Any, cast

from django.contrib.auth.models import User
from django.db.models import Exists, OuterRef
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..models import AsyncTask, Piece, PieceStateImage
from ..showcase import (
    SHOWCASE_VIDEO_RENDER_VERSION,
    build_keepsake_storyboard,
    compute_piece_input_hash,
    is_showcase_video_storage_enabled,
)
from ..showcase.render import SHOWCASE_VIDEO_TASK_TYPE
from ..tasks import get_task_interface
from ..workflow import TERMINAL_STATES
from .helpers import _current_state_name_subquery


class ShowcaseVideoRequestSerializer(drf_serializers.Serializer):
    excluded_image_keys = drf_serializers.ListField(
        child=drf_serializers.CharField(),
        required=False,
        default=list,
    )
    excluded_note_keys = drf_serializers.ListField(
        child=drf_serializers.CharField(),
        required=False,
        default=list,
    )
    music_track_id = drf_serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=None
    )


class ShowcaseVideoArtifactSerializer(drf_serializers.Serializer):
    url = drf_serializers.CharField()
    download_url = drf_serializers.CharField()
    filename = drf_serializers.CharField()
    content_type = drf_serializers.CharField()


class ShowcaseVideoStatusSerializer(drf_serializers.Serializer):
    piece_id = drf_serializers.UUIDField()
    task_id = drf_serializers.UUIDField(allow_null=True, required=False)
    status = drf_serializers.CharField()
    task_status = drf_serializers.CharField(allow_null=True, required=False)
    enabled = drf_serializers.BooleanField()
    disabled_reason = drf_serializers.CharField(allow_null=True, required=False)
    eligible = drf_serializers.BooleanField()
    current_input_hash = drf_serializers.CharField(allow_null=True, required=False)
    stored_input_hash = drf_serializers.CharField(allow_null=True, required=False)
    is_stale = drf_serializers.BooleanField()
    stale_reason = drf_serializers.CharField(allow_null=True, required=False)
    music_track_id = drf_serializers.CharField(allow_null=True, required=False)
    storyboard = drf_serializers.JSONField(allow_null=True, required=False)
    artifact = ShowcaseVideoArtifactSerializer(allow_null=True, required=False)
    error = drf_serializers.CharField(allow_null=True, required=False)
    progress = drf_serializers.IntegerField(required=False, default=0)


def _latest_showcase_task(piece: Piece) -> AsyncTask | None:
    return (
        AsyncTask.objects.filter(
            user=piece.user,
            task_type=SHOWCASE_VIDEO_TASK_TYPE,
            input_params__piece_id=str(piece.id),
        )
        .order_by("-created")
        .first()
    )


def _video_disabled_reason() -> str | None:
    if is_showcase_video_storage_enabled():
        return None
    return "Showcase video object storage is not configured."


def _status_payload(
    *,
    piece: Piece,
    task: AsyncTask | None,
    current_input_hash: str | None,
    eligible: bool,
    music_track_id: str | None,
    storyboard: dict | None = None,
    request: Request,
) -> dict:
    enabled = is_showcase_video_storage_enabled()
    disabled_reason = _video_disabled_reason()
    task_data = task.input_params if task is not None else {}
    stored_input_hash = None
    stored_excluded_image_keys: list[str] = []
    stored_excluded_note_keys: list[str] = []
    if isinstance(task_data, dict):
        stored_input_hash = task_data.get("input_hash")
        stored_excluded_image_keys = task_data.get("excluded_image_keys") or []
        stored_excluded_note_keys = task_data.get("excluded_note_keys") or []

    artifact = None
    task_status = None
    error = None
    status_label = "idle"
    task_id = None
    is_stale = False
    stale_reason = None

    if task is not None:
        task_id = task.id
        task_status = task.status
        error = task.error
        if task.status == AsyncTask.Status.PENDING:
            status_label = "pending"
        elif task.status == AsyncTask.Status.RUNNING:
            status_label = "running"
        elif task.status == AsyncTask.Status.FAILURE:
            status_label = "failed"
        else:
            status_label = "succeeded"

        if task.status == AsyncTask.Status.SUCCESS and stored_input_hash:
            is_stale = stored_input_hash != current_input_hash
            if is_stale:
                status_label = "stale-needs-regeneration"
                stale_reason = "The piece has changed since this video was rendered."

        if task.status == AsyncTask.Status.SUCCESS:
            result = task.result if isinstance(task.result, dict) else {}
            artifact = {
                "url": result.get("artifact_url"),
                "download_url": result.get("download_url"),
                "filename": result.get("artifact_filename")
                or f"{current_input_hash}.mp4",
                "content_type": result.get("content_type") or "video/mp4",
            }
    elif not enabled:
        status_label = "disabled"

    return {
        "piece_id": piece.id,
        "task_id": task_id,
        "status": status_label,
        "task_status": task_status,
        "enabled": enabled,
        "disabled_reason": disabled_reason,
        "eligible": eligible,
        "current_input_hash": current_input_hash,
        "stored_input_hash": stored_input_hash,
        "is_stale": is_stale,
        "stale_reason": stale_reason,
        "music_track_id": music_track_id,
        "excluded_image_keys": stored_excluded_image_keys,
        "excluded_note_keys": stored_excluded_note_keys,
        "storyboard": storyboard,
        "artifact": artifact,
        "error": error,
        "progress": task.progress if task is not None else 0,
    }


@extend_schema(
    methods=["GET"],
    responses={200: ShowcaseVideoStatusSerializer},
    description=(
        "Return the most recent showcase video task for the piece, including "
        "stale-input detection and artifact metadata."
    ),
)
@extend_schema(
    methods=["POST"],
    request=ShowcaseVideoRequestSerializer,
    responses={202: ShowcaseVideoStatusSerializer},
    description=(
        "Submit a Keepsake showcase video render. The request is enqueued on "
        "the AsyncTask framework so the browser never blocks on rendering. "
        "If a successful render with an identical input hash already exists, "
        "the existing task is returned without re-enqueuing."
    ),
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@traced
def piece_showcase_video(request: Request, piece_id: str) -> Response:
    if request.method == "GET":
        # Minimal queryset — no states/images/tags fetched into Python.
        # current_state_name and has_images are computed as SQL subqueries so
        # lightweight eligibility can be reported without an extra round-trip.
        user_id = request.user.id
        assert user_id is not None
        piece: Piece
        try:
            piece = (
                Piece.objects.filter(user_id=user_id)
                .select_related("thumbnail", "user__profile")
                .annotate(
                    current_state_name=_current_state_name_subquery(),
                    has_images=Exists(
                        PieceStateImage.objects.filter(
                            piece_state__piece=OuterRef("pk")
                        )
                    ),
                )
                .get(pk=piece_id)
            )
        except Piece.DoesNotExist:
            raise Http404

        task = _latest_showcase_task(piece)
        current_input_hash: str | None = None
        task_music_track_id: str | None = None

        if task is not None:
            task_input = cast(dict[str, Any], task.input_params or {})
            excluded_image_keys = task_input.get("excluded_image_keys") or []
            excluded_note_keys = task_input.get("excluded_note_keys") or []
            task_music_track_id = task_input.get("music_track_id")
            current_input_hash = compute_piece_input_hash(
                piece.id,
                excluded_image_keys,
                excluded_note_keys,
                task_music_track_id,
            )

        eligible = bool(
            getattr(piece, "has_images", False)
            and getattr(piece, "current_state_name", None) in TERMINAL_STATES
        )

        payload = _status_payload(
            piece=piece,
            task=task,
            current_input_hash=current_input_hash,
            eligible=eligible,
            music_track_id=task_music_track_id,
            request=request,
        )
        return Response(payload)

    # POST — full queryset with states+images for build_keepsake_storyboard.
    post_user_id = request.user.id
    assert post_user_id is not None
    try:
        piece = (
            Piece.objects.filter(user_id=post_user_id)
            .select_related("thumbnail", "user__profile")
            .prefetch_related("states__image_links__image")
            .get(pk=piece_id)
        )
    except Piece.DoesNotExist:
        raise Http404

    serializer = ShowcaseVideoRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    if not is_showcase_video_storage_enabled():
        return Response(
            {"detail": ("Showcase video object storage is not configured.")},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    if piece.current_state is None:
        return Response(
            {"detail": "Piece has no states."}, status=status.HTTP_400_BAD_REQUEST
        )
    if piece.current_state.state not in TERMINAL_STATES:
        return Response(
            {"detail": "Piece must be in a terminal state to generate a video."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    excluded_image_keys = list(serializer.validated_data["excluded_image_keys"])
    excluded_note_keys = list(serializer.validated_data["excluded_note_keys"])
    req_music_track_id: str | None = serializer.validated_data["music_track_id"]

    input_hash = compute_piece_input_hash(
        piece.id,
        excluded_image_keys,
        excluded_note_keys,
        req_music_track_id,
    )

    # No-op: return the existing task when a successful render with the same
    # inputs already exists so the UI "Regenerate" button is always safe to call.
    existing_task = (
        AsyncTask.objects.filter(
            user=cast(User, request.user),
            task_type=SHOWCASE_VIDEO_TASK_TYPE,
            input_params__piece_id=str(piece.id),
            input_params__input_hash=input_hash,
            status=AsyncTask.Status.SUCCESS,
        )
        .order_by("-created")
        .first()
    )
    if existing_task is not None:
        existing_input = cast(dict[str, Any], existing_task.input_params or {})
        storyboard = existing_input.get("storyboard")
        payload = _status_payload(
            piece=piece,
            task=existing_task,
            current_input_hash=input_hash,
            eligible=True,
            music_track_id=req_music_track_id,
            storyboard=storyboard if isinstance(storyboard, dict) else None,
            request=request,
        )
        return Response(payload)

    storyboard_obj = build_keepsake_storyboard(
        piece,
        excluded_image_keys=excluded_image_keys,
        excluded_note_keys=excluded_note_keys,
        music_track_id=req_music_track_id,
    )
    if not storyboard_obj.eligible:
        return Response(
            {"detail": storyboard_obj.ineligible_reason or "Piece is ineligible."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    storyboard = storyboard_obj.to_dict()
    task = AsyncTask.objects.create(
        user=cast(User, request.user),
        task_type=SHOWCASE_VIDEO_TASK_TYPE,
        input_params={
            "piece_id": str(piece.id),
            "excluded_image_keys": excluded_image_keys,
            "excluded_note_keys": excluded_note_keys,
            "music_track_id": req_music_track_id,
            "input_hash": input_hash,
            "storyboard": storyboard,
            "render_version": SHOWCASE_VIDEO_RENDER_VERSION,
        },
    )
    get_task_interface().submit(task)

    payload = _status_payload(
        piece=piece,
        task=task,
        current_input_hash=input_hash,
        eligible=True,
        music_track_id=req_music_track_id,
        storyboard=storyboard,
        request=request,
    )
    return Response(payload, status=status.HTTP_202_ACCEPTED)
