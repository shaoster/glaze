import time
import pytest
from django.urls import reverse
from rest_framework import status
from api.models import AsyncTask

@pytest.mark.django_db(transaction=True)
class TestAsyncTasks:
    def test_submit_ping_task(self, client, user):
        url = reverse("tasks-submit")
        data = {"task_type": "ping", "input_params": {"foo": "bar"}}
        
        response = client.post(url, data, format="json")
        
        assert response.status_code == status.HTTP_202_ACCEPTED
        assert response.data["task_type"] == "ping"
        assert response.data["status"] == "pending"
        assert response.data["input_params"] == {"foo": "bar"}
        
        task_id = response.data["id"]
        task = AsyncTask.objects.get(id=task_id)
        assert task.user == user

    def test_task_status_polling(self, client, user):
        # Create a task manually
        task = AsyncTask.objects.create(
            user=user,
            task_type="ping",
            input_params={"test": "polling"}
        )
        
        url = reverse("tasks-detail", kwargs={"task_id": task.id})
        
        # Initial status
        response = client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["status"] == "pending"
        
        # Trigger execution (simulating the background runner manually for deterministic test)
        from api.tasks import get_task_interface
        get_task_interface().submit(task)
        
        # Poll until success or timeout
        timeout = 5
        start = time.time()
        while time.time() - start < timeout:
            response = client.get(url)
            if response.data["status"] == "success":
                break
            time.sleep(0.2)
            
        assert response.data["status"] == "success"
        assert response.data["result"] == {"message": "pong", "input": {"test": "polling"}}

    def test_task_permission_isolation(self, client, user, other_user):
        from rest_framework.test import APIClient
        unauth_client = APIClient()

        # Task owned by 'other_user'
        task = AsyncTask.objects.create(
            user=other_user,
            task_type="ping"
        )
        
        url = reverse("tasks-detail", kwargs={"task_id": task.id})
        
        # Current user (client) should not be able to see it
        response = client.get(url)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        
        # Unauthenticated user should not be able to see it
        response = unauth_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_submit_unknown_task_type(self, client):
        url = reverse("tasks-submit")
        data = {"task_type": "non-existent"}
        
        response = client.post(url, data, format="json")
        assert response.status_code == status.HTTP_202_ACCEPTED
        
        task_id = response.data["id"]
        
        # Poll for failure
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
