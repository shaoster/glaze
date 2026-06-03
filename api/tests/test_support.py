from types import SimpleNamespace

import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import User

from api.admin import SupportMessageAdmin
from api.models import SupportMessage, SupportThread


@pytest.mark.django_db
class TestSupportContact:
    def test_get_returns_no_thread_for_first_time_user(self, client):
        response = client.get("/api/support/contact/")

        assert response.status_code == 200
        assert response.json() == {"thread": None}

    def test_post_creates_a_thread_and_appends_messages(self, client, user):
        first = client.post(
            "/api/support/contact/", {"body": "I need help."}, format="json"
        )

        assert first.status_code == 201
        thread = first.json()["thread"]
        assert thread["subject"] == "I need help."
        assert thread["is_closed"] is False
        assert len(thread["messages"]) == 1
        assert thread["messages"][0]["sender"] == "user"
        assert thread["messages"][0]["body"] == "I need help."

        second = client.post(
            "/api/support/contact/",
            {"body": "Here's a follow-up."},
            format="json",
        )

        assert second.status_code == 201
        updated = second.json()["thread"]
        assert updated["id"] == thread["id"]
        assert [message["body"] for message in updated["messages"]] == [
            "I need help.",
            "Here's a follow-up.",
        ]
        assert [message["sender"] for message in updated["messages"]] == [
            "user",
            "user",
        ]
        assert SupportThread.objects.filter(user=user).count() == 1

    def test_post_opens_a_new_thread_after_the_previous_one_is_closed(
        self, client, user
    ):
        first = client.post(
            "/api/support/contact/", {"body": "First issue."}, format="json"
        )
        first_thread = SupportThread.objects.get(pk=first.json()["thread"]["id"])
        first_thread.is_closed = True
        first_thread.save(update_fields=["is_closed"])

        second = client.post(
            "/api/support/contact/", {"body": "New issue."}, format="json"
        )

        assert second.status_code == 201
        new_thread = second.json()["thread"]
        assert new_thread["subject"] == "New issue."
        assert new_thread["id"] != str(first_thread.pk)
        assert SupportThread.objects.filter(user=user).count() == 2


@pytest.mark.django_db
class TestSupportMessageAdmin:
    def test_save_model_sets_the_staff_author(self, user):
        staff = User.objects.create_user(
            username="staff@example.com",
            email="staff@example.com",
            password="password123",
            is_staff=True,
        )
        thread = SupportThread.objects.create(user=user, subject="Help needed")
        message = SupportMessage(thread=thread, author=user, body="We replied.")

        request = SimpleNamespace(user=staff)
        admin = SupportMessageAdmin(SupportMessage, AdminSite())

        admin.save_model(request, message, form=None, change=False)

        message.refresh_from_db()
        assert message.author == staff
