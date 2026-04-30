"""Tests for the Glaze Combination Picker feature (issue #35).

Covers:
- GET /api/globals/glaze_combination/ richer response shape (test_tile_image,
  filter booleans, glaze_types list, is_favorite, is_public).
- GET filtering: ?glaze_type_ids=, ?is_food_safe=, ?runs=,
  ?highlights_grooves=, ?is_different_on_white_and_brown_clay=.
- POST /api/globals/glaze_combination/<pk>/favorite/ — add favorite.
- DELETE /api/globals/glaze_combination/<pk>/favorite/ — remove favorite.
- is_favorite reflects per-user state; does not leak across users.
- Favorite of another user's private combination returns 404.
"""
import pytest

from api.models import (
    FavoriteGlazeCombination,
    GlazeCombination,
    GlazeType,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pub_gt(name: str) -> GlazeType:
    return GlazeType.objects.create(user=None, name=name)


def _pub_combo(*glaze_types, **props) -> GlazeCombination:
    combo = GlazeCombination.get_or_create_with_components(user=None, glaze_types=list(glaze_types))[0]
    if props:
        for k, v in props.items():
            setattr(combo, k, v)
        combo.save()
    return combo


# ---------------------------------------------------------------------------
# Richer GET response shape
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlazeCombinationGetShape:
    def test_response_includes_all_fields(self, client):
        gt = _pub_gt('Iron Red')
        combo = _pub_combo(gt, is_food_safe=True, runs=False, highlights_grooves=None,
                           is_different_on_white_and_brown_clay=True,
                           test_tile_image={'url': 'https://example.com/tile.jpg', 'cloudinary_public_id': 'tile', 'cloud_name': None})

        response = client.get('/api/globals/glaze_combination/')

        assert response.status_code == 200
        item = next(i for i in response.data if i['id'] == str(combo.pk))
        assert item['name'] == combo.name
        assert item['test_tile_image'] == {'url': 'https://example.com/tile.jpg', 'cloudinary_public_id': 'tile', 'cloud_name': None}
        assert item['is_food_safe'] is True
        assert item['runs'] is False
        assert item['highlights_grooves'] is None
        assert item['is_different_on_white_and_brown_clay'] is True
        assert item['is_public'] is True
        assert item['is_favorite'] is False
        assert item['glaze_types'] == [{'id': str(gt.pk), 'name': 'Iron Red'}]

    def test_glaze_types_ordered(self, client):
        gt1 = _pub_gt('Base')
        gt2 = _pub_gt('Overlay')
        combo = _pub_combo(gt1, gt2)

        response = client.get('/api/globals/glaze_combination/')

        item = next(i for i in response.data if i['id'] == str(combo.pk))
        assert [g['name'] for g in item['glaze_types']] == ['Base', 'Overlay']


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestGlazeCombinationFiltering:
    def test_filter_by_glaze_type_id(self, client):
        gt_a = _pub_gt('Celadon')
        gt_b = _pub_gt('Clear')
        combo_a = _pub_combo(gt_a)
        _pub_combo(gt_b)

        response = client.get('/api/globals/glaze_combination/', {'glaze_type_ids': str(gt_a.pk)})

        assert response.status_code == 200
        ids = [i['id'] for i in response.data]
        assert str(combo_a.pk) in ids
        assert all(
            any(g['id'] == str(gt_a.pk) for g in i['glaze_types'])
            for i in response.data
        )

    def test_filter_by_multiple_glaze_type_ids_requires_all(self, client):
        gt_a = _pub_gt('Celadon')
        gt_b = _pub_gt('Clear')
        combo_both = _pub_combo(gt_a, gt_b)
        _pub_combo(gt_a)  # only gt_a — should be excluded

        ids_param = f'{gt_a.pk},{gt_b.pk}'
        response = client.get('/api/globals/glaze_combination/', {'glaze_type_ids': ids_param})

        assert response.status_code == 200
        ids = [i['id'] for i in response.data]
        assert str(combo_both.pk) in ids
        # The single-layer combo should not appear.
        assert len(ids) == 1

    def test_filter_is_food_safe_true(self, client):
        gt = _pub_gt('Safe')
        safe = _pub_combo(gt, is_food_safe=True)
        gt2 = _pub_gt('Unsafe')
        _pub_combo(gt2, is_food_safe=False)

        response = client.get('/api/globals/glaze_combination/', {'is_food_safe': 'true'})

        ids = [i['id'] for i in response.data]
        assert str(safe.pk) in ids
        assert all(i['is_food_safe'] is True for i in response.data)

    def test_filter_is_food_safe_false(self, client):
        gt = _pub_gt('Safe2')
        gt2 = _pub_gt('Unsafe2')
        _pub_combo(gt, is_food_safe=True)
        unsafe = _pub_combo(gt2, is_food_safe=False)

        response = client.get('/api/globals/glaze_combination/', {'is_food_safe': 'false'})

        ids = [i['id'] for i in response.data]
        assert str(unsafe.pk) in ids
        assert all(i['is_food_safe'] is False for i in response.data)

    def test_filter_runs(self, client):
        gt1 = _pub_gt('Runny')
        gt2 = _pub_gt('Stable')
        runs_combo = _pub_combo(gt1, runs=True)
        _pub_combo(gt2, runs=False)

        response = client.get('/api/globals/glaze_combination/', {'runs': 'true'})

        ids = [i['id'] for i in response.data]
        assert str(runs_combo.pk) in ids
        assert all(i['runs'] is True for i in response.data)

    def test_no_filter_returns_all_visible(self, client, user):
        gt1 = _pub_gt('Pub')
        gt2 = _pub_gt('Priv')
        pub_combo = _pub_combo(gt1)
        priv_combo = GlazeCombination.get_or_create_with_components(user=user, glaze_types=[gt2])[0]

        response = client.get('/api/globals/glaze_combination/')

        ids = [i['id'] for i in response.data]
        assert str(pub_combo.pk) in ids
        assert str(priv_combo.pk) in ids


# ---------------------------------------------------------------------------
# Favorite toggle — POST
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestFavoriteAdd:
    def test_adds_favorite(self, client, user):
        gt = _pub_gt('IronRed')
        combo = _pub_combo(gt)

        response = client.post(f'/api/globals/glaze_combination/{combo.pk}/favorite/')

        assert response.status_code == 204
        assert FavoriteGlazeCombination.objects.filter(user=user, glaze_combination=combo).exists()

    def test_idempotent(self, client, user):
        gt = _pub_gt('IronRed2')
        combo = _pub_combo(gt)
        FavoriteGlazeCombination.objects.create(user=user, glaze_combination=combo)

        response = client.post(f'/api/globals/glaze_combination/{combo.pk}/favorite/')

        assert response.status_code == 204
        assert FavoriteGlazeCombination.objects.filter(user=user, glaze_combination=combo).count() == 1

    def test_is_favorite_reflected_in_list(self, client, user):
        gt = _pub_gt('Fav')
        combo = _pub_combo(gt)
        FavoriteGlazeCombination.objects.create(user=user, glaze_combination=combo)

        response = client.get('/api/globals/glaze_combination/')

        item = next(i for i in response.data if i['id'] == str(combo.pk))
        assert item['is_favorite'] is True

    def test_favorite_not_visible_to_other_user(self, client, user, other_user):
        from rest_framework.test import APIClient
        gt = _pub_gt('SharedGlaze')
        combo = _pub_combo(gt)
        FavoriteGlazeCombination.objects.create(user=user, glaze_combination=combo)

        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.get('/api/globals/glaze_combination/')

        item = next(i for i in response.data if i['id'] == str(combo.pk))
        assert item['is_favorite'] is False

    def test_returns_404_for_unknown_combination(self, client):
        response = client.post('/api/globals/glaze_combination/999999/favorite/')
        assert response.status_code == 404

    def test_cannot_favorite_other_users_private_combination(self, client, user, other_user):
        gt = _pub_gt('PrivGlaze')
        priv_combo = GlazeCombination.get_or_create_with_components(user=other_user, glaze_types=[gt])[0]

        response = client.post(f'/api/globals/glaze_combination/{priv_combo.pk}/favorite/')

        assert response.status_code == 404

    def test_returns_404_for_unsupported_global_type(self, client):
        # Non-favoritable globals have no favorite route registered, so the
        # correct response is 404 (no route) rather than 405 (route exists but
        # method not allowed).
        response = client.post('/api/globals/location/some-id/favorite/')
        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Favorite toggle — DELETE
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestFavoriteRemove:
    def test_removes_favorite(self, client, user):
        gt = _pub_gt('ToRemove')
        combo = _pub_combo(gt)
        FavoriteGlazeCombination.objects.create(user=user, glaze_combination=combo)

        response = client.delete(f'/api/globals/glaze_combination/{combo.pk}/favorite/')

        assert response.status_code == 204
        assert not FavoriteGlazeCombination.objects.filter(user=user, glaze_combination=combo).exists()

    def test_idempotent_when_not_favorited(self, client, user):
        gt = _pub_gt('NotFav')
        combo = _pub_combo(gt)

        response = client.delete(f'/api/globals/glaze_combination/{combo.pk}/favorite/')

        assert response.status_code == 204

    def test_is_favorite_false_after_removal(self, client, user):
        gt = _pub_gt('WasFav')
        combo = _pub_combo(gt)
        FavoriteGlazeCombination.objects.create(user=user, glaze_combination=combo)

        client.delete(f'/api/globals/glaze_combination/{combo.pk}/favorite/')
        response = client.get('/api/globals/glaze_combination/')

        item = next(i for i in response.data if i['id'] == str(combo.pk))
        assert item['is_favorite'] is False
