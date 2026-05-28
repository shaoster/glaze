"""Implementation helpers for global entry list/create/favorite endpoints.

Public helper entry points in this module are traced so global-entry behavior
remains observable as a documented contract.
"""

import re

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response

from backend.otel import traced

from ..models import FavoriteGlazeCombination, GlazeCombination
from ..serializer_registry import _GLOBAL_ENTRY_SERIALIZERS
from ..workflow import get_global_model_and_field, is_private_global, is_public_global

_HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")

# Map from global model class → its corresponding Favorite* model class.
# The Favorite* model must declare global_fk_field and get_favorite_ids_for().
_FAVORITES_REGISTRY = {
    GlazeCombination: FavoriteGlazeCombination,
}

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


@traced
def apply_global_filters(qs, model_cls, request):
    """Apply query-param filters declared in a model's ``filterable_fields`` dict."""
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


@traced
def global_entries_impl(request: Request, global_name: str) -> Response:
    """Core implementation for GET/POST /api/globals/<global_name>/."""
    return global_entries_impl_with_resolvers(
        request,
        global_name,
        resolve_global=get_global_model_and_field,
        public_global=is_public_global,
        private_global=is_private_global,
    )


@traced
def global_entries_impl_with_resolvers(
    request: Request,
    global_name: str,
    *,
    resolve_global,
    public_global,
    private_global,
) -> Response:
    """Core implementation for list and create operations on a global entry type."""
    model_cls, fields, display_field = resolve_global(global_name)
    has_public_library = public_global(global_name)

    if request.method == "GET":
        if has_public_library:
            base_qs = model_cls.objects.filter(
                Q(user=request.user) | Q(user__isnull=True)
            )
        else:
            base_qs = model_cls.objects.filter(user=request.user)

        base_qs = apply_global_filters(base_qs, model_cls, request)

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

    if not private_global(global_name):
        return Response(
            {"detail": "Private instances of this type are not supported."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

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


@traced
def global_entry_favorite_impl(
    request: Request, model_cls, fav_model_cls, pk: str
) -> Response:
    """Toggle the current user's favorite for a global entry object."""
    obj = get_object_or_404(model_cls, pk=pk)
    if obj.user_id is not None and obj.user_id != request.user.pk:
        return Response(status=status.HTTP_404_NOT_FOUND)

    fk_field = fav_model_cls.global_fk_field
    if request.method == "POST":
        fav_model_cls.objects.get_or_create(user=request.user, **{fk_field: obj})
    else:
        fav_model_cls.objects.filter(user=request.user, **{fk_field: obj}).delete()

    return Response(status=status.HTTP_204_NO_CONTENT)


_apply_global_filters = apply_global_filters
_global_entries_impl = global_entries_impl
_global_entries_impl_with_resolvers = global_entries_impl_with_resolvers
_global_entry_favorite_impl = global_entry_favorite_impl
