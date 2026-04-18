import hashlib
import os

from drf_spectacular.utils import extend_schema
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

from django.db.models import Q

from .models import FavoriteGlazeCombination, GlazeCombination, Piece, UserProfile
from .registry import _GLOBAL_ENTRY_SERIALIZERS  # populated by @global_entry_serializer decorators in serializers.py
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
from .workflow import get_global_model_and_field, get_global_names, is_favoritable_global, is_private_global, is_public_global

def _apply_global_filters(qs, model_cls, request):
    """Apply query-param filters declared in a model's ``filterable_fields`` dict.

    Each entry in ``filterable_fields`` has the form::

        'field_lookup': {'type': 'boolean' | 'm2m_id' | 'fk_id', 'param': 'query_param_name'}

    ``param`` defaults to the field lookup key when omitted.

    - ``boolean``: ?param=true|false → filter(**{lookup: True|False})
    - ``m2m_id``: ?param=id1,id2,... → successive filters so ALL ids must match
    - ``fk_id``: ?param=<pk> → exact FK match (filter(**{lookup: pk}))
    """
    filterable = getattr(model_cls, 'filterable_fields', {})
    for lookup, meta in filterable.items():
        param = meta.get('param', lookup)
        filter_type = meta.get('type', 'boolean')
        raw = request.query_params.get(param, '').strip()
        if not raw:
            continue
        if filter_type == 'boolean':
            if raw.lower() == 'true':
                qs = qs.filter(**{lookup: True})
            elif raw.lower() == 'false':
                qs = qs.filter(**{lookup: False})
        elif filter_type == 'm2m_id':
            for pk in (s.strip() for s in raw.split(',') if s.strip()):
                qs = qs.filter(**{lookup: pk})
        elif filter_type == 'fk_id':
            qs = qs.filter(**{lookup: raw})
    return qs


# Map from global model class → its corresponding Favorite* model class.
# The Favorite* model must declare global_fk_field and get_favorite_ids_for().
_FAVORITES_REGISTRY = {
    GlazeCombination: FavoriteGlazeCombination,
}


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



_GLOBAL_ENTRY_SCHEMA = {
    'type': 'object',
    'properties': {
        'id': {'type': 'string'},
        'name': {'type': 'string'},
        'is_public': {'type': 'boolean'},
    },
    'required': ['id', 'name', 'is_public'],
}

_GLOBAL_CREATE_REQUEST_SCHEMA = {
    'application/json': {
        'type': 'object',
        'properties': {
            'field': {'type': 'string'},
            'value': {'type': 'string'},
        },
        'required': ['field', 'value'],
    }
}


def _global_entries_impl(request: Request, global_name: str) -> Response:
    """Core implementation for GET/POST /api/globals/<global_name>/.

    Called by the per-global views generated by make_global_entry_view(); not
    a view itself.  The caller's extend_schema annotation owns the OpenAPI
    description for each specific global type.
    """
    model_cls, fields, display_field = get_global_model_and_field(global_name)
    has_public_library = is_public_global(global_name)

    if request.method == 'GET':
        if has_public_library:
            # Return both the user's private objects and all public objects (user IS NULL).
            base_qs = model_cls.objects.filter(Q(user=request.user) | Q(user__isnull=True))
        else:
            base_qs = model_cls.objects.filter(user=request.user)

        # Apply query-param filters for models that declare filterable_fields.
        base_qs = _apply_global_filters(base_qs, model_cls, request)

        # Use a richer serializer if one is registered for this model.
        entry_serializer_cls = _GLOBAL_ENTRY_SERIALIZERS.get(model_cls)
        if entry_serializer_cls is not None:
            fav_model = _FAVORITES_REGISTRY.get(model_cls)
            favorite_ids = fav_model.get_favorite_ids_for(request.user) if fav_model else set()
            objects = list(base_qs.prefetch_related('layers__glaze_type').order_by('name'))
            return Response(
                entry_serializer_cls(
                    objects,
                    many=True,
                    context={'request': request, 'favorite_ids': favorite_ids},
                ).data
            )

        # Default: lightweight {id, name, is_public} response.
        # If the display field is a relation (FK), use select_related for efficient
        # loading and stringify the value; otherwise use only() for efficiency.
        try:
            display_field_meta = model_cls._meta.get_field(display_field)
            display_is_relation = getattr(display_field_meta, 'is_relation', False)
        except Exception:
            display_is_relation = False

        if display_is_relation:
            objects = base_qs.select_related(display_field).order_by(display_field)
        else:
            objects = base_qs.only('pk', display_field).order_by(display_field)

        return Response(
            [
                {
                    'id': str(obj.pk),
                    'name': str(getattr(obj, display_field)),
                    'is_public': obj.user_id is None,
                }
                for obj in objects
            ]
        )

    if not is_private_global(global_name):
        return Response(
            {'detail': 'Private instances of this type are not supported.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    # Models with ordered M2M relations declare get_or_create_from_ordered_pks.
    if hasattr(model_cls, 'get_or_create_from_ordered_pks'):
        pks = request.data.get('layers')
        if not pks or not isinstance(pks, list):
            return Response(
                {'detail': 'layers must be a non-empty list of PKs.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            obj, created = model_cls.get_or_create_from_ordered_pks(user=request.user, pks=pks)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(
            {'id': str(obj.pk), 'name': obj.name, 'is_public': obj.user_id is None},
            status=status_code,
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


def make_global_entry_view(global_name: str):
    """Return a fully-annotated view function for the given global type.

    The GET response schema is derived from _GLOBAL_ENTRY_SERIALIZERS: globals
    with a registered serializer get that serializer's schema; all others get
    the generic {id, name, is_public} schema.  This means extend_schema accuracy
    is mechanically guaranteed by the same registry that drives view behavior —
    adding a richer serializer for a new global requires only one registry entry.
    """
    model_cls, _, _ = get_global_model_and_field(global_name)
    entry_serializer_cls = _GLOBAL_ENTRY_SERIALIZERS.get(model_cls)

    get_responses: dict = (
        {200: entry_serializer_cls(many=True)}
        if entry_serializer_cls is not None
        else {200: {'type': 'array', 'items': _GLOBAL_ENTRY_SCHEMA}}
    )

    @extend_schema(responses=get_responses, methods=['GET'])
    @extend_schema(
        request=_GLOBAL_CREATE_REQUEST_SCHEMA,
        responses={200: _GLOBAL_ENTRY_SCHEMA, 201: _GLOBAL_ENTRY_SCHEMA},
        methods=['POST'],
    )
    @api_view(['GET', 'POST'])
    @permission_classes([IsAuthenticated])
    def view(request: Request) -> Response:
        return _global_entries_impl(request, global_name)

    view.__name__ = f'global_entries_{global_name}'
    view.__qualname__ = f'global_entries_{global_name}'
    return view


def _global_entry_favorite_impl(request: Request, model_cls, fav_model_cls, pk: str) -> Response:
    """Core implementation for POST/DELETE /api/globals/<global_name>/<pk>/favorite/.

    model_cls is the global's Django model; fav_model_cls is its Favorite* model.
    Called by views generated by make_global_entry_favorite_view(); not a view itself.
    """
    obj = get_object_or_404(model_cls, pk=pk)
    # Users may only favorite entries visible to them (public or their own).
    if obj.user_id is not None and obj.user_id != request.user.pk:
        return Response(status=status.HTTP_404_NOT_FOUND)

    fk_field = fav_model_cls.global_fk_field
    if request.method == 'POST':
        fav_model_cls.objects.get_or_create(user=request.user, **{fk_field: obj})
    else:
        fav_model_cls.objects.filter(user=request.user, **{fk_field: obj}).delete()

    return Response(status=status.HTTP_204_NO_CONTENT)


def make_global_entry_favorite_view(global_name: str):
    """Return an annotated POST/DELETE favorite-toggle view for the given global.

    Only called for globals whose model is in _FAVORITES_REGISTRY; the URL is only
    registered for those globals, so non-favoritable types return 404 (no route)
    rather than 405.
    """
    model_cls, _, _ = get_global_model_and_field(global_name)
    fav_model_cls = _FAVORITES_REGISTRY[model_cls]

    @extend_schema(methods=['POST'], request=None, responses={204: None, 404: None})
    @extend_schema(methods=['DELETE'], request=None, responses={204: None, 404: None})
    @api_view(['POST', 'DELETE'])
    @permission_classes([IsAuthenticated])
    def view(request: Request, pk: str) -> Response:
        return _global_entry_favorite_impl(request, model_cls, fav_model_cls, pk)

    view.__name__ = f'global_entry_favorite_{global_name}'
    view.__qualname__ = f'global_entry_favorite_{global_name}'
    return view



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
    """Return Cloudinary config needed to initialize the Upload Widget."""
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
    preset = os.environ.get('CLOUDINARY_UPLOAD_PRESET', '').strip()
    if preset:
        payload['upload_preset'] = preset
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


