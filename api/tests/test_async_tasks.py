import time
import pytest
from django.urls import reverse
from rest_framework import status
from api.models import AsyncTask

@pytest.mark.django_db(transaction=True)
class TestAsyncTasks:
    def test_submit_ping_task(self, client, user):
        client.force_authenticate(user=user)
        url = reverse("tasks-submit")
        data = {"task_type": "ping", "input_params": {"test": "data"}}
        
        response = client.post(url, data, format="json")
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert response.data["task_type"] == "ping"
        assert response.data["status"] == "pending"
        
        task_id = response.data["id"]
        
        # Poll for completion (it should take ~1s)
        url_detail = reverse("tasks-detail", kwargs={"task_id": task_id})
        
        timeout = 5
        start = time.time()
        while time.time() - start < timeout:
            response = client.get(url_detail)
            if response.data["status"] == "success":
                break
            time.sleep(0.5)
            
        assert response.data["status"] == "success"
        assert response.data["result"] == {"message": "pong", "input": {"test": "data"}}

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
        
        response = client.post(url, data, format="json")
        assert response.status_code == status.HTTP_202_ACCEPTED
        
        task_id = response.data["id"]
        url_detail = reverse("tasks-detail", kwargs={"task_id": task_id})
        
        timeout = 2
        start = time.time()
        while time.time() - start < timeout:
            response = client.get(url_detail)
            if response.data["status"] == "failure":
                break
            time.sleep(0.1)
            
        assert response.data["status"] == "failure"
        assert "Unknown task type" in response.data["error"]
