from django.urls import path

from . import views

urlpatterns = [
    path('auth/csrf/', views.csrf, name='auth-csrf'),
    path('auth/login/', views.auth_login, name='auth-login'),
    path('auth/logout/', views.auth_logout, name='auth-logout'),
    path('auth/me/', views.auth_me, name='auth-me'),
    path('auth/register/', views.auth_register, name='auth-register'),
    path('auth/google/', views.auth_google, name='auth-google'),
    path('pieces/', views.pieces, name='pieces'),
    path('pieces/<uuid:piece_id>/', views.piece_detail, name='piece-detail'),
    path('pieces/<uuid:piece_id>/states/', views.piece_states, name='piece-states'),
    path('pieces/<uuid:piece_id>/state/', views.piece_current_state, name='piece-current-state'),
    path('globals/glaze_combination/', views.glaze_combination_entries, name='glaze-combination-entries'),
    path('globals/<str:global_name>/', views.global_entries, name='global-entries'),
    path(
        'uploads/cloudinary/widget-config/',
        views.cloudinary_widget_config,
        name='cloudinary-widget-config',
    ),
    path(
        'uploads/cloudinary/widget-signature/',
        views.cloudinary_widget_sign,
        name='cloudinary-widget-sign',
    ),
]
