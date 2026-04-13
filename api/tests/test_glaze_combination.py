"""Tests for GlazeCombination model and related API/admin behaviour (issue #42).

Covers:
- Model: public/private reference constraint (public combo -> public glaze types only)
- Model: ImmutableUserMixin (user field cannot change after creation)
- API GET: glaze_combination entries are returned with stringified FK display name
- API POST: blocked with 405 because private: false
- Workflow helpers: is_private_global returns False for glaze_combination
"""
import pytest

from api.models import GlazeCombination, GlazeType
from api.workflow import is_private_global


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _public_glaze_type(name: str) -> GlazeType:
    return GlazeType.objects.create(user=None, name=name)


def _private_glaze_type(user, name: str) -> GlazeType:
    return GlazeType.objects.create(user=user, name=name)


# ---------------------------------------------------------------------------
# ImmutableUserMixin — user field must not change after creation
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestImmutableUser:
    def test_changing_user_on_glaze_type_raises(self, user, other_user):
        gt = GlazeType.objects.create(user=user, name='Iron Red')
        gt.user = other_user
        with pytest.raises(ValueError, match='Cannot change the user field'):
            gt.save()

    def test_changing_user_to_none_on_glaze_type_raises(self, user):
        gt = GlazeType.objects.create(user=user, name='Iron Red')
        gt.user = None
        with pytest.raises(ValueError, match='Cannot change the user field'):
            gt.save()

    def test_changing_user_on_glaze_combination_raises(self, user, other_user):
        pub_gt1 = _public_glaze_type('Celadon')
        pub_gt2 = _public_glaze_type('Tenmoku')
        combo = GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=pub_gt1,
            second_layer_glaze_type=pub_gt2,
        )
        combo.user = user
        with pytest.raises(ValueError, match='Cannot change the user field'):
            combo.save()

    def test_updating_other_fields_does_not_raise(self, user):
        gt = GlazeType.objects.create(user=user, name='Shino')
        gt.short_description = 'Updated description'
        gt.save()  # Must not raise
        gt.refresh_from_db()
        assert gt.short_description == 'Updated description'

    def test_new_object_creation_does_not_raise(self):
        # Creating with user=None (public) must succeed on first save.
        gt = GlazeType(user=None, name='New Public Glaze')
        gt.save()  # Must not raise


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

    def test_public_combo_str(self):
        gt1 = _public_glaze_type('Celadon')
        gt2 = _public_glaze_type('Iron Red')
        combo = GlazeCombination.objects.create(
            user=None,
            first_layer_glaze_type=gt1,
            second_layer_glaze_type=gt2,
        )
        assert str(combo) == 'Celadon + Iron Red'

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
# Workflow helper: is_private_global
# ---------------------------------------------------------------------------

class TestIsPrivateGlobal:
    def test_glaze_combination_is_not_private(self):
        assert is_private_global('glaze_combination') is False

    def test_clay_body_is_private(self):
        assert is_private_global('clay_body') is True

    def test_glaze_type_is_private(self):
        assert is_private_global('glaze_type') is True

    def test_location_is_private(self):
        assert is_private_global('location') is True

    def test_unknown_global_defaults_to_private(self):
        # Unknown global names should default to private (safe default).
        assert is_private_global('nonexistent_global') is True


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
        # name comes from str(first_layer_glaze_type)
        assert data[0]['name'] == 'Celadon'

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
