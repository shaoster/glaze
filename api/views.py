"""Compatibility re-exports for API endpoint callables.

Endpoint implementations live in focused modules. Keep this module thin so
existing URL registrations and tests can import stable names from api.views.
"""

from .analysis_views import glaze_combination_images
from .auth_views import (
    accept_invite,
    admin_invite,
    auth_google,
    auth_login,
    auth_logout,
    auth_me,
    auth_register,
    csrf,
    waitlist_request,
)
from .cloudinary_views import (
    admin_cloudinary_cleanup,
    admin_cloudinary_cleanup_archive,
    cloudinary_widget_config,
    cloudinary_widget_sign,
)
from .global_entry_views import (
    _FAVORITES_REGISTRY,
    _apply_global_filters,
    _global_entries_impl,
    make_global_entry_favorite_view,
    make_global_entry_view,
)
from .health_views import (
    _check_async_tasks,
    _check_database,
    _check_migrations,
    health_ready,
)
from .import_views import admin_manual_square_crop_import
from .piece_views import (
    piece_current_state,
    piece_current_state_detail,
    piece_detail,
    piece_past_state,
    piece_states,
    pieces,
)
from .task_views import submit_task, task_detail
from .workflow_views import workflow_state_schema

__all__ = [
    "_FAVORITES_REGISTRY",
    "_apply_global_filters",
    "_check_async_tasks",
    "_check_database",
    "_check_migrations",
    "_global_entries_impl",
    "accept_invite",
    "admin_cloudinary_cleanup",
    "admin_cloudinary_cleanup_archive",
    "admin_invite",
    "admin_manual_square_crop_import",
    "auth_google",
    "auth_login",
    "auth_logout",
    "auth_me",
    "auth_register",
    "waitlist_request",
    "cloudinary_widget_config",
    "cloudinary_widget_sign",
    "csrf",
    "glaze_combination_images",
    "health_ready",
    "make_global_entry_favorite_view",
    "make_global_entry_view",
    "piece_current_state",
    "piece_current_state_detail",
    "piece_detail",
    "piece_past_state",
    "piece_states",
    "pieces",
    "submit_task",
    "task_detail",
    "workflow_state_schema",
]
