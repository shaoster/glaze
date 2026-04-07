from django.urls import path

from . import views

urlpatterns = [
    path('pieces/', views.pieces, name='pieces'),
    path('pieces/<uuid:piece_id>/', views.piece_detail, name='piece-detail'),
    path('pieces/<uuid:piece_id>/states/', views.piece_states, name='piece-states'),
    path('pieces/<uuid:piece_id>/state/', views.piece_current_state, name='piece-current-state'),
    path('globals/<str:global_name>/', views.global_entries, name='global-entries'),
    path(
        'uploads/cloudinary/signature/',
        views.cloudinary_upload_signature,
        name='cloudinary-upload-signature',
    ),
]
