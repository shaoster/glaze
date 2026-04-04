from django.urls import path

from . import views

urlpatterns = [
    path('pieces/', views.pieces, name='pieces'),
    path('pieces/<uuid:piece_id>/', views.piece_detail, name='piece-detail'),
    path('pieces/<uuid:piece_id>/states/', views.piece_states, name='piece-states'),
]
