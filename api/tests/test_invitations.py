"""Tests for the InviteCode model and related endpoints."""

import uuid
from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate

from api.models import InviteCode


@pytest.fixture
def staff_user(db):
    return User.objects.create_superuser(
        username="staffhash",
        password=None,
    )


@pytest.fixture
def active_code(db):
    return InviteCode.objects.create()


@pytest.fixture
def expired_code(db):
    code = InviteCode(expires_at=timezone.now() - timedelta(days=1))
    InviteCode.objects.bulk_create([code])
    return InviteCode.objects.get(pk=code.pk)


@pytest.fixture
def used_code(db, user):
    code = InviteCode.objects.create()
    code.used_at = timezone.now()
    code.used_by = user
    code.save(update_fields=["used_at", "used_by"])
    return code


@pytest.mark.django_db
class TestValidateInviteEndpoint:
    def test_valid_code_returns_true(self, active_code):
        from api.auth_views import validate_invite

        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/validate-invite/",
            {"code": str(active_code.code)},
            format="json",
        )
        response = validate_invite(request)
        assert response.status_code == 200
        assert response.data["valid"] is True

    def test_missing_code_returns_400(self, db):
        from api.auth_views import validate_invite

        factory = APIRequestFactory()
        request = factory.post("/api/auth/validate-invite/", {}, format="json")
        response = validate_invite(request)
        assert response.status_code == 400

    def test_nonexistent_code_returns_400(self, db):
        from api.auth_views import validate_invite

        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/validate-invite/",
            {"code": str(uuid.uuid4())},
            format="json",
        )
        response = validate_invite(request)
        assert response.status_code == 400

    def test_expired_code_returns_400(self, expired_code):
        from api.auth_views import validate_invite

        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/validate-invite/",
            {"code": str(expired_code.code)},
            format="json",
        )
        response = validate_invite(request)
        assert response.status_code == 400

    def test_used_code_returns_400(self, used_code):
        from api.auth_views import validate_invite

        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/validate-invite/",
            {"code": str(used_code.code)},
            format="json",
        )
        response = validate_invite(request)
        assert response.status_code == 400


@pytest.mark.django_db
class TestStaffInviteCodeEndpoint:
    def test_get_creates_code_if_none_exist(self, staff_user):
        from api.auth_views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.get("/api/staff/invite-code/")
        force_authenticate(request, user=staff_user)
        response = staff_invite_code(request)
        assert response.status_code == 200
        assert "code" in response.data
        assert "expires_at" in response.data
        assert InviteCode.objects.count() == 1

    def test_get_returns_existing_active_code(self, staff_user, active_code):
        from api.auth_views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.get("/api/staff/invite-code/")
        force_authenticate(request, user=staff_user)
        response = staff_invite_code(request)
        assert response.status_code == 200
        assert response.data["code"] == str(active_code.code)

    def test_post_generates_new_code(self, staff_user, active_code):
        from api.auth_views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.post("/api/staff/invite-code/", {}, format="json")
        force_authenticate(request, user=staff_user)
        response = staff_invite_code(request)
        assert response.status_code == 200
        new_code = response.data["code"]
        assert new_code != str(active_code.code)
        assert InviteCode.objects.count() == 2

    def test_non_staff_user_gets_403(self, user):
        from api.auth_views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.get("/api/staff/invite-code/")
        force_authenticate(request, user=user)
        response = staff_invite_code(request)
        assert response.status_code == 403


@pytest.mark.django_db
class TestInviteCodeModel:
    def test_is_valid_true_for_fresh_code(self, active_code):
        assert active_code.is_valid is True

    def test_is_valid_false_for_used_code(self, used_code):
        assert used_code.is_valid is False

    def test_is_valid_false_for_expired_code(self, expired_code):
        assert expired_code.is_valid is False

    def test_expires_at_set_on_create(self, db):
        before = timezone.now()
        code = InviteCode.objects.create()
        after = timezone.now()
        assert (
            before + timedelta(days=89) < code.expires_at <= after + timedelta(days=90)
        )
