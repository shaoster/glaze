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
            "redis://localhost:6379/0", socket_timeout=1
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
    @patch("api.tasks.run_celery_task.delay")
    def test_submit_uses_on_commit(self, mock_delay, mock_on_commit, user):
        task = AsyncTask.objects.create(user=user, task_type="ping")
        interface = CeleryTaskInterface()
        interface.submit(task)

        assert mock_on_commit.called
        callback = mock_on_commit.call_args[0][0]
        callback()
        mock_delay.assert_called_once_with(task.id)


@pytest.mark.django_db
class TestCeleryWorkerTask:
    @patch("api.tasks._execute_task")
    def test_run_celery_task_calls_execute(self, mock_execute):
        from api.tasks import run_celery_task

        task_id = 123
        run_celery_task(task_id)
        mock_execute.assert_called_once_with(task_id)
