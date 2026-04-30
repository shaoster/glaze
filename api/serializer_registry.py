"""Registry mapping global model classes to their list-entry serializers.

Keeping this in a neutral module avoids circular imports — serializer_registry.py
imports nothing from the rest of the app, so models, serializers, and views
can all import from here without creating cycles.
"""

from django.db import models as django_models
from rest_framework import serializers

_GLOBAL_ENTRY_SERIALIZERS: dict = {}


def global_entry_serializer(model_cls: type[django_models.Model]):
    """Decorator that registers a serializer as the rich list entry serializer
    for the given global model class.

    Apply to serializers that return more than the default {id, name, is_public}
    shape for a global's list endpoint.  The make_global_entry_view factory in
    views.py reads this registry to choose the correct extend_schema annotation
    and serializer at URL registration time.

    Usage::

        @global_entry_serializer(GlazeCombination)
        class GlazeCombinationEntrySerializer(serializers.ModelSerializer):
            ...
    """

    def decorator(cls: type[serializers.Serializer]):
        _GLOBAL_ENTRY_SERIALIZERS[model_cls] = cls
        return cls

    return decorator
