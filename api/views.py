from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from django.shortcuts import get_object_or_404

from .models import Location, Piece
from .serializers import (
    LocationSerializer,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceSummarySerializer,
    PieceStateCreateSerializer,
    PieceStateUpdateSerializer,
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
@api_view(['GET'])
def piece_detail(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(Piece.objects.prefetch_related('states'), pk=piece_id)
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


@extend_schema(
    methods=['GET'],
    responses={200: LocationSerializer(many=True)},
)
@api_view(['GET'])
def locations(request: Request) -> Response:
    qs = Location.objects.all().order_by('name')
    return Response(LocationSerializer(qs, many=True).data)
