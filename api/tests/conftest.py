import pytest
from rest_framework.test import APIClient

from api.models import ENTRY_STATE, Piece, PieceState


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def piece(db):
    p = Piece.objects.create(name='Test Bowl')
    PieceState.objects.create(piece=p, state=ENTRY_STATE)
    return p
