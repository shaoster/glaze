from django.urls import path

from . import views
from .workflow import get_global_model_and_field, get_global_names

urlpatterns = [
    path(
        "admin/cloudinary-cleanup/",
        views.admin_cloudinary_cleanup,
        name="admin-cloudinary-cleanup",
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
    path("auth/login/", views.auth_login, name="auth-login"),
    path("auth/logout/", views.auth_logout, name="auth-logout"),
    path("auth/me/", views.auth_me, name="auth-me"),
    path("auth/register/", views.auth_register, name="auth-register"),
    path("auth/google/", views.auth_google, name="auth-google"),
    path("pieces/", views.pieces, name="pieces"),
    path("pieces/<uuid:piece_id>/", views.piece_detail, name="piece-detail"),
    path("pieces/<uuid:piece_id>/states/", views.piece_states, name="piece-states"),
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
        "uploads/cloudinary/widget-config/",
        views.cloudinary_widget_config,
        name="cloudinary-widget-config",
    ),
    path(
        "uploads/cloudinary/widget-signature/",
        views.cloudinary_widget_sign,
        name="cloudinary-widget-sign",
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
    _model_cls, _, _ = get_global_model_and_field(_global_name)  # type: ignore[assignment]

    urlpatterns.append(
        path(
            f"globals/{_global_name}/",
            views.make_global_entry_view(_global_name),
            name=f"global-entries-{_global_name}",
        )
    )

    if _model_cls in views._FAVORITES_REGISTRY:
        urlpatterns.append(
            path(
                f"globals/{_global_name}/<str:pk>/favorite/",
                views.make_global_entry_favorite_view(_global_name),
                name=f"global-entry-favorite-{_global_name}",
            )
        )
