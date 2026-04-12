import hashlib
import os

from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiTypes
from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.decorators import permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Piece, UserProfile
from .serializers import (
    AuthUserSerializer,
    GoogleAuthSerializer,
    LoginSerializer,
    PieceCreateSerializer,
    PieceDetailSerializer,
    PieceSummarySerializer,
    PieceStateCreateSerializer,
    PieceStateUpdateSerializer,
    PieceUpdateSerializer,
    RegisterSerializer,
)
from .workflow import get_global_model_and_field


def _piece_queryset(request: Request):
    return Piece.objects.prefetch_related('states').filter(user=request.user)


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
@permission_classes([IsAuthenticated])
def pieces(request: Request) -> Response:
    if request.method == 'GET':
        qs = _piece_queryset(request)
        return Response(PieceSummarySerializer(qs, many=True).data)

    serializer = PieceCreateSerializer(data=request.data, context={'request': request})
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
@permission_classes([IsAuthenticated])
def piece_detail(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    if request.method == 'PATCH':
        serializer = PieceUpdateSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.update(piece, serializer.validated_data)
        piece.refresh_from_db()
    return Response(PieceDetailSerializer(piece).data)


@extend_schema(
    request=PieceStateCreateSerializer,
    responses={201: PieceDetailSerializer},
)
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def piece_states(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
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
@permission_classes([IsAuthenticated])
def piece_current_state(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    current = piece.current_state
    if current is None:
        return Response({'detail': 'Piece has no states.'}, status=status.HTTP_404_NOT_FOUND)
    serializer = PieceStateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.update(current, serializer.validated_data)
    piece.refresh_from_db()
    return Response(PieceDetailSerializer(piece).data)



GLOBAL_ENTRY_SCHEMA = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'name': {'type': 'string'},
    },
    'required': ['id', 'name'],
}

@extend_schema(
    parameters=[OpenApiParameter('global_name', OpenApiTypes.STR, OpenApiParameter.PATH)],
    responses={200: {'type': 'array', 'items': GLOBAL_ENTRY_SCHEMA}},
    methods=['GET'],
)
@extend_schema(
    parameters=[OpenApiParameter('global_name', OpenApiTypes.STR, OpenApiParameter.PATH)],
    request={'application/json': {'type': 'object', 'properties': {'field': {'type': 'string'}, 'value': {'type': 'string'}}, 'required': ['field', 'value']}},
    responses={200: GLOBAL_ENTRY_SCHEMA, 201: GLOBAL_ENTRY_SCHEMA},
    methods=['POST'],
)
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
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
        objects = model_cls.objects.filter(user=request.user).only('pk', display_field).order_by(display_field)
        return Response(
            [{'id': str(obj.pk), 'name': getattr(obj, display_field)} for obj in objects]
        )

    field = request.data.get('field')
    value = request.data.get('value')
    if not field or field not in fields:
        return Response({'detail': 'Invalid field'}, status=status.HTTP_400_BAD_REQUEST)
    if not value:
        return Response({'detail': 'Value is required'}, status=status.HTTP_400_BAD_REQUEST)
    obj, created = model_cls.objects.get_or_create(user=request.user, **{field: value})
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
                'folder': {'type': 'string'},
            },
            'required': ['cloud_name', 'api_key'],
        }
    },
)
@api_view(['GET'])
def cloudinary_widget_config(request: Request) -> Response:
    """Return Cloudinary config needed to initialise the Upload Widget."""
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME')
    api_key = os.environ.get('CLOUDINARY_API_KEY')
    folder = os.environ.get('CLOUDINARY_UPLOAD_FOLDER', '').strip()

    if not cloud_name or not api_key:
        return Response(
            {'detail': 'Cloudinary is not configured on the server.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    payload: dict[str, str] = {'cloud_name': cloud_name, 'api_key': api_key}
    if folder:
        payload['folder'] = folder
    return Response(payload)


@extend_schema(
    request={
        'application/json': {
            'type': 'object',
            'properties': {'params_to_sign': {'type': 'object'}},
            'required': ['params_to_sign'],
        }
    },
    responses={
        200: {
            'type': 'object',
            'properties': {'signature': {'type': 'string'}},
            'required': ['signature'],
        }
    },
)
@api_view(['POST'])
def cloudinary_widget_sign(request: Request) -> Response:
    """Sign the params_to_sign dict provided by the Cloudinary Upload Widget."""
    api_secret = os.environ.get('CLOUDINARY_API_SECRET')
    if not api_secret:
        return Response(
            {'detail': 'Cloudinary is not configured on the server.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    params_to_sign = request.data.get('params_to_sign', {})
    if not isinstance(params_to_sign, dict):
        return Response({'detail': 'params_to_sign must be an object.'}, status=status.HTTP_400_BAD_REQUEST)

    # Cloudinary signature format: sorted key=value pairs joined by '&',
    # then append the API secret and SHA1-hash the result.
    signing_string = '&'.join(
        f'{key}={params_to_sign[key]}' for key in sorted(params_to_sign.keys())
    )
    signature = hashlib.sha1(f'{signing_string}{api_secret}'.encode('utf-8')).hexdigest()
    return Response({'signature': signature})


@extend_schema(request=None, responses={204: None})
@ensure_csrf_cookie
@api_view(['GET'])
@permission_classes([AllowAny])
def csrf(request: Request) -> Response:
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=LoginSerializer, responses={200: AuthUserSerializer})
@api_view(['POST'])
@permission_classes([AllowAny])
def auth_login(request: Request) -> Response:
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email']
    password = serializer.validated_data['password']
    user_model = get_user_model()
    matched = user_model.objects.filter(email__iexact=email).first()
    auth_username = matched.username if matched else email
    user = authenticate(request=request, username=auth_username, password=password)
    if user is None:
        return Response({'detail': 'Invalid email or password.'}, status=status.HTTP_400_BAD_REQUEST)
    login(request, user)
    return Response(AuthUserSerializer(user).data)


@extend_schema(request=None, responses={204: None})
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def auth_logout(request: Request) -> Response:
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=None, responses={200: AuthUserSerializer, 401: None})
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def auth_me(request: Request) -> Response:
    return Response(AuthUserSerializer(request.user).data)


@extend_schema(request=GoogleAuthSerializer, responses={200: AuthUserSerializer})
@api_view(['POST'])
@permission_classes([AllowAny])
def auth_google(request: Request) -> Response:
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id:
        return Response(
            {'detail': 'Google sign-in is not configured on this server.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = GoogleAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    credential = serializer.validated_data['credential']

    try:
        idinfo = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
    except ValueError as e:
        import logging
        logging.getLogger(__name__).error('Google token verification failed: %s', e)
        return Response({'detail': 'Invalid Google credential.'}, status=status.HTTP_400_BAD_REQUEST)

    google_sub = idinfo['sub']
    email = idinfo.get('email', '')
    first_name = idinfo.get('given_name', '')
    last_name = idinfo.get('family_name', '')
    picture = idinfo.get('picture', '')

    User = get_user_model()

    # Look up by Google subject first (handles email changes gracefully).
    profile = UserProfile.objects.filter(openid_subject=google_sub).select_related('user').first()
    if profile:
        user = profile.user
        # Refresh display name and picture in case they changed.
        changed = False
        if picture and profile.profile_image_url != picture:
            profile.profile_image_url = picture
            changed = True
        if changed:
            profile.save()
    else:
        # Fall back to matching by email so existing email/password accounts
        # can sign in via Google without creating a duplicate.
        user = User.objects.filter(email__iexact=email).first()
        if user is None:
            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=first_name,
                last_name=last_name,
            )
            # No usable password — Google-only account.
            user.set_unusable_password()
            user.save()

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.openid_subject = google_sub
        profile.profile_image_url = picture
        profile.save()

    login(request, user)
    return Response(AuthUserSerializer(user).data)


@extend_schema(request=RegisterSerializer, responses={201: AuthUserSerializer})
@api_view(['POST'])
@permission_classes([AllowAny])
def auth_register(request: Request) -> Response:
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user_model = get_user_model()
    if user_model.objects.filter(email__iexact=serializer.validated_data['email']).exists():
        return Response({'email': ['A user with this email already exists.']}, status=status.HTTP_400_BAD_REQUEST)
    user = serializer.save()
    login(request, user)
    return Response(AuthUserSerializer(user).data, status=status.HTTP_201_CREATED)
