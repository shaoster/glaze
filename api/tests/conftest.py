import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from api.models import ENTRY_STATE, Piece, PieceState


@pytest.fixture
def user(db):
    return User.objects.create(
        username="test@example.com",
        email="test@example.com",
    )


@pytest.fixture
def other_user(db):
    return User.objects.create(
        username="other@example.com",
        email="other@example.com",
    )


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def piece(user, db):
    p = Piece.objects.create(user=user, name="Test Bowl")
    PieceState.objects.create(piece=p, state=ENTRY_STATE)
    return p
