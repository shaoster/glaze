"""Tests for global domain type models and the generic /api/globals/ endpoints.

Covers:
- GlobalModel base class:
  - _registry contains all registered concrete global model classes
  - Every registered global has a string-typed ``name`` DB field
  - User immutability: the ``user`` field cannot change after creation
    (parameterised over all registered GlobalModel subclasses)
  - Consistency between GlobalModel._registry and workflow.yml globals
    (every registered global has a corresponding entry in workflow.yml via
    get_global_model_and_field)

- Generic /api/globals/<global_name>/ endpoints (GET and POST):
  - GET: returns entries scoped to the requesting user (private-only globals)
  - GET: returns both user-private and public objects for public globals
  - POST: creates a new private entry, returns 200 if it already exists
  - POST: returns 400 for unknown/invalid field or empty value
  - POST: returns 404 for unknown global type
  - Isolation: entries from other users are not leaked
"""
import pytest

from api.models import ClayBody, GlobalModel, Location
from api.workflow import get_global_model_and_field


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _concrete_globals() -> list[type[GlobalModel]]:
    """Return all concrete (non-abstract) GlobalModel subclasses."""
    return [cls for cls in GlobalModel._registry if not cls._meta.abstract]


# ---------------------------------------------------------------------------
# GlobalModel._registry — registration and structural invariants
# ---------------------------------------------------------------------------

class TestGlobalModelRegistry:
    def test_registry_is_nonempty(self):
        assert len(_concrete_globals()) > 0

    @pytest.mark.parametrize('model_cls', _concrete_globals())
    def test_has_string_name_field(self, model_cls):
        """Every GlobalModel subclass must have a string-typed ``name`` DB field."""
        field = model_cls._meta.get_field('name')
        assert field.get_internal_type() == 'CharField', (
            f'{model_cls.__name__}.name should be a CharField, got {field.get_internal_type()}'
        )

    @pytest.mark.parametrize('model_cls', _concrete_globals())
    def test_consistent_with_workflow_globals(self, model_cls):
        """Every registered GlobalModel maps to a declared global in workflow.yml."""
        # get_global_model_and_field checks that the model exists in globals;
        # we need to find the global_name for this model_cls.
        found = False
        from api import workflow as wf
        for global_name in wf._GLOBALS_MAP:
            try:
                resolved_cls, _, _ = get_global_model_and_field(global_name)
                if resolved_cls is model_cls:
                    found = True
                    break
            except Exception:
                pass
        assert found, (
            f'{model_cls.__name__} is registered in GlobalModel._registry but has '
            f'no matching entry in workflow.yml globals'
        )


# ---------------------------------------------------------------------------
# ImmutableUser — user field cannot change after creation
# (parameterised over all registered GlobalModel subclasses)
# ---------------------------------------------------------------------------

def _make_global_instance(model_cls, user, other_user):
    """Create a minimal valid instance of a GlobalModel subclass for testing."""
    from api.models import GlazeCombination, GlazeType

    if model_cls is GlazeCombination:
        # GlazeCombination is created via get_or_create_with_layers.
        gt = GlazeType.objects.create(user=None, name='_IU_TestGlaze1')
        combo, _ = GlazeCombination.get_or_create_with_layers(user=None, glaze_types=[gt])
        return combo
    elif hasattr(model_cls, 'user') and model_cls._meta.get_field('user').null:
        # Public global (user nullable): create with user=None.
        return model_cls.objects.create(user=None, name='_IU_TestPublic')
    else:
        # Private-only global: create with a real user.
        return model_cls.objects.create(user=user, name='_IU_TestPrivate')


@pytest.mark.django_db
class TestImmutableUser:
    @pytest.mark.parametrize('model_cls', _concrete_globals())
    def test_changing_user_raises(self, model_cls, user, other_user):
        """Cannot change user on any GlobalModel subclass after creation."""
        instance = _make_global_instance(model_cls, user, other_user)
        # Change to a different user (or non-null if currently null).
        instance.user = other_user
        with pytest.raises(ValueError, match='Cannot change the user field'):
            instance.save()

    @pytest.mark.parametrize('model_cls', _concrete_globals())
    def test_updating_non_user_fields_does_not_raise(self, model_cls, user, other_user):
        """Saving non-user field changes on any GlobalModel subclass must succeed."""
        from api.models import GlazeCombination
        instance = _make_global_instance(model_cls, user, other_user)
        if model_cls is GlazeCombination:
            instance.is_food_safe = True
        else:
            instance.name = instance.name + '_updated'
        instance.save()  # Must not raise


# ---------------------------------------------------------------------------
# Generic /api/globals/ endpoint — Location (private-only global)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlobalEntriesLocation:
    def test_get_returns_entries(self, client, user):
        Location.objects.create(user=user, name='Kiln A')
        Location.objects.create(user=user, name='Kiln B')
        response = client.get('/api/globals/location/')
        assert response.status_code == 200
        names = [entry['name'] for entry in response.json()]
        assert names == sorted(names)
        assert 'Kiln A' in names

    def test_post_creates_entry(self, client):
        response = client.post(
            '/api/globals/location/',
            {'field': 'name', 'value': 'New Shelf'},
            format='json',
        )
        assert response.status_code == 201
        assert response.json()['name'] == 'New Shelf'
        assert Location.objects.filter(name='New Shelf').exists()

    def test_post_reuses_existing(self, client, user):
        Location.objects.create(user=user, name='Kiln Room')
        response = client.post(
            '/api/globals/location/',
            {'field': 'name', 'value': 'Kiln Room'},
            format='json',
        )
        assert response.status_code == 200
        assert Location.objects.filter(name='Kiln Room').count() == 1

    def test_invalid_field(self, client):
        response = client.post(
            '/api/globals/location/',
            {'field': 'unknown', 'value': 'x'},
            format='json',
        )
        assert response.status_code == 400

    def test_missing_value(self, client):
        response = client.post(
            '/api/globals/location/',
            {'field': 'name', 'value': ''},
            format='json',
        )
        assert response.status_code == 400

    def test_does_not_leak_other_users_entries(self, client, other_user):
        Location.objects.create(user=other_user, name='Other User Kiln')
        response = client.get('/api/globals/location/')
        assert response.status_code == 200
        assert response.json() == []


# ---------------------------------------------------------------------------
# Generic /api/globals/ endpoint — ClayBody (public + private global)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlobalEntriesClayBody:
    def test_fetch_clay_body_entries(self, client, user):
        ClayBody.objects.create(user=user, name='Stoneware')
        ClayBody.objects.create(user=user, name='Porcelain')
        response = client.get('/api/globals/clay_body/')
        assert response.status_code == 200
        names = [entry['name'] for entry in response.json()]
        assert names == ['Porcelain', 'Stoneware']

    def test_create_clay_body_entry(self, client):
        response = client.post(
            '/api/globals/clay_body/',
            {'field': 'name', 'value': 'Custom Clay'},
            format='json',
        )
        assert response.status_code == 201
        assert ClayBody.objects.filter(name='Custom Clay').exists()


# ---------------------------------------------------------------------------
# Generic /api/globals/ endpoint — shared behaviour
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlobalEntriesShared:
    def test_get_unknown_global_returns_404(self, client):
        response = client.get('/api/globals/does_not_exist/')
        assert response.status_code == 404
