"""Factory for auto-generating global entry serializers from workflow.yml declarations.

Called by _register_globals() in api/models.py immediately after each global model
is generated.  Hand-written serializers decorated with @global_entry_serializer in
api/serializers.py run later (at class-definition time) and overwrite the
auto-generated entry for the same model class, so bespoke serializers always win.
"""

from django.db import models as django_models
from rest_framework import serializers

from .serializer_registry import _GLOBAL_ENTRY_SERIALIZERS
from .workflow import get_global_config


def _get_id(self: serializers.Serializer, obj: django_models.Model) -> str:
    return str(obj.pk)


def _get_is_public(self: serializers.Serializer, obj: django_models.Model) -> bool:
    return obj.user_id is None  # type: ignore[attr-defined]


def make_global_entry_serializer(
    global_name: str,
    model_cls: type[django_models.Model],
) -> type[serializers.ModelSerializer]:
    """Generate and register a ModelSerializer for global_name's list endpoint.

    The generated serializer exposes:
    - id: string-cast primary key
    - all fields declared in workflow.yml globals[global_name].fields, in order
    - is_public: True when user_id is None (admin-managed public object)

    The serializer is registered in _GLOBAL_ENTRY_SERIALIZERS so that the global
    list view uses it instead of the bare {id, name, is_public} fallback.
    """
    config = get_global_config(global_name)
    fields_config: dict = config.get('fields', {})

    meta_fields = ['id'] + list(fields_config.keys()) + ['is_public']

    meta_cls = type('Meta', (), {'model': model_cls, 'fields': meta_fields})

    attrs: dict = {
        '__module__': 'api.serializers',
        'Meta': meta_cls,
        'id': serializers.SerializerMethodField(),
        'is_public': serializers.SerializerMethodField(),
        'get_id': _get_id,
        'get_is_public': _get_is_public,
    }

    cls_name = f'{model_cls.__name__}EntrySerializer'
    serializer_cls: type[serializers.ModelSerializer] = type(
        cls_name, (serializers.ModelSerializer,), attrs
    )
    _GLOBAL_ENTRY_SERIALIZERS[model_cls] = serializer_cls
    return serializer_cls
