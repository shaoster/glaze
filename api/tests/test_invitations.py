"""Tests for the InviteCode model and related endpoints."""

from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
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


@pytest.mark.django_db
class TestStaffInviteCodeEndpoint:
    def test_get_creates_code_if_none_exist(self, staff_user):
        from api.auth.views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.get("/api/staff/invite-code/")
        force_authenticate(request, user=staff_user)
        response = staff_invite_code(request)
        assert response.status_code == 200
        assert "code" in response.data
        assert "expires_at" in response.data
        assert InviteCode.objects.count() == 1

    def test_get_returns_existing_active_code(self, staff_user, active_code):
        from api.auth.views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.get("/api/staff/invite-code/")
        force_authenticate(request, user=staff_user)
        response = staff_invite_code(request)
        assert response.status_code == 200
        assert response.data["code"] == str(active_code.code)

    def test_post_generates_new_code(self, staff_user, active_code):
        from api.auth.views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.post("/api/staff/invite-code/", {}, format="json")
        force_authenticate(request, user=staff_user)
        response = staff_invite_code(request)
        assert response.status_code == 200
        new_code = response.data["code"]
        assert new_code != str(active_code.code)
        assert InviteCode.objects.count() == 2

    def test_surfaced_code_is_marked_sent(self, staff_user, active_code):
        from api.auth.views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.get("/api/staff/invite-code/")
        force_authenticate(request, user=staff_user)
        response = staff_invite_code(request)
        assert response.status_code == 200
        active_code.refresh_from_db()
        # A code handed out as a link/QR is removed from the email-invite pool.
        assert active_code.sent is True
        assert InviteCode.objects.filter(sent=False).count() == 0

    def test_non_staff_user_gets_403(self, user):
        from api.auth.views import staff_invite_code

        factory = APIRequestFactory()
        request = factory.get("/api/staff/invite-code/")
        force_authenticate(request, user=user)
        response = staff_invite_code(request)
        assert response.status_code == 403


@pytest.mark.django_db
class TestStaffInviteBatchEndpoint:
    def test_batch_creates_n_unsent_codes(self, staff_user):
        from api.auth.views import staff_invite_batch

        factory = APIRequestFactory()
        request = factory.post("/api/staff/invite-batch/", {"count": 5}, format="json")
        force_authenticate(request, user=staff_user)
        response = staff_invite_batch(request)
        assert response.status_code == 201
        assert response.data == {"created": 5}
        assert InviteCode.objects.count() == 5
        assert InviteCode.objects.filter(sent=False).count() == 5
        # Returns only a count — no per-code identifiers or timestamps leak.
        assert "code" not in response.data

    @pytest.mark.parametrize("count", [0, -1, 10_000, "nope"])
    def test_batch_rejects_invalid_count(self, staff_user, count):
        from api.auth.views import staff_invite_batch

        factory = APIRequestFactory()
        request = factory.post(
            "/api/staff/invite-batch/", {"count": count}, format="json"
        )
        force_authenticate(request, user=staff_user)
        response = staff_invite_batch(request)
        assert response.status_code == 400
        assert InviteCode.objects.count() == 0

    def test_non_staff_user_gets_403(self, user):
        from api.auth.views import staff_invite_batch

        factory = APIRequestFactory()
        request = factory.post("/api/staff/invite-batch/", {"count": 1}, format="json")
        force_authenticate(request, user=user)
        response = staff_invite_batch(request)
        assert response.status_code == 403


@pytest.mark.django_db
class TestSendInviteEndpoint:
    def _post(self, staff_user, email="recipient@example.com"):
        from api.auth.views import send_invite

        factory = APIRequestFactory()
        request = factory.post(
            "/api/auth/invite/send/", {"email": email}, format="json"
        )
        force_authenticate(request, user=staff_user)
        return send_invite(request)

    def test_send_emails_invite_and_marks_code_sent(self, staff_user, settings):
        settings.INVITE_LINK_BASE_URL = "https://potterdoc.com"
        invite = InviteCode.objects.create()

        response = self._post(staff_user)

        assert response.status_code == 204
        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert message.to == ["recipient@example.com"]
        assert str(invite.code) in message.body
        assert "https://potterdoc.com/invite?code=" in message.body
        invite.refresh_from_db()
        assert invite.sent is True

    def test_recipient_email_never_persisted(self, staff_user):
        InviteCode.objects.create()
        self._post(staff_user, email="secret@example.com")

        # The address must live nowhere in the DB. InviteCode has no field that
        # could hold it, and sending creates/updates no user.
        invite_fields = {f.name for f in InviteCode._meta.get_fields()}
        assert "email" not in invite_fields
        assert invite_fields == {"code", "created_at", "expires_at", "sent"}
        assert not User.objects.filter(email="secret@example.com").exists()

    def test_second_send_draws_a_different_code(self, staff_user):
        InviteCode.objects.create()
        InviteCode.objects.create()

        self._post(staff_user)
        self._post(staff_user)

        # Each send claims a distinct code; the pool is now fully sent.
        assert InviteCode.objects.filter(sent=True).count() == 2
        assert InviteCode.objects.filter(sent=False).count() == 0
        assert len(mail.outbox) == 2

    def test_empty_pool_returns_409_and_sends_nothing(self, staff_user):
        response = self._post(staff_user)
        assert response.status_code == 409
        assert response.data["code"] == "pool_empty"
        assert len(mail.outbox) == 0

    def test_invalid_email_returns_400_and_sends_nothing(self, staff_user):
        InviteCode.objects.create()
        response = self._post(staff_user, email="not-an-email")
        assert response.status_code == 400
        assert len(mail.outbox) == 0
        # No code was consumed by an invalid request.
        assert InviteCode.objects.filter(sent=False).count() == 1

    def test_non_staff_user_gets_403(self, user):
        InviteCode.objects.create()
        response = self._post(user)
        assert response.status_code == 403
        assert len(mail.outbox) == 0

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            }
        },
    )
    def test_send_is_rate_limited_per_admin(self, staff_user, monkeypatch):
        from api.auth.invite_views import InviteSendRateThrottle

        # The throttle counts requests in the cache; the default DummyCache (prod
        # fallback and test default) stores nothing, so it would silently never
        # engage. Use a real cache and a 1/min rate to prove the cap triggers.
        # The rate lives on the throttle class (bound at import), so patch it
        # there rather than via settings.
        cache.clear()
        monkeypatch.setitem(
            InviteSendRateThrottle.THROTTLE_RATES, "invite_send", "1/min"
        )
        InviteCode.objects.create()
        InviteCode.objects.create()

        first = self._post(staff_user)
        second = self._post(staff_user)

        assert first.status_code == 204
        assert second.status_code == 429
        # The throttled request never reached the body: one mail, one code spent.
        assert len(mail.outbox) == 1
        assert InviteCode.objects.filter(sent=True).count() == 1


@pytest.mark.django_db
class TestInviteCodeModel:
    def test_is_valid_true_for_fresh_code(self, active_code):
        assert active_code.is_valid is True

    def test_str_returns_code_string(self, active_code):
        assert str(active_code) == str(active_code.code)

    def test_is_valid_false_for_expired_code(self, expired_code):
        assert expired_code.is_valid is False

    def test_is_valid_true_regardless_of_sent_flag(self, active_code):
        active_code.sent = True
        active_code.save(update_fields=["sent"])
        # A sent-but-unredeemed code is still redeemable (existence == validity).
        assert active_code.is_valid is True

    def test_expires_at_set_on_create(self, db):
        before = timezone.now()
        code = InviteCode.objects.create()
        after = timezone.now()
        assert (
            before + timedelta(days=89) < code.expires_at <= after + timedelta(days=90)
        )
