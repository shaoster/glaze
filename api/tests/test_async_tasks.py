import pytest
from unittest.mock import patch
from django.urls import reverse
from rest_framework import status
from api.models import AsyncTask
from api.tasks import TaskRegistry

@TaskRegistry.register("ping")
def ping_task(task: AsyncTask):
    """A simple demonstrator task that returns a pong result."""
    return {"message": "pong", "input": task.input_params}

@pytest.mark.django_db(transaction=True)
class TestAsyncTasks:
    def test_submit_ping_task(self, client, user):
        client.force_authenticate(user=user)
        url = reverse("tasks-submit")
        data = {"task_type": "ping", "input_params": {"test": "data"}}
        
        with patch("api.tasks.InMemoryTaskInterface.submit", autospec=True) as mock_submit:
            def sync_submit(self_obj, task_obj):
                self_obj._run_task(task_obj.id)
            mock_submit.side_effect = sync_submit
            
            response = client.post(url, data, format="json")
            
        assert response.status_code == status.HTTP_202_ACCEPTED
        
        # Check database for final state
        task = AsyncTask.objects.get(id=response.data["id"])
        assert task.status == "success"
        assert task.result == {"message": "pong", "input": {"test": "data"}}

    def test_task_permission_isolation(self, client, user, other_user):
        # Task owned by 'other_user'
        task = AsyncTask.objects.create(
            user=other_user,
            task_type="ping"
        )
        
        client.force_authenticate(user=user)
        url = reverse("tasks-detail", kwargs={"task_id": task.id})
        
        response = client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_submit_unknown_task_type(self, client, user):
        client.force_authenticate(user=user)
        url = reverse("tasks-submit")
        data = {"task_type": "non-existent"}
        
        with patch("api.tasks.InMemoryTaskInterface.submit", autospec=True) as mock_submit:
            def sync_submit(self_obj, task_obj):
                self_obj._run_task(task_obj.id)
            mock_submit.side_effect = sync_submit
            
            response = client.post(url, data, format="json")
            
        assert response.status_code == status.HTTP_202_ACCEPTED
        
        task = AsyncTask.objects.get(id=response.data["id"])
        assert task.status == "failure"
        assert "Unknown task type" in task.error
