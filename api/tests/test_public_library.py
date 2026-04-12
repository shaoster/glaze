"""Tests for the public library feature (issue #43).

Covers:
- Public globals (clay_body, glaze_type) expose public objects to all users.
- Non-public globals (location, glaze_method) only expose private objects.
- POST on a public global with a name matching a public object returns the
  public object rather than creating a private duplicate.
- POST on a public global with a new name creates a private object.
- Public objects do not expose other users' private objects.
"""
import pytest

from api.models import ClayBody, GlazeType, Location


@pytest.mark.django_db
class TestPublicLibraryGet:
    def test_public_clay_bodies_visible_to_all_users(self, client, other_user):
        # Public clay body created without a user (admin-managed).
        ClayBody.objects.create(user=None, name='Public Stoneware')
        ClayBody.objects.create(user=other_user, name='Private Other Stoneware')

        response = client.get('/api/globals/clay_body/')
        assert response.status_code == 200
        names = [e['name'] for e in response.json()]
        assert 'Public Stoneware' in names
        # Other user's private clay body must not be visible.
        assert 'Private Other Stoneware' not in names

    def test_user_private_clay_bodies_included(self, client, user):
        ClayBody.objects.create(user=user, name='My Private Clay')
        ClayBody.objects.create(user=None, name='Public Clay')

        response = client.get('/api/globals/clay_body/')
        assert response.status_code == 200
        names = [e['name'] for e in response.json()]
        assert 'My Private Clay' in names
        assert 'Public Clay' in names

    def test_public_glaze_types_visible_to_all_users(self, client, other_user):
        GlazeType.objects.create(user=None, name='Public Celadon')
        GlazeType.objects.create(user=other_user, name='Private Other Glaze')

        response = client.get('/api/globals/glaze_type/')
        assert response.status_code == 200
        names = [e['name'] for e in response.json()]
        assert 'Public Celadon' in names
        assert 'Private Other Glaze' not in names

    def test_non_public_global_only_shows_own_private_objects(self, client, user, other_user):
        # Location has public: false — only the current user's locations are visible.
        Location.objects.create(user=user, name='My Shelf')
        Location.objects.create(user=other_user, name='Other Shelf')

        response = client.get('/api/globals/location/')
        assert response.status_code == 200
        names = [e['name'] for e in response.json()]
        assert 'My Shelf' in names
        assert 'Other Shelf' not in names

    def test_results_sorted_alphabetically(self, client, user):
        ClayBody.objects.create(user=None, name='Stoneware')
        ClayBody.objects.create(user=user, name='Porcelain')
        ClayBody.objects.create(user=None, name='Earthenware')

        response = client.get('/api/globals/clay_body/')
        names = [e['name'] for e in response.json()]
        assert names == sorted(names)


@pytest.mark.django_db
class TestPublicLibraryPost:
    def test_post_returns_public_object_when_name_matches(self, client):
        public = ClayBody.objects.create(user=None, name='Stoneware')

        response = client.post(
            '/api/globals/clay_body/',
            {'field': 'name', 'value': 'Stoneware'},
            format='json',
        )
        assert response.status_code == 200
        assert response.json()['id'] == str(public.pk)
        assert response.json()['name'] == 'Stoneware'
        # No private duplicate should be created.
        assert ClayBody.objects.filter(name='Stoneware').count() == 1

    def test_post_creates_private_object_when_no_public_match(self, client, user):
        response = client.post(
            '/api/globals/clay_body/',
            {'field': 'name', 'value': 'My Custom Clay'},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['name'] == 'My Custom Clay'
        private = ClayBody.objects.get(name='My Custom Clay')
        assert private.user == user

    def test_post_reuses_existing_private_object(self, client, user):
        ClayBody.objects.create(user=user, name='My Clay')
        response = client.post(
            '/api/globals/clay_body/',
            {'field': 'name', 'value': 'My Clay'},
            format='json',
        )
        assert response.status_code == 200
        assert ClayBody.objects.filter(user=user, name='My Clay').count() == 1

    def test_post_non_public_global_creates_private_object(self, client, user):
        response = client.post(
            '/api/globals/location/',
            {'field': 'name', 'value': 'New Kiln'},
            format='json',
        )
        assert response.status_code == 201
        loc = Location.objects.get(name='New Kiln')
        assert loc.user == user
