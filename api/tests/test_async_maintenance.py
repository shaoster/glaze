import pytest
from datetime import timedelta
from django.core.management import call_command
from django.utils import timezone
from api.models import AsyncTask
from api.tasks import fail_stuck_tasks

@pytest.mark.django_db
class TestAsyncMaintenance:
    def test_fail_stuck_tasks_logic(self, user):
        # 1. Create a truly recent running task (within 1h threshold)
        now = timezone.now()
        t1 = AsyncTask.objects.create(user=user, task_type="ping", status=AsyncTask.Status.RUNNING)
        
        # 2. Create a "stuck" task (older than 2h)
        # We use .update() to bypass auto_now on last_modified
        t2 = AsyncTask.objects.create(user=user, task_type="ping", status=AsyncTask.Status.RUNNING)
        AsyncTask.objects.filter(id=t2.id).update(last_modified=now - timedelta(hours=2))
        
        # 3. Create a pending task (older than 2h)
        t3 = AsyncTask.objects.create(user=user, task_type="ping", status=AsyncTask.Status.PENDING)
        AsyncTask.objects.filter(id=t3.id).update(last_modified=now - timedelta(hours=2))

        count = fail_stuck_tasks(hours=1)
        
        assert count == 2
        
        t1.refresh_from_db()
        t2.refresh_from_db()
        t3.refresh_from_db()
        
        assert t1.status == AsyncTask.Status.RUNNING
        assert t2.status == AsyncTask.Status.FAILURE
        assert t3.status == AsyncTask.Status.FAILURE
        assert "orphaned" in t2.error

    def test_clear_stuck_tasks_command(self, user):
        now = timezone.now()
        t1 = AsyncTask.objects.create(user=user, task_type="ping", status=AsyncTask.Status.RUNNING)
        AsyncTask.objects.filter(id=t1.id).update(last_modified=now - timedelta(hours=2))
        
        # Run command
        call_command("clear_stuck_tasks", hours=1)
        
        t1.refresh_from_db()
        assert t1.status == AsyncTask.Status.FAILURE

    def test_clear_stuck_tasks_command_dry_run(self, user):
        now = timezone.now()
        t1 = AsyncTask.objects.create(user=user, task_type="ping", status=AsyncTask.Status.RUNNING)
        AsyncTask.objects.filter(id=t1.id).update(last_modified=now - timedelta(hours=2))
        
        # Run command with dry-run
        call_command("clear_stuck_tasks", hours=1, dry_run=True)
        
        t1.refresh_from_db()
        assert t1.status == AsyncTask.Status.RUNNING  # Unchanged
