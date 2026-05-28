# ruff: noqa: F401
from .global_entries import views as _impl
from .global_entries.views import (
    _FAVORITES_REGISTRY,
    FavoriteGlazeCombination,
    GlazeCombination,
    _apply_global_filters,
    get_global_model_and_field,
    is_private_global,
    is_public_global,
)
from .global_entries.views import (
    _global_entries_impl as _impl_global_entries_impl,
)


def _sync_impl() -> None:
    for name in [
        "FavoriteGlazeCombination",
        "GlazeCombination",
        "get_global_model_and_field",
        "is_private_global",
        "is_public_global",
        "_FAVORITES_REGISTRY",
        "_apply_global_filters",
    ]:
        setattr(_impl, name, globals()[name])


def _global_entries_impl(request, global_name):
    _sync_impl()
    return _impl_global_entries_impl(request, global_name)


def make_global_entry_view(global_name):
    _sync_impl()
    return _impl.make_global_entry_view(global_name)


def make_global_entry_favorite_view(global_name):
    _sync_impl()
    return _impl.make_global_entry_favorite_view(global_name)
