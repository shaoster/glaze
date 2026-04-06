import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestAuthEndpoints:
    def test_register_creates_user_and_logs_in(self):
        client = APIClient()
        response = client.post(
            '/api/auth/register/',
            {
                'email': 'newuser@example.com',
                'password': 'password123',
                'first_name': 'New',
                'last_name': 'User',
            },
            format='json',
        )
        assert response.status_code == 201
        data = response.json()
        assert data['email'] == 'newuser@example.com'
        assert User.objects.filter(email='newuser@example.com').exists()
        me_response = client.get('/api/auth/me/')
        assert me_response.status_code == 200
        assert me_response.json()['email'] == 'newuser@example.com'

    def test_login_with_email(self):
        User.objects.create_user(
            username='person@example.com',
            email='person@example.com',
            password='password123',
        )
        client = APIClient()
        response = client.post(
            '/api/auth/login/',
            {'email': 'person@example.com', 'password': 'password123'},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['email'] == 'person@example.com'

    def test_logout_clears_session(self):
        user = User.objects.create(
            username='logout@example.com',
            email='logout@example.com',
        )
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post('/api/auth/logout/', {}, format='json')
        assert response.status_code == 204

    def test_me_requires_auth(self):
        client = APIClient()
        response = client.get('/api/auth/me/')
        assert response.status_code == 403

    def test_data_endpoints_require_auth(self):
        client = APIClient()
        response = client.get('/api/pieces/')
        assert response.status_code == 403
