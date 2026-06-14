"""Stable API endpoint imports used by URL registration and legacy call sites.

Endpoint implementations live in focused modules. Keep this module thin so
existing URL registrations can import the stable names they need without
depending on compatibility wrappers.
"""

from .analysis_views import glaze_combination_images
from .auth.views import (
    agent_token_detail,
    agent_tokens,
    auth_delete_account,
    auth_export,
    auth_google,
    auth_logout,
    auth_me,
    auth_preferences,
    auth_token,
    auth_token_refresh,
    auth_token_revoke,
    csrf,
    exchange_for_mcp_agent_token,
    mock_idp_authorize,
    mock_idp_complete,
    send_invite,
    staff_invite_batch,
    staff_invite_code,
)
from .crop_run_views import CropRunViewSet, ImageCropRunsView
from .global_entries.views import (
    make_global_entry_favorite_view,
    make_global_entry_view,
)
from .health_views import (
    _check_async_tasks,
    _check_database,
    _check_migrations,
    health_live,
    health_ready,
)
from .import_views import admin_manual_square_crop_import
from .piece.image_views import (
    patch_image_crop,
    piece_image_detail,
    upload_image_from_refs_to_current_state,
    upload_image_from_refs_to_past_state,
    upload_image_to_current_state,
    upload_image_to_past_state,
)
from .piece.showcase_views import (
    piece_showcase_video,
)
from .piece.views import (
    piece_current_state,
    piece_current_state_detail,
    piece_detail,
    piece_history,
    piece_past_state,
    piece_states,
    pieces,
)
from .task_views import report_task_progress, submit_task, task_detail
from .telemetry_views import browser_traces
from .uploads.views import (
    r2_convert_image,
    r2_convert_image_status,
    r2_presigned_upload_url,
)
from .workflow_views import workflow_schema, workflow_state_schema

__all__ = [
    "CropRunViewSet",
    "agent_token_detail",
    "agent_tokens",
    "ImageCropRunsView",
    "_check_async_tasks",
    "_check_database",
    "_check_migrations",
    "admin_manual_square_crop_import",
    "auth_delete_account",
    "auth_export",
    "auth_google",
    "exchange_for_mcp_agent_token",
    "mock_idp_authorize",
    "mock_idp_complete",
    "auth_logout",
    "auth_me",
    "auth_preferences",
    "auth_token",
    "auth_token_refresh",
    "auth_token_revoke",
    "csrf",
    "glaze_combination_images",
    "health_live",
    "health_ready",
    "make_global_entry_favorite_view",
    "make_global_entry_view",
    "piece_current_state",
    "piece_current_state_detail",
    "patch_image_crop",
    "upload_image_from_refs_to_current_state",
    "upload_image_from_refs_to_past_state",
    "upload_image_to_current_state",
    "upload_image_to_past_state",
    "piece_detail",
    "piece_history",
    "piece_image_detail",
    "piece_past_state",
    "piece_showcase_video",
    "piece_states",
    "pieces",
    "r2_convert_image",
    "r2_convert_image_status",
    "r2_presigned_upload_url",
    "send_invite",
    "staff_invite_batch",
    "staff_invite_code",
    "report_task_progress",
    "submit_task",
    "task_detail",
    "browser_traces",
    "workflow_schema",
    "workflow_state_schema",
]
