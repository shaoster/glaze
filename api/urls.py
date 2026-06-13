from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views
from .global_entries.views import _FAVORITES_REGISTRY
from .graphql.views import graphql_view
from .workflow import get_global_model_and_field, get_global_names

_router = DefaultRouter()
_router.register(r"crop-runs", views.CropRunViewSet, basename="crop-run")

urlpatterns = [
    path("", include(_router.urls)),
    # Introspectable GraphQL endpoint (backs the MCP server wrapper).
    path("graphql/", graphql_view(), name="graphql"),
    path(
        "images/<uuid:image_id>/piece_state/<uuid:piece_state_id>/",
        views.piece_image_detail,
        name="piece-image-detail",
    ),
    path(
        "images/<uuid:image_id>/crop/",
        views.patch_image_crop,
        name="image-crop-update",
    ),
    path(
        "images/<uuid:image_id>/crop-runs/",
        views.ImageCropRunsView.as_view(),
        name="image-crop-runs",
    ),
    path(
        "analysis/glaze-combination-images/",
        views.glaze_combination_images,
        name="analysis-glaze-combination-images",
    ),
    path(
        "admin/manual-square-crop-import/",
        views.admin_manual_square_crop_import,
        name="admin-manual-square-crop-import",
    ),
    path("auth/csrf/", views.csrf, name="auth-csrf"),
    path("auth/logout/", views.auth_logout, name="auth-logout"),
    path("auth/me/", views.auth_me, name="auth-me"),
    path("auth/token/", views.auth_token, name="auth-token"),
    path("auth/token/refresh/", views.auth_token_refresh, name="auth-token-refresh"),
    path("auth/token/revoke/", views.auth_token_revoke, name="auth-token-revoke"),
    path("auth/preferences/", views.auth_preferences, name="auth-preferences"),
    path("auth/google/", views.auth_google, name="auth-google"),
    path("auth/export/", views.auth_export, name="auth-export"),
    path("auth/account/", views.auth_delete_account, name="auth-delete-account"),
    path(
        "auth/mock-idp/authorize/", views.mock_idp_authorize, name="mock-idp-authorize"
    ),
    path("auth/mock-idp/complete/", views.mock_idp_complete, name="mock-idp-complete"),
    path("staff/invite-code/", views.staff_invite_code, name="staff-invite-code"),
    path("staff/invite-batch/", views.staff_invite_batch, name="staff-invite-batch"),
    path("auth/invite/send/", views.send_invite, name="auth-invite-send"),
    path("health/live/", views.health_live, name="health-live"),
    path("health/ready/", views.health_ready, name="health-ready"),
    path("tasks/", views.submit_task, name="tasks-submit"),
    path("tasks/<uuid:task_id>/", views.task_detail, name="tasks-detail"),
    path(
        "tasks/<uuid:task_id>/progress/",
        views.report_task_progress,
        name="tasks-progress",
    ),
    path("telemetry/traces/", views.browser_traces, name="telemetry-traces"),
    path("pieces/", views.pieces, name="pieces"),
    path("pieces/<uuid:piece_id>/", views.piece_detail, name="piece-detail"),
    path("pieces/<uuid:piece_id>/history/", views.piece_history, name="piece-history"),
    path("pieces/<uuid:piece_id>/states/", views.piece_states, name="piece-states"),
    path(
        "pieces/<uuid:piece_id>/states/<uuid:state_id>/",
        views.piece_past_state,
        name="piece-past-state",
    ),
    path(
        "pieces/<uuid:piece_id>/current_state/",
        views.piece_current_state_detail,
        name="piece-current-state-detail",
    ),
    path(
        "pieces/<uuid:piece_id>/state/",
        views.piece_current_state,
        name="piece-current-state",
    ),
    path(
        "pieces/<uuid:piece_id>/showcase-video/",
        views.piece_showcase_video,
        name="piece-showcase-video",
    ),
    path(
        "uploads/r2/presigned-url/",
        views.r2_presigned_upload_url,
        name="r2-presigned-upload-url",
    ),
    path(
        "uploads/r2/convert-image/",
        views.r2_convert_image,
        name="r2-convert-image",
    ),
    path(
        "uploads/r2/convert-image/<uuid:task_id>/",
        views.r2_convert_image_status,
        name="r2-convert-image-status",
    ),
    path(
        "workflow/schema/<str:state_id>/",
        views.workflow_state_schema,
        name="workflow-state-schema",
    ),
]

# Generate one route per global declared in workflow.yml.  The view factory
# derives the correct extend_schema annotation from the the global name, so the
# schema is mechanically guaranteed.
#
# Favoritable globals additionally get a favorite-toggle route,
# derived from _FAVORITES_REGISTRY — non-favoritable types simply have no route,
# so requests to them return 404 rather than 405.
for _global_name in get_global_names():
    # Ignoring the reassignment type error since they're placeholders.
    _model_cls, _, _ = get_global_model_and_field(_global_name)

    urlpatterns.append(
        path(
            f"globals/{_global_name}/",
            views.make_global_entry_view(_global_name),
            name=f"global-entries-{_global_name}",
        )
    )

    if _model_cls in _FAVORITES_REGISTRY:
        urlpatterns.append(
            path(
                f"globals/{_global_name}/<str:pk>/favorite/",
                views.make_global_entry_favorite_view(_global_name),
                name=f"global-entry-favorite-{_global_name}",
            )
        )
