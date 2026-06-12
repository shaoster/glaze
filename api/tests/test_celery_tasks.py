from unittest.mock import MagicMock, patch

import pytest
from django.conf import settings

from api.models import AsyncTask
from api.tasks import (
    CeleryTaskInterface,
    InMemoryTaskInterface,
    get_task_interface,
)


@pytest.fixture(autouse=True)
def reset_task_interface():
    """Reset the memoized task interface before each test."""
    from api import tasks

    tasks._task_interface = None
    yield
    tasks._task_interface = None


@pytest.mark.django_db
class TestCeleryTaskInterface:
    def test_get_task_interface_celery(self, monkeypatch):
        monkeypatch.setattr(settings, "ASYNC_TASK_BACKEND", "celery")
        interface = get_task_interface()
        assert isinstance(interface, CeleryTaskInterface)

    def test_get_task_interface_inmemory_default(self, monkeypatch):
        # Ensure ASYNC_TASK_BACKEND is not set or set to something else
        monkeypatch.delattr(settings, "ASYNC_TASK_BACKEND", raising=False)
        interface = get_task_interface()
        assert isinstance(interface, InMemoryTaskInterface)

    def test_get_task_interface_memoization(self, monkeypatch):
        monkeypatch.setattr(settings, "ASYNC_TASK_BACKEND", "inmemory")
        interface1 = get_task_interface()
        interface2 = get_task_interface()
        assert interface1 is interface2

    def test_health_check_no_url(self, monkeypatch):
        monkeypatch.setattr(settings, "CELERY_BROKER_URL", "")
        interface = CeleryTaskInterface()
        assert interface.health_check() is False

    @patch("redis.Redis.from_url")
    def test_health_check_ping_success(self, mock_redis_from_url, monkeypatch):
        monkeypatch.setattr(settings, "CELERY_BROKER_URL", "redis://localhost:6379/0")
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        mock_redis_from_url.return_value = mock_redis

        interface = CeleryTaskInterface()
        assert interface.health_check() is True
        mock_redis_from_url.assert_called_once_with(
            "redis://localhost:6379/0",
            socket_connect_timeout=2,
            socket_timeout=2,
        )

    @patch("redis.Redis.from_url")
    def test_health_check_ping_failure(self, mock_redis_from_url, monkeypatch):
        monkeypatch.setattr(settings, "CELERY_BROKER_URL", "redis://localhost:6379/0")
        mock_redis = MagicMock()
        mock_redis.ping.side_effect = Exception("connection failed")
        mock_redis_from_url.return_value = mock_redis

        interface = CeleryTaskInterface()
        assert interface.health_check() is False

    @patch("api.tasks.transaction.on_commit")
    @patch("api.tasks.run_celery_task.apply_async")
    def test_submit_uses_on_commit(self, mock_apply_async, mock_on_commit, user):
        task = AsyncTask.objects.create(user=user, task_type="ping")
        interface = CeleryTaskInterface()
        interface.submit(task)

        assert mock_on_commit.called
        callback = mock_on_commit.call_args[0][0]
        callback()
        mock_apply_async.assert_called_once_with(args=[task.id])


@pytest.mark.django_db
class TestCeleryWorkerTask:
    @patch("api.tasks._execute_task")
    def test_run_celery_task_calls_execute(self, mock_execute):
        from api.tasks import run_celery_task

        task_id = 123
        run_celery_task(task_id)
        mock_execute.assert_called_once_with(task_id)

    def test_execute_task_handles_base_exception(self, user):
        from celery.exceptions import SoftTimeLimitExceeded

        from api.tasks import TaskRegistry, _execute_task

        task = AsyncTask.objects.create(user=user, task_type="time_limit_task")

        @TaskRegistry.register("time_limit_task")
        def dummy_task(t):
            raise SoftTimeLimitExceeded()

        with pytest.raises(SoftTimeLimitExceeded):
            _execute_task(task.id)

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.FAILURE
        assert "SoftTimeLimitExceeded" in task.error

    def test_handle_task_failure_updates_status(self, user):
        from api.tasks import handle_task_failure

        task = AsyncTask.objects.create(
            user=user, task_type="ping", status=AsyncTask.Status.RUNNING
        )

        mock_sender = MagicMock()
        mock_sender.name = "api.tasks.run_celery_task"

        handle_task_failure(
            sender=mock_sender,
            task_id="celery-id",
            exception=Exception("Worker process exited abruptly"),
            args=[task.id],
            kwargs={},
        )

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.FAILURE
        assert "Worker process exited abruptly" in task.error
