"""Tests for GlazeCombination / GlazeCombinationLayer model and API (issue #42 + M2M refactor).

Covers:
- GlazeCombinationLayer.save(): public combination → public glaze types only
- GlazeCombination.compute_name(): name built from ordered layer names
- GlazeCombination.get_or_create_with_components(): find-or-create semantics
- GlazeType.name validation: separator character is rejected
- Name-based uniqueness constraints (public and per-user)
- API GET /api/globals/glaze_combination/: returns public + user-private combos (via global_entries)
- API POST /api/globals/glaze_combination/: creates private combo from layer IDs (via global_entries)
- API POST: returns 200 if combo already exists, 201 if created
- API POST: returns 400 for unknown GlazeType IDs or empty layer list
"""

import pytest
from django.apps import apps

from api.models import (
    COMPOSITE_NAME_SEPARATOR,
    ENTRY_STATE,
    GlazeCombination,
    GlazeCombinationLayer,
    GlazeType,
    Piece,
    PieceState,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pub_gt(name: str) -> GlazeType:
    return GlazeType.objects.create(user=None, name=name)


def _priv_gt(user, name: str) -> GlazeType:
    return GlazeType.objects.create(user=user, name=name)


def _pub_combo(*glaze_types) -> GlazeCombination:
    """Create a public combination from the given ordered GlazeType instances."""
    return GlazeCombination.get_or_create_with_components(
        user=None, glaze_types=list(glaze_types)
    )[0]


# ---------------------------------------------------------------------------
# GlazeType.name validation — separator character must be rejected
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGlazeTypeNameValidation:
    def test_name_with_separator_raises(self):
        gt = GlazeType(user=None, name=f"Bad{COMPOSITE_NAME_SEPARATOR}Name")
        with pytest.raises(ValueError, match="cannot contain"):
            gt.save()

    def test_name_without_separator_succeeds(self):
        gt = GlazeType(user=None, name="Iron Red")
        gt.save()
        assert gt.pk is not None


# ---------------------------------------------------------------------------
# GlazeCombination.compute_name
# ---------------------------------------------------------------------------


class TestComputeName:
    def test_single_layer(self):
        assert GlazeCombination.compute_name(["Celadon"]) == "Celadon"

    def test_two_layers(self):
        sep = COMPOSITE_NAME_SEPARATOR
        assert (
            GlazeCombination.compute_name(["Celadon", "Iron Red"])
            == f"Celadon{sep}Iron Red"
        )

    def test_three_layers(self):
        sep = COMPOSITE_NAME_SEPARATOR
        result = GlazeCombination.compute_name(["A", "B", "C"])
        assert result == f"A{sep}B{sep}C"


# ---------------------------------------------------------------------------
# GlazeCombinationLayer public reference constraint
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestLayerPublicConstraint:
    def test_public_combo_with_public_layer_succeeds(self):
        gt = _pub_gt("Celadon")
        combo = GlazeCombination.objects.create(user=None, name="Celadon")
        layer = GlazeCombinationLayer(combination=combo, glaze_type=gt, order=0)
        layer.save()  # must not raise
        assert layer.pk is not None

    def test_public_combo_with_private_layer_raises(self, user):
        priv_gt = _priv_gt(user, "Private Glaze")
        combo = GlazeCombination.objects.create(user=None, name="placeholder")
        layer = GlazeCombinationLayer(combination=combo, glaze_type=priv_gt, order=0)
        with pytest.raises(
            ValueError,
            match="Public GlazeCombination can only reference public GlazeType instances",
        ):
            layer.save()

    def test_private_combo_can_reference_private_layer(self, user):
        priv_gt = _priv_gt(user, "Private A")
        combo = GlazeCombination.objects.create(user=user, name="placeholder")
        layer = GlazeCombinationLayer(combination=combo, glaze_type=priv_gt, order=0)
        layer.save()  # must not raise
        assert layer.pk is not None

    def test_private_combo_can_reference_public_layer(self, user):
        pub_gt = _pub_gt("Celadon")
        combo = GlazeCombination.objects.create(user=user, name="placeholder")
        layer = GlazeCombinationLayer(combination=combo, glaze_type=pub_gt, order=0)
        layer.save()  # must not raise
        assert layer.pk is not None


# ---------------------------------------------------------------------------
# GlazeCombination.get_or_create_with_components
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGetOrCreateWithLayers:
    def test_single_layer_name(self):
        gt = _pub_gt("Celadon")
        combo, created = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt]
        )
        assert created
        assert combo.name == "Celadon"

    def test_two_layer_name(self):
        sep = COMPOSITE_NAME_SEPARATOR
        gt1 = _pub_gt("Celadon")
        gt2 = _pub_gt("Iron Red")
        combo, created = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt1, gt2]
        )
        assert created
        assert combo.name == f"Celadon{sep}Iron Red"

    def test_three_layer_name(self):
        sep = COMPOSITE_NAME_SEPARATOR
        gt1 = _pub_gt("A")
        gt2 = _pub_gt("B")
        gt3 = _pub_gt("C")
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt1, gt2, gt3]
        )
        assert combo.name == f"A{sep}B{sep}C"

    def test_same_glaze_twice(self):
        sep = COMPOSITE_NAME_SEPARATOR
        gt = _pub_gt("Shino")
        combo, created = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt, gt]
        )
        assert created
        assert combo.name == f"Shino{sep}Shino"
        assert combo.layers.count() == 2

    def test_idempotent_returns_existing(self):
        gt1 = _pub_gt("Celadon")
        gt2 = _pub_gt("Iron Red")
        combo1, created1 = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt1, gt2]
        )
        combo2, created2 = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt1, gt2]
        )
        assert created1
        assert not created2
        assert combo1.pk == combo2.pk

    def test_layer_order_preserved(self):
        gt1 = _pub_gt("First")
        gt2 = _pub_gt("Second")
        gt3 = _pub_gt("Third")
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt1, gt2, gt3]
        )
        layers = list(combo.layers.order_by("order"))
        assert [layer.glaze_type for layer in layers] == [gt1, gt2, gt3]

    def test_empty_list_raises(self):
        with pytest.raises(ValueError, match="at least one component"):
            GlazeCombination.get_or_create_with_components(user=None, glaze_types=[])

    def test_name_persisted_to_db(self):
        gt = _pub_gt("Tenmoku")
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt]
        )
        combo.refresh_from_db()
        assert combo.name == "Tenmoku"

    def test_str_returns_name(self):
        gt = _pub_gt("Ash")
        combo, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt]
        )
        assert str(combo) == combo.name

    def test_private_combo_for_user(self, user):
        gt1 = _pub_gt("Celadon")
        gt2 = _pub_gt("Iron Red")
        combo, created = GlazeCombination.get_or_create_with_components(
            user=user, glaze_types=[gt1, gt2]
        )
        assert created
        assert combo.user == user


# ---------------------------------------------------------------------------
# Name uniqueness constraints
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestUniquenessConstraints:
    def test_public_uniqueness_by_name(self):
        gt = _pub_gt("Celadon")
        _pub_combo(gt)
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            GlazeCombination.objects.create(user=None, name="Celadon")

    def test_per_user_uniqueness_by_name(self, user):
        gt = _pub_gt("Celadon")
        GlazeCombination.get_or_create_with_components(user=user, glaze_types=[gt])
        from django.db import IntegrityError

        with pytest.raises(IntegrityError):
            GlazeCombination.objects.create(user=user, name="Celadon")

    def test_public_and_private_may_share_name(self, user):
        gt = _pub_gt("Celadon")
        pub, _ = GlazeCombination.get_or_create_with_components(
            user=None, glaze_types=[gt]
        )
        priv, created = GlazeCombination.get_or_create_with_components(
            user=user, glaze_types=[gt]
        )
        assert created
        assert pub.pk != priv.pk
        assert pub.name == priv.name


# ---------------------------------------------------------------------------
# API: GET /api/globals/glaze_combination/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGlazeCombinationApiGet:
    def test_returns_public_combinations(self, client):
        gt = _pub_gt("Celadon")
        _pub_combo(gt)
        response = client.get("/api/globals/glaze_combination/")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Celadon"
        assert data[0]["is_public"] is True

    def test_returns_user_private_combinations(self, client, user):
        gt = _pub_gt("Iron Red")
        GlazeCombination.get_or_create_with_components(user=user, glaze_types=[gt])
        response = client.get("/api/globals/glaze_combination/")
        assert response.status_code == 200
        names = [e["name"] for e in response.json()]
        assert "Iron Red" in names

    def test_returns_both_public_and_private(self, client, user):
        pub_gt = _pub_gt("Celadon")
        priv_gt = _priv_gt(user, "Private Red")
        _pub_combo(pub_gt)
        GlazeCombination.get_or_create_with_components(user=user, glaze_types=[priv_gt])
        response = client.get("/api/globals/glaze_combination/")
        assert response.status_code == 200
        data = response.json()
        names = {e["name"] for e in data}
        assert "Celadon" in names
        assert "Private Red" in names

    def test_does_not_return_other_users_private_combinations(
        self, client, user, other_user
    ):
        gt = _priv_gt(other_user, "Other Users Glaze")
        GlazeCombination.get_or_create_with_components(
            user=other_user, glaze_types=[gt]
        )
        response = client.get("/api/globals/glaze_combination/")
        assert response.status_code == 200
        names = [e["name"] for e in response.json()]
        assert "Other Users Glaze" not in names

    def test_returns_empty_when_no_combinations(self, client):
        response = client.get("/api/globals/glaze_combination/")
        assert response.status_code == 200
        assert response.json() == []

    def test_response_includes_id_and_is_public(self, client):
        gt = _pub_gt("Ash")
        _pub_combo(gt)
        response = client.get("/api/globals/glaze_combination/")
        entry = response.json()[0]
        assert "id" in entry
        assert "name" in entry
        assert "is_public" in entry


# ---------------------------------------------------------------------------
# API: POST /api/globals/glaze_combination/
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestGlazeCombinationApiPost:
    def test_creates_single_layer_combination(self, client):
        gt = _pub_gt("Celadon")
        response = client.post(
            "/api/globals/glaze_combination/",
            {"layers": [gt.pk]},
            format="json",
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Celadon"
        assert data["is_public"] is False

    def test_creates_two_layer_combination(self, client):
        sep = COMPOSITE_NAME_SEPARATOR
        gt1 = _pub_gt("Celadon")
        gt2 = _pub_gt("Iron Red")
        response = client.post(
            "/api/globals/glaze_combination/",
            {"layers": [gt1.pk, gt2.pk]},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["name"] == f"Celadon{sep}Iron Red"

    def test_returns_200_if_already_exists(self, client, user):
        gt = _pub_gt("Celadon")
        GlazeCombination.get_or_create_with_components(user=user, glaze_types=[gt])
        response = client.post(
            "/api/globals/glaze_combination/",
            {"layers": [gt.pk]},
            format="json",
        )
        assert response.status_code == 200

    def test_creates_private_combination_owned_by_user(self, client, user):
        gt = _pub_gt("Celadon")
        response = client.post(
            "/api/globals/glaze_combination/",
            {"layers": [gt.pk]},
            format="json",
        )
        assert response.status_code == 201
        combo = GlazeCombination.objects.get(pk=response.json()["id"])
        assert combo.user == user

    def test_unknown_glaze_type_id_returns_400(self, client):
        response = client.post(
            "/api/globals/glaze_combination/",
            {"layers": [99999]},
            format="json",
        )
        assert response.status_code == 400

    def test_empty_layers_returns_400(self, client):
        response = client.post(
            "/api/globals/glaze_combination/",
            {"layers": []},
            format="json",
        )
        assert response.status_code == 400

    def test_missing_layers_key_returns_400(self, client):
        response = client.post(
            "/api/globals/glaze_combination/",
            {"something_else": "value"},
            format="json",
        )
        assert response.status_code == 400

    def test_same_glaze_twice_creates_double_layer(self, client):
        sep = COMPOSITE_NAME_SEPARATOR
        gt = _pub_gt("Shino")
        response = client.post(
            "/api/globals/glaze_combination/",
            {"layers": [gt.pk, gt.pk]},
            format="json",
        )
        assert response.status_code == 201
        assert response.json()["name"] == f"Shino{sep}Shino"


@pytest.mark.django_db
class TestGlazeCombinationImages:
    def test_returns_empty_when_combo_ref_has_no_qualifying_piece_images(
        self, client, user
    ):
        gt = _pub_gt("Sparse")
        combo = _pub_combo(gt)
        piece = Piece.objects.create(user=user, name="Sparse Usage")
        PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)
        glazed = PieceState.objects.create(
            piece=piece, user=user, state="glazed", images=[]
        )
        ref_model = apps.get_model("api", "PieceStateGlazeCombinationRef")
        ref_model.objects.create(
            piece_state=glazed,
            field_name="glaze_combination",
            glaze_combination=combo,
        )

        response = client.get("/api/analysis/glaze-combination-images/")

        assert response.status_code == 200
        assert response.json() == []

    def test_uses_current_state_combo_ref_for_piece_grouping(self, client, user):
        old_gt = _pub_gt("Old Combo Glaze")
        current_gt = _pub_gt("Current Combo Glaze")
        old_combo = _pub_combo(old_gt)
        current_combo = _pub_combo(current_gt)
        piece = Piece.objects.create(user=user, name="Changed Glaze Plan")
        PieceState.objects.create(piece=piece, user=user, state=ENTRY_STATE)
        old_state = PieceState.objects.create(
            piece=piece,
            user=user,
            state="glazed",
            images=[{"url": "https://example.com/old.jpg", "caption": "old"}],
        )
        current_state = PieceState.objects.create(
            piece=piece,
            user=user,
            state="glazed",
            images=[{"url": "https://example.com/current.jpg", "caption": "current"}],
        )
        ref_model = apps.get_model("api", "PieceStateGlazeCombinationRef")
        ref_model.objects.create(
            piece_state=old_state,
            field_name="glaze_combination",
            glaze_combination=old_combo,
        )
        ref_model.objects.create(
            piece_state=current_state,
            field_name="glaze_combination",
            glaze_combination=current_combo,
        )

        response = client.get("/api/analysis/glaze-combination-images/")

        assert response.status_code == 200
        body = response.json()
        assert len(body) == 1
        assert body[0]["glaze_combination"]["id"] == str(current_combo.pk)
        assert body[0]["pieces"][0]["state"] == "glazed"
        assert [img["url"] for img in body[0]["pieces"][0]["images"]] == [
            "https://example.com/current.jpg",
            "https://example.com/old.jpg",
        ]
