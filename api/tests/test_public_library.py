"""Tests for the public library feature (issue #43).

Covers:
- Public globals (clay_body, glaze_type) expose public objects to all users.
- Non-public globals (location, glaze_method) only expose private objects.
- GET response includes is_public flag on each entry.
- POST on a public global allows a private object with the same name as a public one.
- POST on a public global with a new name creates a private object.
- Public objects do not expose other users' private objects.
"""
import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import User
from django.test import RequestFactory

from api.models import ClayBody, GlazeCombination, GlazeType, Location


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

    def test_get_response_includes_is_public_flag(self, client, user):
        ClayBody.objects.create(user=None, name='Public Clay')
        ClayBody.objects.create(user=user, name='Private Clay')

        response = client.get('/api/globals/clay_body/')
        assert response.status_code == 200
        entries = {e['name']: e for e in response.json()}
        assert entries['Public Clay']['is_public'] is True
        assert entries['Private Clay']['is_public'] is False

    def test_private_global_is_public_always_false(self, client, user):
        Location.objects.create(user=user, name='My Shelf')

        response = client.get('/api/globals/location/')
        assert response.status_code == 200
        assert response.json()[0]['is_public'] is False


@pytest.mark.django_db
class TestPublicLibraryPost:
    def test_post_allows_private_object_with_same_name_as_public(self, client, user):
        ClayBody.objects.create(user=None, name='Stoneware')

        response = client.post(
            '/api/globals/clay_body/',
            {'field': 'name', 'value': 'Stoneware'},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['name'] == 'Stoneware'
        # Private duplicate is now allowed.
        assert ClayBody.objects.filter(user=user, name='Stoneware').count() == 1

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

    def test_post_rejects_non_object_values_payload(self, client):
        response = client.post(
            '/api/globals/location/',
            {'values': ['not-an-object']},
            format='json',
        )
        assert response.status_code == 400
        assert response.json() == {'detail': 'values must be an object.'}

    def test_post_creates_private_object_from_values_payload(self, client, user):
        response = client.post(
            '/api/globals/location/',
            {'values': {'name': 'Drying Rack'}},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['name'] == 'Drying Rack'
        loc = Location.objects.get(name='Drying Rack')
        assert loc.user == user

    def test_post_public_only_global_returns_405(self, client):
        response = client.post(
            '/api/globals/firing_temperature/',
            {'field': 'name', 'value': 'Cone 6 Oxidation'},
            format='json',
        )
        assert response.status_code == 405
        assert response.json() == {'detail': 'Private instances of this type are not supported.'}


@pytest.mark.django_db
class TestPublicLibraryAdmin:
    """Smoke tests for PublicLibraryAdmin base class behavior."""

    def test_list_view_returns_only_public_objects(self):
        from django.test import Client as DjangoClient

        superuser = User.objects.create_superuser(
            username='superadmin@example.com',
            email='superadmin@example.com',
            password='password',
        )
        private_user = User.objects.create(username='private@example.com', email='private@example.com')
        GlazeType.objects.create(user=None, name='PublicGlaze')
        GlazeType.objects.create(user=private_user, name='PrivateGlaze')

        c = DjangoClient()
        c.force_login(superuser)
        resp = c.get('/admin/api/glazetype/')
        assert resp.status_code == 200
        content = resp.content.decode()
        assert 'PublicGlaze' in content
        assert 'PrivateGlaze' not in content

    def test_save_model_forces_user_to_none(self):
        from api.admin import PublicLibraryAdmin

        superuser = User.objects.create_superuser(
            username='su2@example.com', email='su2@example.com', password='password'
        )
        ma = PublicLibraryAdmin(GlazeType, AdminSite())
        request = RequestFactory().post('/')
        request.user = superuser

        obj = GlazeType(user=superuser, name='WillBePublic')
        ma.save_model(request, obj, type('FakeForm', (), {'cleaned_data': {}})(), change=False)
        obj.refresh_from_db()
        assert obj.user is None

    def test_get_form_uses_public_library_form_and_cloudinary_widget(self):
        from api.admin import (
            CloudinaryImageWidget,
            PublicLibraryAdmin,
            _make_public_library_form,
        )

        superuser = User.objects.create_superuser(
            username='su-form@example.com', email='su-form@example.com', password='password'
        )
        ma = PublicLibraryAdmin(GlazeType, AdminSite())
        request = RequestFactory().get('/')
        request.user = superuser

        form_class = ma.get_form(request)
        public_form_class = _make_public_library_form(GlazeType)

        assert public_form_class._meta.model is GlazeType
        assert 'user' in public_form_class.base_fields
        assert form_class._meta.model is GlazeType
        assert 'user' not in form_class.base_fields
        assert isinstance(form_class.base_fields['test_tile_image'].widget, CloudinaryImageWidget)

    def test_get_queryset_excludes_private_objects(self):
        from api.admin import PublicLibraryAdmin

        private_user = User.objects.create(username='priv2@example.com', email='priv2@example.com')
        GlazeType.objects.create(user=None, name='PublicQ')
        GlazeType.objects.create(user=private_user, name='PrivateQ')

        superuser = User.objects.create_superuser(
            username='su3@example.com', email='su3@example.com', password='password'
        )
        ma = PublicLibraryAdmin(GlazeType, AdminSite())
        request = RequestFactory().get('/')
        request.user = superuser

        names = list(ma.get_queryset(request).values_list('name', flat=True))
        assert 'PublicQ' in names
        assert 'PrivateQ' not in names

    def test_is_public_entry_display(self):
        from api.admin import PublicLibraryAdmin

        private_user = User.objects.create(username='priv3@example.com', email='priv3@example.com')
        ma = PublicLibraryAdmin(GlazeType, AdminSite())
        assert ma.is_public_entry(GlazeType(user=None, name='Pub')) is True
        assert ma.is_public_entry(GlazeType(user=private_user, name='Priv')) is False

    def test_glaze_combination_post_requires_non_empty_layers(self, client):
        response = client.post(
            '/api/globals/glaze_combination/',
            {'layers': []},
            format='json',
        )
        assert response.status_code == 400
        assert response.json() == {'detail': 'layers must be a non-empty list of PKs.'}

    def test_glaze_combination_post_rejects_unknown_layer_pk(self, client):
        response = client.post(
            '/api/globals/glaze_combination/',
            {'layers': ['00000000-0000-0000-0000-000000000000']},
            format='json',
        )
        assert response.status_code == 400
        assert response.json() == {'detail': "Unknown GlazeType pk: '00000000-0000-0000-0000-000000000000'"}


@pytest.mark.django_db
class TestGlazeAdminSite:
    def test_app_label_subpage_is_returned_unchanged(self, monkeypatch):
        from api.admin import GlazeAdminSite

        expected = [{'app_label': 'api', 'models': []}]
        monkeypatch.setattr(AdminSite, 'get_app_list', lambda self, request, app_label=None: expected)

        request = RequestFactory().get('/admin/api/')
        assert GlazeAdminSite(name='glaze').get_app_list(request, app_label='api') is expected

    def test_index_without_public_models_does_not_add_public_libraries(self, monkeypatch):
        from api import admin as admin_module
        from api.admin import GlazeAdminSite

        app_list = [{'app_label': 'api', 'models': [{'object_name': 'Piece', 'name': 'Pieces'}]}]
        monkeypatch.setattr(AdminSite, 'get_app_list', lambda self, request, app_label=None: app_list)
        monkeypatch.setattr(admin_module, 'get_public_global_models', lambda: [])

        result = GlazeAdminSite(name='glaze').get_app_list(RequestFactory().get('/admin/'))

        assert result == app_list
        assert all(app['app_label'] != 'public_libraries' for app in result)


@pytest.mark.django_db
class TestGlazeTypeAdmin:
    def test_save_model_syncs_singleton_combination(self):
        from api.admin import GlazeTypeAdmin

        superuser = User.objects.create_superuser(
            username='su-gt@example.com', email='su-gt@example.com', password='password'
        )
        ma = GlazeTypeAdmin(GlazeType, AdminSite())
        request = RequestFactory().post('/')
        request.user = superuser

        glaze_type = GlazeType(name='Admin Celadon')
        ma.save_model(request, glaze_type, type('FakeForm', (), {'cleaned_data': {}})(), change=False)

        combo = GlazeCombination.objects.get(user=None, name='Admin Celadon')
        assert list(combo.layers.values_list('glaze_type_id', flat=True)) == [glaze_type.pk]
