from typing import cast

from django.contrib.auth.models import User
from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from api.models import SupportMessage, SupportThread
from backend.otel import traced

from .serializers import (
    SupportContactCreateSerializer,
    SupportContactEnvelopeSerializer,
)


def _support_thread_queryset():
    return SupportThread.objects.prefetch_related("messages__author")


def _current_support_thread(user) -> SupportThread | None:
    return (
        _support_thread_queryset()
        .filter(user=user)
        .order_by("is_closed", "-last_message_at", "-created")
        .first()
    )


def _subject_from_body(body: str) -> str:
    subject = " ".join(body.split())
    if len(subject) <= 80:
        return subject
    return subject[:77].rstrip() + "..."


def _serialize_thread(thread: SupportThread | None) -> dict:
    return SupportContactEnvelopeSerializer(
        {"thread": thread}, context={"thread": thread}
    ).data


@extend_schema(
    methods=["GET"],
    request=None,
    responses={200: SupportContactEnvelopeSerializer},
    description="Return the current authenticated user's support thread.",
)
@extend_schema(
    methods=["POST"],
    request=SupportContactCreateSerializer,
    responses={201: SupportContactEnvelopeSerializer},
    description="Append a new support message and return the updated thread.",
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@traced
def support_contact(request: Request) -> Response:
    if request.method == "GET":
        return Response(_serialize_thread(_current_support_thread(request.user)))

    support_user = cast(User, request.user)
    serializer = SupportContactCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    body = serializer.validated_data["body"]

    with transaction.atomic():
        thread = _current_support_thread(support_user)
        if thread is None or thread.is_closed:
            thread = SupportThread.objects.create(
                user=support_user,
                subject=_subject_from_body(body),
            )

        SupportMessage.objects.create(
            thread=thread,
            author=support_user,
            body=body,
        )

    thread = _current_support_thread(support_user)
    return Response(_serialize_thread(thread), status=status.HTTP_201_CREATED)
