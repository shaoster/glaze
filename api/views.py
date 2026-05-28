"""Stable API endpoint imports used by URL registration and legacy call sites.

Endpoint implementations live in focused modules. Keep this module thin so
existing URL registrations can import the stable names they need without
depending on compatibility wrappers.
"""

from .analysis_views import glaze_combination_images
from .auth.views import (
    auth_delete_account,
    auth_export,
    auth_google,
    auth_logout,
    auth_me,
    auth_preferences,
    csrf,
    staff_invite_code,
    validate_invite,
)
from .cloudinary.admin_views import (
    admin_cloudinary_cleanup,
    admin_cloudinary_cleanup_archive,
)
from .cloudinary.views import cloudinary_widget_config, cloudinary_widget_sign
from .crop_run_views import CropRunViewSet, ImageCropRunsView
from .global_entries.views import (
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
from .piece.image_views import patch_image_crop, piece_image_detail
from .piece.views import (
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
    "CropRunViewSet",
    "ImageCropRunsView",
    "_check_async_tasks",
    "_check_database",
    "_check_migrations",
    "admin_cloudinary_cleanup",
    "admin_cloudinary_cleanup_archive",
    "admin_manual_square_crop_import",
    "auth_delete_account",
    "auth_export",
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
    "patch_image_crop",
    "piece_detail",
    "piece_image_detail",
    "piece_past_state",
    "piece_states",
    "pieces",
    "staff_invite_code",
    "submit_task",
    "task_detail",
    "validate_invite",
    "workflow_state_schema",
]
