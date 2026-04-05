from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from django.shortcuts import get_object_or_404

from . import models as models_module
from .models import Piece, _GLOBALS_MAP
from .serializers import (
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceSummarySerializer,
    PieceStateCreateSerializer,
    PieceStateUpdateSerializer,
    PieceUpdateSerializer,
)


@extend_schema(
    methods=['GET'],
    responses={200: PieceSummarySerializer(many=True)},
)
@extend_schema(
    methods=['POST'],
    request=PieceCreateSerializer,
    responses={201: PieceDetailSerializer},
)
@api_view(['GET', 'POST'])
def pieces(request: Request) -> Response:
    if request.method == 'GET':
        qs = Piece.objects.prefetch_related('states').all()
        return Response(PieceSummarySerializer(qs, many=True).data)

    serializer = PieceCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    piece = serializer.save()
    return Response(PieceDetailSerializer(piece).data, status=status.HTTP_201_CREATED)


@extend_schema(responses={200: PieceDetailSerializer})
@extend_schema(
    methods=['PATCH'],
    request=PieceUpdateSerializer,
    responses={200: PieceDetailSerializer},
)
@api_view(['GET', 'PATCH'])
def piece_detail(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(Piece.objects.prefetch_related('states'), pk=piece_id)
    if request.method == 'PATCH':
        serializer = PieceUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.update(piece, serializer.validated_data)
        piece.refresh_from_db()
    return Response(PieceDetailSerializer(piece).data)


@extend_schema(
    request=PieceStateCreateSerializer,
    responses={201: PieceDetailSerializer},
)
@api_view(['POST'])
def piece_states(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(Piece.objects.prefetch_related('states'), pk=piece_id)
    serializer = PieceStateCreateSerializer(data=request.data, context={'piece': piece})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    # Reload to pick up updated last_modified on current_state
    piece.refresh_from_db()
    return Response(PieceDetailSerializer(piece).data, status=status.HTTP_201_CREATED)


@extend_schema(
    methods=['PATCH'],
    request=PieceStateUpdateSerializer,
    responses={200: PieceDetailSerializer},
)
@api_view(['PATCH'])
def piece_current_state(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(Piece.objects.prefetch_related('states'), pk=piece_id)
    current = piece.current_state
    if current is None:
        return Response({'detail': 'Piece has no states.'}, status=status.HTTP_404_NOT_FOUND)
    serializer = PieceStateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.update(current, serializer.validated_data)
    piece.refresh_from_db()
    return Response(PieceDetailSerializer(piece).data)



def _get_global_model_and_field(global_name: str):
    config = _GLOBALS_MAP.get(global_name)
    if not config:
        return None, None, None
    fields = config.get('fields', {})
    if not fields:
        return None, None, None
    display_field = 'name' if 'name' in fields else next(iter(fields))
    model_cls = getattr(models_module, config['model'])
    return model_cls, fields, display_field


@api_view(['GET', 'POST'])
def global_entries(request: Request, global_name: str) -> Response:
    model_cls, fields, display_field = _get_global_model_and_field(global_name)
    if not model_cls:
        return Response({'detail': 'Unknown global type.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        objects = model_cls.objects.all().order_by(display_field)
        return Response(
            [{'id': str(obj.pk), 'name': getattr(obj, display_field)} for obj in objects]
        )

    field = request.data.get('field')
    value = request.data.get('value')
    if not field or field not in fields:
        return Response({'detail': 'Invalid field'}, status=status.HTTP_400_BAD_REQUEST)
    if not value:
        return Response({'detail': 'Value is required'}, status=status.HTTP_400_BAD_REQUEST)
    obj, created = model_cls.objects.get_or_create(**{field: value})
    status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return Response({'id': str(obj.pk), 'name': getattr(obj, display_field)}, status=status_code)
