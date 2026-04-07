import hashlib
import os
import time

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from django.shortcuts import get_object_or_404

from .models import Piece
from .workflow import get_global_model_and_field
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



@api_view(['GET', 'POST'])
def global_entries(request: Request, global_name: str) -> Response:
    # Generic handler for all globals declared in workflow.yml. Works well while
    # all globals share the same shape (list + get-or-create). If a type ever needs
    # custom validation, richer responses, or different permissions, split it out
    # into its own view rather than adding per-type branching here.
    try:
        model_cls, fields, display_field = get_global_model_and_field(global_name)
    except KeyError:
        return Response({'detail': 'Unknown global type.'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        objects = model_cls.objects.only('pk', display_field).order_by(display_field)
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


@extend_schema(
    request=None,
    responses={
        200: {
            'type': 'object',
            'properties': {
                'cloud_name': {'type': 'string'},
                'api_key': {'type': 'string'},
                'timestamp': {'type': 'integer'},
                'signature': {'type': 'string'},
                'upload_url': {'type': 'string'},
                'folder': {'type': 'string'},
                'upload_preset': {'type': 'string'},
            },
            'required': ['cloud_name', 'api_key', 'timestamp', 'signature', 'upload_url'],
        }
    },
)
@api_view(['POST'])
def cloudinary_upload_signature(request: Request) -> Response:
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME')
    api_key = os.environ.get('CLOUDINARY_API_KEY')
    api_secret = os.environ.get('CLOUDINARY_API_SECRET')
    folder = os.environ.get('CLOUDINARY_UPLOAD_FOLDER', '').strip()
    upload_preset = os.environ.get('CLOUDINARY_UPLOAD_PRESET', '').strip()

    if not cloud_name or not api_key or not api_secret:
        return Response(
            {'detail': 'Cloudinary is not configured on the server.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    timestamp = int(time.time())
    params_to_sign: dict[str, str | int] = {'timestamp': timestamp}
    if folder:
        params_to_sign['folder'] = folder
    if upload_preset:
        params_to_sign['upload_preset'] = upload_preset

    # Cloudinary signature format: sorted key=value params joined by '&',
    # then append API secret and SHA1 hash the resulting string.
    signing_string = '&'.join(
        f'{key}={params_to_sign[key]}' for key in sorted(params_to_sign.keys())
    )
    signature = hashlib.sha1(f'{signing_string}{api_secret}'.encode('utf-8')).hexdigest()

    payload = {
        'cloud_name': cloud_name,
        'api_key': api_key,
        'timestamp': timestamp,
        'signature': signature,
        'upload_url': f'https://api.cloudinary.com/v1_1/{cloud_name}/image/upload',
    }
    if folder:
        payload['folder'] = folder
    if upload_preset:
        payload['upload_preset'] = upload_preset
    return Response(payload)
