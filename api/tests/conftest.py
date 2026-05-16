import pytest
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APIClient

PROD = override_settings(IS_PRODUCTION=True)

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
    PieceState.objects.create(piece=p, state=ENTRY_STATE, order=1)
    return p


@pytest.fixture(autouse=True)
def clear_caches():
    """Ensure lru_caches are cleared for every test to avoid cross-test pollution."""
    from api.workflow import clear_workflow_caches

    clear_workflow_caches()
    yield
    clear_workflow_caches()
