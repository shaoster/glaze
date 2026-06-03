"""Piece-scoped Showcase video API endpoints."""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..models import AsyncTask, Piece
from ..showcase import (
    build_keepsake_storyboard,
    compute_storyboard_hash,
    is_showcase_video_cloudinary_enabled,
    SHOWCASE_VIDEO_RENDER_VERSION,
)
from ..showcase.render import SHOWCASE_VIDEO_TASK_TYPE
from ..tasks import get_task_interface
from ..workflow import TERMINAL_STATES
from .helpers import piece_queryset


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


def _piece_with_showcase_prefetch(request: Request, piece_id: str) -> Piece:
    return get_object_or_404(
        piece_queryset(request).prefetch_related("states__image_links__image"),
        pk=piece_id,
    )


def _requested_storyboard(piece: Piece, request_data: dict | None) -> dict:
    payload = request_data or {}
    excluded_image_keys = payload.get("excluded_image_keys") or []
    excluded_note_keys = payload.get("excluded_note_keys") or []
    music_track_id = payload.get("music_track_id")
    storyboard = build_keepsake_storyboard(
        piece,
        excluded_image_keys=excluded_image_keys,
        excluded_note_keys=excluded_note_keys,
        music_track_id=music_track_id,
    )
    return storyboard.to_dict()


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
    if is_showcase_video_cloudinary_enabled():
        return None
    return "Cloudinary showcase video uploads are not configured."


def _status_payload(
    *,
    piece: Piece,
    task: AsyncTask | None,
    storyboard: dict,
    current_input_hash: str,
    request: Request,
) -> dict:
    enabled = is_showcase_video_cloudinary_enabled()
    disabled_reason = _video_disabled_reason()
    task_data = task.input_params if task is not None else {}
    stored_input_hash = None
    if isinstance(task_data, dict):
        stored_input_hash = task_data.get("input_hash")

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
                stale_reason = (
                    "The piece has changed since this video was rendered."
                )

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
        "eligible": storyboard.get("eligible", False),
        "current_input_hash": current_input_hash,
        "stored_input_hash": stored_input_hash,
        "is_stale": is_stale,
        "stale_reason": stale_reason,
        "music_track_id": storyboard.get("music_track_id"),
        "storyboard": storyboard,
        "artifact": artifact,
        "error": error,
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
        "the AsyncTask framework so the browser never blocks on rendering."
    ),
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@traced
def piece_showcase_video(request: Request, piece_id: str) -> Response:
    piece = _piece_with_showcase_prefetch(request, piece_id)

    if request.method == "GET":
        task = _latest_showcase_task(piece)
        if task is None:
            storyboard = _requested_storyboard(piece, None)
            current_input_hash = compute_storyboard_hash(storyboard)
        else:
            task_input = task.input_params if isinstance(task.input_params, dict) else {}
            storyboard = task_input.get("storyboard")
            if not isinstance(storyboard, dict):
                storyboard = _requested_storyboard(piece, task_input)
            current_storyboard = _requested_storyboard(piece, task_input)
            current_input_hash = compute_storyboard_hash(current_storyboard)
        payload = _status_payload(
            piece=piece,
            task=task,
            storyboard=storyboard,
            current_input_hash=current_input_hash,
            request=request,
        )
        return Response(payload)

    serializer = ShowcaseVideoRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    if not is_showcase_video_cloudinary_enabled():
        return Response(
            {
                "detail": (
                    "Cloudinary showcase video uploads are not configured."
                )
            },
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

    storyboard_obj = build_keepsake_storyboard(
        piece,
        excluded_image_keys=serializer.validated_data["excluded_image_keys"],
        excluded_note_keys=serializer.validated_data["excluded_note_keys"],
        music_track_id=serializer.validated_data["music_track_id"],
    )
    if not storyboard_obj.eligible:
        return Response(
            {"detail": storyboard_obj.ineligible_reason or "Piece is ineligible."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    storyboard = storyboard_obj.to_dict()
    input_hash = compute_storyboard_hash(storyboard)
    task = AsyncTask.objects.create(
        user=request.user,
        task_type=SHOWCASE_VIDEO_TASK_TYPE,
        input_params={
            "piece_id": str(piece.id),
            "excluded_image_keys": serializer.validated_data["excluded_image_keys"],
            "excluded_note_keys": serializer.validated_data["excluded_note_keys"],
            "music_track_id": serializer.validated_data["music_track_id"],
            "input_hash": input_hash,
            "storyboard": storyboard,
            "render_version": SHOWCASE_VIDEO_RENDER_VERSION,
        },
    )
    get_task_interface().submit(task)

    payload = _status_payload(
        piece=piece,
        task=task,
        storyboard=storyboard,
        current_input_hash=input_hash,
        request=request,
    )
    return Response(payload, status=status.HTTP_202_ACCEPTED)
