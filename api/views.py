import hashlib
import json
import os
import re
from collections import defaultdict

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

from .cloudinary_cleanup import (
    delete_cloudinary_assets,
    list_cloudinary_assets,
    stream_cloudinary_cleanup_archive,
    summarize_referenced_public_ids,
)
from .manual_tile_imports import import_manual_tile_records
from .models import (
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
)
from .utils import bootstrap_dev_user
from .workflow import (
    get_glaze_image_qualifying_states,
    get_global_model_and_field,
    is_private_global,
    is_public_global,
)

_HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def _apply_global_filters(qs, model_cls, request):
    """Apply query-param filters declared in a model's ``filterable_fields`` dict.

    Each entry in ``filterable_fields`` has the form::

        'field_lookup': {'type': 'boolean' | 'm2m_id' | 'fk_id', 'param': 'query_param_name'}

    ``param`` defaults to the field lookup key when omitted.

    - ``boolean``: ?param=true|false → filter(**{lookup: True|False})
    - ``m2m_id``: ?param=id1,id2,... → successive filters so ALL ids must match
    - ``fk_id``: ?param=<pk> → exact FK match (filter(**{lookup: pk}))
    """
    filterable = getattr(model_cls, "filterable_fields", {})
    for lookup, meta in filterable.items():
        param = meta.get("param", lookup)
        filter_type = meta.get("type", "boolean")
        raw = request.query_params.get(param, "").strip()
        if not raw:
            continue
        if filter_type == "boolean":
            if raw.lower() == "true":
                qs = qs.filter(**{lookup: True})
            elif raw.lower() == "false":
                qs = qs.filter(**{lookup: False})
        elif filter_type == "m2m_id":
            for pk in (s.strip() for s in raw.split(",") if s.strip()):
                qs = qs.filter(**{lookup: pk})
        elif filter_type == "fk_id":
            qs = qs.filter(**{lookup: raw})
    return qs


# Map from global model class → its corresponding Favorite* model class.
# The Favorite* model must declare global_fk_field and get_favorite_ids_for().
_FAVORITES_REGISTRY = {
    GlazeCombination: FavoriteGlazeCombination,
}


_PIECE_ORDERING_MAP = {
    "last_modified": "computed_last_modified",
    "-last_modified": "-computed_last_modified",
    "name": "name",
    "-name": "-name",
    "created": "created",
    "-created": "-created",
}
_DEFAULT_ORDERING = "-last_modified"
_DEFAULT_PAGE_SIZE = 24


def _piece_queryset(request: Request):
    return Piece.objects.prefetch_related("states", "tag_links__tag").filter(
        user=request.user
    )  # type: ignore[misc]


def _piece_read_queryset(request: Request):
    qs = Piece.objects.prefetch_related("states", "tag_links__tag")
    if request.user.is_authenticated:
        return qs.filter(Q(user=request.user) | Q(shared=True))
    return qs.filter(shared=True)


def _serialize_piece_detail(piece: Piece, request: Request):
    return PieceDetailSerializer(piece, context={"request": request}).data


def _serialize_piece_summary(qs, request: Request):
    return PieceSummarySerializer(qs, many=True, context={"request": request}).data


def _apply_piece_ordering(qs, ordering_param: str):
    db_ordering = _PIECE_ORDERING_MAP.get(
        ordering_param, _PIECE_ORDERING_MAP[_DEFAULT_ORDERING]
    )
    if "computed_last_modified" in db_ordering:
        latest_state_lm = (
            PieceState.objects.filter(piece=OuterRef("pk"))
            .order_by("-last_modified")
            .values("last_modified")[:1]
        )
        qs = qs.annotate(
            computed_last_modified=Greatest(
                "fields_last_modified",
                Coalesce(
                    Subquery(latest_state_lm, output_field=DateTimeField()),
                    "fields_last_modified",
                ),
            )
        )
    return qs.order_by(db_ordering)


@extend_schema(
    methods=["GET"],
    operation_id="pieces_list",
    parameters=[
        OpenApiParameter(
            name="ordering",
            description="Sort order. Prefix with '-' for descending.",
            required=False,
            type=str,
            enum=list(_PIECE_ORDERING_MAP.keys()),
        ),
        OpenApiParameter(
            name="limit", description="Page size.", required=False, type=int
        ),
        OpenApiParameter(
            name="offset", description="Pagination offset.", required=False, type=int
        ),
        OpenApiParameter(
            name="tag_ids",
            description="Comma-separated tag IDs (AND filter).",
            required=False,
            type=str,
        ),
    ],
    responses={
        200: inline_serializer(
            name="PiecePage",
            fields={
                "count": drf_serializers.IntegerField(),
                "results": PieceSummarySerializer(many=True),
            },
        )
    },
)
@extend_schema(
    methods=["POST"],
    request=PieceCreateSerializer,
    responses={201: PieceDetailSerializer},
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def pieces(request: Request) -> Response:
    if request.method == "GET":
        qs = _piece_queryset(request)
        raw_tag_ids = request.query_params.get("tag_ids", "").strip()
        if raw_tag_ids:
            for tag_id in (
                item.strip() for item in raw_tag_ids.split(",") if item.strip()
            ):
                qs = qs.filter(tag_links__tag_id=tag_id)
            qs = qs.distinct()
        ordering_param = request.query_params.get("ordering", _DEFAULT_ORDERING)
        qs = _apply_piece_ordering(qs, ordering_param)
        try:
            limit = max(
                1, min(100, int(request.query_params.get("limit", _DEFAULT_PAGE_SIZE)))
            )
            offset = max(0, int(request.query_params.get("offset", 0)))
        except (ValueError, TypeError):
            limit = _DEFAULT_PAGE_SIZE
            offset = 0
        count = qs.count()
        page_qs = qs[offset : offset + limit]
        return Response(
            {"count": count, "results": _serialize_piece_summary(page_qs, request)}
        )

    serializer = PieceCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    piece = serializer.save()
    return Response(
        _serialize_piece_detail(piece, request), status=status.HTTP_201_CREATED
    )


@extend_schema(
    methods=["GET"],
    operation_id="pieces_retrieve",
    responses={200: PieceDetailSerializer},
)
@extend_schema(
    methods=["PATCH"],
    request=PieceUpdateSerializer,
    responses={200: PieceDetailSerializer},
)
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def piece_detail(request: Request, piece_id: str) -> Response:
    if request.method == "GET":
        piece = get_object_or_404(_piece_read_queryset(request), pk=piece_id)
        return Response(_serialize_piece_detail(piece, request))

    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=status.HTTP_403_FORBIDDEN,
        )
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    if request.method == "PATCH":
        serializer = PieceUpdateSerializer(
            data=request.data, context={"request": request, "piece": piece}
        )
        serializer.is_valid(raise_exception=True)
        serializer.update(piece, serializer.validated_data)
        piece.refresh_from_db()
    return Response(_serialize_piece_detail(piece, request))


@extend_schema(
    request=PieceStateCreateSerializer,
    responses={201: PieceDetailSerializer},
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def piece_states(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    serializer = PieceStateCreateSerializer(data=request.data, context={"piece": piece})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    # Reload to pick up updated last_modified on current_state
    piece.refresh_from_db()
    return Response(
        _serialize_piece_detail(piece, request), status=status.HTTP_201_CREATED
    )


@extend_schema(
    methods=["GET"],
    responses={200: PieceStateSerializer},
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def piece_current_state_detail(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    current = piece.current_state
    if current is None:
        return Response(
            {"detail": "Piece has no states."}, status=status.HTTP_404_NOT_FOUND
        )
    return Response(PieceStateSerializer(current, context={"request": request}).data)


@extend_schema(
    methods=["PATCH"],
    request=PieceStateUpdateSerializer,
    responses={200: PieceDetailSerializer},
)
@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def piece_current_state(request: Request, piece_id: str) -> Response:
    piece = get_object_or_404(_piece_queryset(request), pk=piece_id)
    current = piece.current_state
    if current is None:
        return Response(
            {"detail": "Piece has no states."}, status=status.HTTP_404_NOT_FOUND
        )
    serializer = PieceStateUpdateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.update(current, serializer.validated_data)
    piece.refresh_from_db()
    return Response(_serialize_piece_detail(piece, request))


_GLOBAL_ENTRY_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "name": {"type": "string"},
        "is_public": {"type": "boolean"},
    },
    "required": ["id", "name", "is_public"],
}

_GLOBAL_CREATE_REQUEST_SCHEMA = {
    "application/json": {
        "type": "object",
        "properties": {
            "field": {"type": "string"},
            "value": {"type": "string"},
        },
        "required": ["field", "value"],
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

    if request.method == "GET":
        if has_public_library:
            # Return both the user's private objects and all public objects (user IS NULL).
            base_qs = model_cls.objects.filter(
                Q(user=request.user) | Q(user__isnull=True)
            )
        else:
            base_qs = model_cls.objects.filter(user=request.user)

        # Apply query-param filters for models that declare filterable_fields.
        base_qs = _apply_global_filters(base_qs, model_cls, request)

        # Use a richer serializer if one is registered for this model.
        entry_serializer_cls = _GLOBAL_ENTRY_SERIALIZERS.get(model_cls)
        if entry_serializer_cls is not None:
            fav_model = _FAVORITES_REGISTRY.get(model_cls)
            favorite_ids = (
                fav_model.get_favorite_ids_for(request.user) if fav_model else set()
            )
            prepare_queryset = getattr(
                entry_serializer_cls, "prepare_global_entry_queryset", None
            )
            if callable(prepare_queryset):
                objects = list(prepare_queryset(base_qs, display_field))
            else:
                objects = list(base_qs.order_by(display_field))
            return Response(
                entry_serializer_cls(
                    objects,
                    many=True,
                    context={"request": request, "favorite_ids": favorite_ids},
                ).data
            )

        # Default: lightweight {id, name, is_public} response.
        # If the display field is a relation (FK), use select_related for efficient
        # loading and stringify the value; otherwise use only() for efficiency.
        try:
            display_field_meta = model_cls._meta.get_field(display_field)
            display_is_relation = getattr(display_field_meta, "is_relation", False)
        except Exception:
            display_is_relation = False

        if display_is_relation:
            objects = base_qs.select_related(display_field).order_by(display_field)
        else:
            objects = base_qs.only("pk", display_field).order_by(display_field)

        return Response(
            [
                {
                    "id": str(obj.pk),
                    "name": str(getattr(obj, display_field)),
                    "is_public": obj.user_id is None,
                }
                for obj in objects
            ]
        )

    if not is_private_global(global_name):
        return Response(
            {"detail": "Private instances of this type are not supported."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    # Models with ordered M2M relations declare get_or_create_from_ordered_pks.
    if hasattr(model_cls, "get_or_create_from_ordered_pks"):
        pks = request.data.get("layers")
        if not pks or not isinstance(pks, list):
            return Response(
                {"detail": "layers must be a non-empty list of PKs."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            obj, created = model_cls.get_or_create_from_ordered_pks(
                user=request.user, pks=pks
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(
            {"id": str(obj.pk), "name": obj.name, "is_public": obj.user_id is None},
            status=status_code,
        )

    field = request.data.get("field")
    value = request.data.get("value")
    values = request.data.get("values")
    if values is not None and not isinstance(values, dict):
        return Response(
            {"detail": "values must be an object."}, status=status.HTTP_400_BAD_REQUEST
        )

    payload = dict(values or {})
    if field:
        if field not in fields:
            return Response(
                {"detail": "Invalid field"}, status=status.HTTP_400_BAD_REQUEST
            )
        payload[field] = value

    allowed_fields = {
        field_name
        for field_name, field_def in fields.items()
        if "$ref" not in field_def
    }
    unknown_fields = sorted(set(payload) - allowed_fields)
    if unknown_fields:
        return Response(
            {"detail": f"Invalid field: {unknown_fields[0]}"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not payload.get(display_field):
        return Response(
            {"detail": "Value is required"}, status=status.HTTP_400_BAD_REQUEST
        )

    for field_name, field_val in payload.items():
        field_def = fields.get(field_name, {})
        if field_def.get("format") == "hex_color" and field_val is not None:
            if not _HEX_COLOR_RE.match(str(field_val)):
                return Response(
                    {
                        "detail": f"{field_name} must be a valid hex color code (e.g. #rgb or #rrggbb)."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

    lookup = {"user": request.user, display_field: payload[display_field]}
    defaults = {key: val for key, val in payload.items() if key != display_field}
    obj, created = model_cls.objects.get_or_create(**lookup, defaults=defaults)
    status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    entry_serializer_cls = _GLOBAL_ENTRY_SERIALIZERS.get(model_cls)
    if entry_serializer_cls is not None:
        return Response(
            entry_serializer_cls(
                obj, context={"request": request, "favorite_ids": set()}
            ).data,
            status=status_code,
        )
    return Response(
        {"id": str(obj.pk), "name": getattr(obj, display_field)}, status=status_code
    )


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
        else {200: {"type": "array", "items": _GLOBAL_ENTRY_SCHEMA}}
    )

    @extend_schema(responses=get_responses, methods=["GET"])
    @extend_schema(
        request=_GLOBAL_CREATE_REQUEST_SCHEMA,
        responses={200: _GLOBAL_ENTRY_SCHEMA, 201: _GLOBAL_ENTRY_SCHEMA},
        methods=["POST"],
    )
    @api_view(["GET", "POST"])
    @permission_classes([IsAuthenticated])
    def view(request: Request) -> Response:
        return _global_entries_impl(request, global_name)

    view.__name__ = f"global_entries_{global_name}"  # type: ignore[attr-defined]
    view.__qualname__ = f"global_entries_{global_name}"  # type: ignore[attr-defined]
    return view


def _global_entry_favorite_impl(
    request: Request, model_cls, fav_model_cls, pk: str
) -> Response:
    """Core implementation for POST/DELETE /api/globals/<global_name>/<pk>/favorite/.

    model_cls is the global's Django model; fav_model_cls is its Favorite* model.
    Called by views generated by make_global_entry_favorite_view(); not a view itself.
    """
    obj = get_object_or_404(model_cls, pk=pk)
    # Users may only favorite entries visible to them (public or their own).
    if obj.user_id is not None and obj.user_id != request.user.pk:
        return Response(status=status.HTTP_404_NOT_FOUND)

    fk_field = fav_model_cls.global_fk_field
    if request.method == "POST":
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

    @extend_schema(methods=["POST"], request=None, responses={204: None, 404: None})
    @extend_schema(methods=["DELETE"], request=None, responses={204: None, 404: None})
    @api_view(["POST", "DELETE"])
    @permission_classes([IsAuthenticated])
    def view(request: Request, pk: str) -> Response:
        return _global_entry_favorite_impl(request, model_cls, fav_model_cls, pk)

    view.__name__ = f"global_entry_favorite_{global_name}"  # type: ignore[attr-defined]
    view.__qualname__ = f"global_entry_favorite_{global_name}"  # type: ignore[attr-defined]
    return view


@extend_schema(
    request=None,
    responses={
        200: {
            "type": "object",
            "properties": {
                "cloud_name": {"type": "string"},
                "api_key": {"type": "string"},
                "folder": {"type": "string"},
            },
            "required": ["cloud_name", "api_key"],
        }
    },
)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cloudinary_widget_config(request: Request) -> Response:
    """Return Cloudinary config needed to initialize the Upload Widget."""
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    folder = os.environ.get("CLOUDINARY_UPLOAD_FOLDER", "").strip()

    if not cloud_name or not api_key:
        return Response(
            {"detail": "Cloudinary is not configured on the server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    payload: dict[str, str] = {"cloud_name": cloud_name, "api_key": api_key}
    if folder:
        payload["folder"] = folder
    preset = os.environ.get("CLOUDINARY_UPLOAD_PRESET", "").strip()
    if preset:
        payload["upload_preset"] = preset
    return Response(payload)


@extend_schema(
    request={
        "application/json": {
            "type": "object",
            "properties": {"params_to_sign": {"type": "object"}},
            "required": ["params_to_sign"],
        }
    },
    responses={
        200: {
            "type": "object",
            "properties": {"signature": {"type": "string"}},
            "required": ["signature"],
        }
    },
)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cloudinary_widget_sign(request: Request) -> Response:
    """Sign the params_to_sign dict provided by the Cloudinary Upload Widget."""
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")
    if not api_secret:
        return Response(
            {"detail": "Cloudinary is not configured on the server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    params_to_sign = request.data.get("params_to_sign", {})
    if not isinstance(params_to_sign, dict):
        return Response(
            {"detail": "params_to_sign must be an object."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Cloudinary signature format: sorted key=value pairs joined by '&',
    # then append the API secret and SHA1-hash the result.
    signing_string = "&".join(
        f"{key}={params_to_sign[key]}" for key in sorted(params_to_sign.keys())
    )
    signature = hashlib.sha1(
        f"{signing_string}{api_secret}".encode("utf-8")
    ).hexdigest()
    return Response({"signature": signature})


@extend_schema(
    methods=["GET"],
    responses={
        200: {
            "type": "object",
            "properties": {
                "assets": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "public_id": {"type": "string"},
                            "cloud_name": {"type": "string"},
                            "path_prefix": {"type": ["string", "null"]},
                            "url": {"type": "string"},
                            "thumbnail_url": {"type": "string"},
                            "bytes": {"type": ["integer", "null"]},
                            "created_at": {"type": ["string", "null"]},
                            "referenced": {"type": "boolean"},
                        },
                    },
                },
                "summary": {
                    "type": "object",
                    "properties": {
                        "total": {"type": "integer"},
                        "referenced": {"type": "integer"},
                        "unused": {"type": "integer"},
                        "referenced_breakdown": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "key": {"type": "string"},
                                    "label": {"type": "string"},
                                    "count": {"type": "integer"},
                                },
                            },
                        },
                        "reference_warnings": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                },
            },
        },
        503: {"type": "object"},
    },
)
@extend_schema(
    methods=["DELETE"],
    request={
        "application/json": {
            "type": "object",
            "properties": {
                "public_ids": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["public_ids"],
        }
    },
    responses={
        200: {"type": "object"},
        400: {"type": "object"},
        503: {"type": "object"},
    },
)
@api_view(["GET", "DELETE"])
@permission_classes([IsAdminUser])
def admin_cloudinary_cleanup(request: Request) -> Response:
    if request.method == "GET":
        try:
            assets = list_cloudinary_assets()
        except ValueError as exc:
            return Response(
                {"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        unused = [asset for asset in assets if not asset.referenced]
        referenced_breakdown = summarize_referenced_public_ids(
            {asset.public_id for asset in assets}
        )
        return Response(
            {
                "assets": [
                    {
                        "public_id": asset.public_id,
                        "cloud_name": asset.cloud_name,
                        "path_prefix": asset.path_prefix,
                        "url": asset.url,
                        "thumbnail_url": asset.thumbnail_url,
                        "bytes": asset.bytes,
                        "created_at": asset.created_at,
                    }
                    for asset in unused
                ],
                "summary": {
                    "total": len(assets),
                    "referenced": len(assets) - len(unused),
                    "unused": len(unused),
                    "referenced_breakdown": [
                        {
                            "key": source.key,
                            "label": source.label,
                            "count": source.count,
                        }
                        for source in referenced_breakdown.sources
                    ],
                    "reference_warnings": referenced_breakdown.warnings,
                },
            }
        )

    public_ids = request.data.get("public_ids")
    if not isinstance(public_ids, list) or not all(
        isinstance(public_id, str) and public_id for public_id in public_ids
    ):
        return Response(
            {"detail": "public_ids must be a non-empty list of strings."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        deleted = delete_cloudinary_assets(public_ids)
    except ValueError as exc:
        message = str(exc)
        service_unavailable_messages = {
            "Cloudinary is not configured on the server.",
            "Unable to delete Cloudinary assets.",
        }
        response_status: int = status.HTTP_400_BAD_REQUEST
        if message in service_unavailable_messages:
            response_status = status.HTTP_503_SERVICE_UNAVAILABLE
        return Response({"detail": message}, status=response_status)

    return Response({"deleted": deleted})


@extend_schema(
    responses={
        200: {"type": "string", "format": "binary"},
        503: {"type": "object"},
    },
)
@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_cloudinary_cleanup_archive(
    request: Request,
) -> StreamingHttpResponse | Response:
    try:
        assets = list_cloudinary_assets()
        unused = [asset for asset in assets if not asset.referenced]
    except ValueError as exc:
        return Response(
            {"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    response = StreamingHttpResponse(
        stream_cloudinary_cleanup_archive(unused),
        content_type="application/zip",
    )
    response["Content-Disposition"] = (
        'attachment; filename="cloudinary-cleanup-unused-images.zip"'
    )
    return response


@extend_schema(request=None, responses={204: None})
@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request: Request) -> Response:
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=LoginSerializer, responses={200: AuthUserSerializer})
@api_view(["POST"])
@permission_classes([AllowAny])
def auth_login(request: Request) -> Response:
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"]
    password = serializer.validated_data["password"]
    user_model = get_user_model()
    matched = user_model.objects.filter(email__iexact=email).first()
    auth_username = matched.username if matched else email
    user = authenticate(request=request, username=auth_username, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid email or password."}, status=status.HTTP_400_BAD_REQUEST
        )
    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data)


@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def auth_logout(request: Request) -> Response:
    logout(request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(request=None, responses={200: AuthUserSerializer, 401: None})
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def auth_me(request: Request) -> Response:
    return Response(AuthUserSerializer(request.user).data)


@extend_schema(request=GoogleAuthSerializer, responses={200: AuthUserSerializer})
@api_view(["POST"])
@permission_classes([AllowAny])
def auth_google(request: Request) -> Response:
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    if not client_id:
        return Response(
            {"detail": "Google sign-in is not configured on this server."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    serializer = GoogleAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    credential = serializer.validated_data["credential"]

    try:
        idinfo = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), client_id
        )
    except ValueError as e:
        import logging

        logging.getLogger(__name__).error("Google token verification failed: %s", e)
        return Response(
            {"detail": "Invalid Google credential."}, status=status.HTTP_400_BAD_REQUEST
        )

    google_sub = idinfo["sub"]
    email = idinfo.get("email", "")
    first_name = idinfo.get("given_name", "")
    last_name = idinfo.get("family_name", "")
    picture = idinfo.get("picture", "")

    User = get_user_model()

    # Look up by Google subject first (handles email changes gracefully).
    profile = (
        UserProfile.objects.filter(openid_subject=google_sub)
        .select_related("user")
        .first()
    )
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
        existing_profile = (
            UserProfile.objects.filter(user__email__iexact=email)
            .select_related("user")
            .first()
        )
        found_user = existing_profile.user if existing_profile else None
        if found_user is None:
            user = User.objects.create_user(
                username=email,
                email=email,
                first_name=first_name,
                last_name=last_name,
            )
            # No usable password — Google-only account.
            user.set_unusable_password()
            user.save()
        else:
            user = found_user

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.openid_subject = google_sub
        profile.profile_image_url = picture
        profile.save()

    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data)


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
    # use the most recent state that does.
    refs = (
        GlazeCombinationRef.objects.filter(piece_state__piece__user=request.user)
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


@extend_schema(request=RegisterSerializer, responses={201: AuthUserSerializer})
@api_view(["POST"])
@permission_classes([AllowAny])
def auth_register(request: Request) -> Response:
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user_model = get_user_model()
    if user_model.objects.filter(
        email__iexact=serializer.validated_data["email"]
    ).exists():
        return Response(
            {"email": ["A user with this email already exists."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user = serializer.save()
    bootstrap_dev_user(user)
    login(request, user)
    return Response(AuthUserSerializer(user).data, status=status.HTTP_201_CREATED)


@extend_schema(
    request={
        "multipart/form-data": {
            "type": "object",
            "properties": {
                "payload": {"type": "string"},
            },
            "required": ["payload"],
        }
    },
    responses={200: {"type": "object"}},
)
@api_view(["POST"])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
def admin_manual_square_crop_import(request: Request) -> Response:
    payload_raw = request.data.get("payload", "")
    if not payload_raw:
        return Response(
            {"detail": "payload is required."}, status=status.HTTP_400_BAD_REQUEST
        )
    try:
        payload = json.loads(payload_raw)
    except json.JSONDecodeError:
        return Response(
            {"detail": "payload must be valid JSON."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    records = payload.get("records")
    if not isinstance(records, list) or not records:
        return Response(
            {"detail": "payload.records must be a non-empty list."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if any(not record.get("reviewed") for record in records):
        return Response(
            {"detail": "All records must be reviewed before import."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    uploaded_files = {}
    for record in records:
        client_id = record.get("client_id", "")
        if not client_id:
            return Response(
                {"detail": "Each record must include client_id."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        file_obj = request.FILES.get(f"crop_image__{client_id}")
        if file_obj is not None:
            uploaded_files[client_id] = file_obj

    try:
        result = import_manual_tile_records(records, uploaded_files)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result)
