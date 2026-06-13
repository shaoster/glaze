"""Tests for the Modal→Django progress webhook endpoint."""

import uuid

import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from api.models import AsyncTask
from api.task_views import _make_progress_token, _verify_progress_token


@pytest.fixture
def user(db):
    return User.objects.create_superuser(
        username="progress@example.com", email="progress@example.com", password="x"
    )


@pytest.fixture
def task(user):
    return AsyncTask.objects.create(user=user, task_type="ping")


@pytest.fixture
def client():
    return APIClient()


class TestProgressToken:
    def test_make_and_verify_round_trip(self, task):
        token = _make_progress_token(task.id)
        assert _verify_progress_token(token, task.id)

    def test_wrong_task_id_fails(self, task):
        token = _make_progress_token(task.id)
        other_id = uuid.uuid4()
        assert not _verify_progress_token(token, other_id)

    def test_tampered_sig_fails(self, task):
        token = _make_progress_token(task.id)
        parts = token.rsplit(":", 1)
        bad_token = parts[0] + ":deadbeef" * 8
        assert not _verify_progress_token(bad_token, task.id)

    def test_malformed_token_fails(self, task):
        assert not _verify_progress_token("not-a-token", task.id)
        assert not _verify_progress_token("", task.id)

    def test_expired_token_fails(self, task, monkeypatch):
        monkeypatch.setattr("api.task_views._PROGRESS_TOKEN_TTL", -1)
        token = _make_progress_token(task.id)
        assert not _verify_progress_token(token, task.id)


@pytest.mark.django_db
class TestReportTaskProgressEndpoint:
    def _url(self, task_id):
        return f"/api/tasks/{task_id}/progress/"

    def test_valid_token_updates_progress(self, client, task):
        token = _make_progress_token(task.id)
        resp = client.post(
            self._url(task.id),
            {"progress": 42},
            format="json",
            HTTP_X_TASK_TOKEN=token,
        )
        assert resp.status_code == 204
        task.refresh_from_db()
        assert task.progress == 42

    def test_missing_token_returns_403(self, client, task):
        resp = client.post(self._url(task.id), {"progress": 10}, format="json")
        assert resp.status_code == 403

    def test_wrong_task_id_in_token_returns_403(self, client, task):
        other_token = _make_progress_token(uuid.uuid4())
        resp = client.post(
            self._url(task.id),
            {"progress": 10},
            format="json",
            HTTP_X_TASK_TOKEN=other_token,
        )
        assert resp.status_code == 403

    def test_progress_out_of_range_returns_400(self, client, task):
        token = _make_progress_token(task.id)
        for bad_value in (101, -1, "not-an-int"):
            resp = client.post(
                self._url(task.id),
                {"progress": bad_value},
                format="json",
                HTTP_X_TASK_TOKEN=token,
            )
            assert resp.status_code == 400, f"expected 400 for progress={bad_value}"

    def test_unknown_task_id_returns_404(self, client):
        random_id = uuid.uuid4()
        token = _make_progress_token(random_id)
        resp = client.post(
            self._url(random_id),
            {"progress": 50},
            format="json",
            HTTP_X_TASK_TOKEN=token,
        )
        assert resp.status_code == 404
