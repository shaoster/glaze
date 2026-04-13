"""Tests for GlazeCombination model and related API/admin behaviour (issue #42).

Covers:
- Model: public/private reference constraint (public combo -> public glaze types only)
- Model: computed ``name`` field (first_layer!second_layer, stored on save)
- Model: GlazeType.name validation rejects the combination name separator ("!")
- API GET: glaze_combination entries are returned with the computed name
- API POST: blocked with 405 because private: false

Note: ImmutableUser tests for GlazeCombination live in test_globals.py as part
of the parameterised TestImmutableUser suite (covers all GlobalModel subclasses).
"""
import pytest

from api.models import GLAZE_COMBINATION_NAME_SEPARATOR, GlazeCombination, GlazeType


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _public_glaze_type(name: str) -> GlazeType:
    return GlazeType.objects.create(user=None, name=name)


def _private_glaze_type(user, name: str) -> GlazeType:
    return GlazeType.objects.create(user=user, name=name)


# ---------------------------------------------------------------------------
# GlazeType.name validation — separator character must be rejected
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlazeTypeNameValidation:
    def test_name_with_separator_raises(self):
        gt = GlazeType(user=None, name=f'Bad{GLAZE_COMBINATION_NAME_SEPARATOR}Name')
        with pytest.raises(ValueError, match='cannot contain'):
            gt.save()

    def test_name_without_separator_succeeds(self):
        gt = GlazeType(user=None, name='Iron Red')
        gt.save()  # Must not raise
        assert gt.pk is not None


# ---------------------------------------------------------------------------
# GlazeCombination — computed name field
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlazeCombinationName:
    def test_name_is_set_on_save(self):
        gt1 = _public_glaze_type('Celadon')
        gt2 = _public_glaze_type('Iron Red')
        combo = GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        expected = f'Celadon{GLAZE_COMBINATION_NAME_SEPARATOR}Iron Red'
        assert combo.name == expected

    def test_name_persisted_to_db(self):
        gt1 = _public_glaze_type('Ash')
        gt2 = _public_glaze_type('Tenmoku')
        combo = GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        combo.refresh_from_db()
        assert combo.name == f'Ash{GLAZE_COMBINATION_NAME_SEPARATOR}Tenmoku'

    def test_str_returns_name(self):
        gt1 = _public_glaze_type('Celadon')
        gt2 = _public_glaze_type('Iron Red')
        combo = GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        assert str(combo) == combo.name


# ---------------------------------------------------------------------------
# GlazeCombination — public/private reference constraint
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlazeCombinationPublicConstraint:
    def test_public_combo_with_public_types_succeeds(self):
        gt1 = _public_glaze_type('Celadon')
        gt2 = _public_glaze_type('Iron Red')
        combo = GlazeCombination(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        combo.save()  # Must not raise
        assert combo.pk is not None

    def test_public_combo_with_private_first_layer_raises(self, user):
        private_gt = _private_glaze_type(user, 'Private Glaze')
        pub_gt = _public_glaze_type('Celadon')
        combo = GlazeCombination(
            user=None,
            first_layer_glaze_type=private_gt,
            second_layer_glaze_type=pub_gt,
        )
        with pytest.raises(ValueError, match='Public glaze combinations can only reference public glaze types'):
            combo.save()

    def test_public_combo_with_private_second_layer_raises(self, user):
        pub_gt = _public_glaze_type('Celadon')
        private_gt = _private_glaze_type(user, 'Private Glaze')
        combo = GlazeCombination(
            user=None,
            first_layer_glaze_type=pub_gt,
            second_layer_glaze_type=private_gt,
        )
        with pytest.raises(ValueError, match='Public glaze combinations can only reference public glaze types'):
            combo.save()

    def test_private_combo_can_reference_private_types(self, user):
        priv_gt1 = _private_glaze_type(user, 'Private A')
        priv_gt2 = _private_glaze_type(user, 'Private B')
        combo = GlazeCombination(
            user=user,
            first_layer_glaze_type=priv_gt1,
            second_layer_glaze_type=priv_gt2,
        )
        combo.save()  # Must not raise
        assert combo.pk is not None

    def test_private_combo_can_reference_public_types(self, user):
        pub_gt1 = _public_glaze_type('Celadon')
        pub_gt2 = _public_glaze_type('Iron Red')
        combo = GlazeCombination(
            user=user,
            first_layer_glaze_type=pub_gt1,
            second_layer_glaze_type=pub_gt2,
        )
        combo.save()  # Must not raise
        assert combo.pk is not None

    def test_public_uniqueness_constraint(self):
        gt1 = _public_glaze_type('Celadon')
        gt2 = _public_glaze_type('Iron Red')
        GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        from django.db import IntegrityError
        with pytest.raises(IntegrityError):
            GlazeCombination.objects.create(
                user=None,
                first_layer_glaze_type=gt1,
                second_layer_glaze_type=gt2,
            )


# ---------------------------------------------------------------------------
# API: GET /api/globals/glaze_combination/
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlazeCombinationApiGet:
    def test_get_returns_public_combinations(self, client):
        gt1 = _public_glaze_type('Celadon')
        gt2 = _public_glaze_type('Iron Red')
        GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        response = client.get('/api/globals/glaze_combination/')
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]['is_public'] is True
        # name is the computed combination name
        expected_name = f'Celadon{GLAZE_COMBINATION_NAME_SEPARATOR}Iron Red'
        assert data[0]['name'] == expected_name

    def test_get_returns_empty_when_no_combinations(self, client):
        response = client.get('/api/globals/glaze_combination/')
        assert response.status_code == 200
        assert response.json() == []

    def test_get_includes_is_public_flag(self, client):
        gt1 = _public_glaze_type('Ash')
        gt2 = _public_glaze_type('Rutile Blue')
        GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        response = client.get('/api/globals/glaze_combination/')
        assert response.status_code == 200
        entry = response.json()[0]
        assert 'is_public' in entry
        assert entry['is_public'] is True


# ---------------------------------------------------------------------------
# API: POST /api/globals/glaze_combination/ is blocked (private: false)
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlazeCombinationApiPost:
    def test_post_returns_405(self, client):
        response = client.post(
            '/api/globals/glaze_combination/',
            {'field': 'first_layer_glaze_type', 'value': 'Celadon'},
            format='json',
        )
        assert response.status_code == 405
