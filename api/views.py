"""Compatibility re-exports for API endpoint callables.

Endpoint implementations live in focused modules. Keep this module thin so
existing URL registrations and tests can import stable names from api.views.
"""

from .analysis_views import glaze_combination_images
from .auth_views import (
    auth_google,
    auth_logout,
    auth_me,
    auth_preferences,
    csrf,
    public_config,
    staff_invite_code,
    validate_invite,
)
from .cloudinary_views import (
    admin_cloudinary_cleanup,
    admin_cloudinary_cleanup_archive,
    cloudinary_widget_config,
    cloudinary_widget_sign,
)
from .crop_run_views import CropRunViewSet, ImageCropRunsView
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
    piece_image_detail,
    piece_past_state,
    piece_states,
    pieces,
)
from .task_views import submit_task, task_detail
from .workflow_views import workflow_state_schema

__all__ = [
    "_FAVORITES_REGISTRY",
    "CropRunViewSet",
    "ImageCropRunsView",
    "_apply_global_filters",
    "_check_async_tasks",
    "_check_database",
    "_check_migrations",
    "_global_entries_impl",
    "admin_cloudinary_cleanup",
    "admin_cloudinary_cleanup_archive",
    "admin_manual_square_crop_import",
    "auth_google",
    "auth_logout",
    "auth_me",
    "auth_preferences",
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
    "piece_image_detail",
    "piece_past_state",
    "piece_states",
    "pieces",
    "public_config",
    "staff_invite_code",
    "submit_task",
    "task_detail",
    "validate_invite",
    "workflow_state_schema",
]
