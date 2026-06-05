import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from api.models import ENTRY_STATE, Image, Piece, PieceState, PieceStateImage


@pytest.fixture
def user(db):
    return User.objects.create(username="test@example.com", email="test@example.com")


@pytest.fixture
def other_user(db):
    return User.objects.create(username="other@example.com", email="other@example.com")


@pytest.fixture
def client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def other_client(other_user):
    c = APIClient()
    c.force_authenticate(user=other_user)
    return c


@pytest.fixture
def editable_piece(user, db):
    p = Piece.objects.create(user=user, name="Test Bowl", is_editable=True)
    PieceState.objects.create(piece=p, state=ENTRY_STATE, order=1)
    return p


@pytest.fixture
def non_editable_piece(user, db):
    p = Piece.objects.create(user=user, name="Locked Bowl", is_editable=False)
    PieceState.objects.create(piece=p, state=ENTRY_STATE, order=1)
    return p


@pytest.fixture
def image_in_editable_piece(user, editable_piece):
    img = Image.objects.create(user=user, url="https://example.com/img.jpg")
    PieceStateImage.objects.create(
        piece_state=editable_piece.current_state, image=img, order=0
    )
    return img


@pytest.fixture
def image_in_non_editable_piece(user, non_editable_piece):
    img = Image.objects.create(user=user, url="https://example.com/img.jpg")
    PieceStateImage.objects.create(
        piece_state=non_editable_piece.current_state, image=img, order=0
    )
    return img


VALID_CROP = {"x": 0.1, "y": 0.2, "width": 0.6, "height": 0.5}


@pytest.mark.django_db
class TestPatchImageCrop:
    def test_success_updates_crop(
        self, client, image_in_editable_piece, editable_piece
    ):
        image = image_in_editable_piece
        response = client.patch(
            f"/api/images/{image.id}/crop/",
            VALID_CROP,
            format="json",
        )
        assert response.status_code == 200
        link = PieceStateImage.objects.get(
            image=image, piece_state=editable_piece.current_state
        )
        assert link.crop == VALID_CROP

    def test_success_updates_thumbnail_image_crop_in_piece_response(self, client, user):
        piece = Piece.objects.create(user=user, name="Thumbnail Bowl", is_editable=True)
        state = PieceState.objects.create(
            piece=piece,
            user=user,
            state=ENTRY_STATE,
            order=1,
        )
        image = Image.objects.create(
            user=user,
            url="https://example.com/thumb.jpg",
            cloud_name="demo",
            cloudinary_public_id="pieces/thumb",
        )
        original_crop = {"x": 0.05, "y": 0.1, "width": 0.6, "height": 0.6}
        PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            crop=original_crop,
            order=0,
        )
        piece.thumbnail = image
        piece.save(update_fields=["thumbnail"])

        response = client.patch(
            f"/api/images/{image.id}/crop/",
            VALID_CROP,
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["thumbnail"]["crop"] == VALID_CROP

    def test_non_owner_returns_404(self, other_client, image_in_editable_piece):
        image = image_in_editable_piece
        response = other_client.patch(
            f"/api/images/{image.id}/crop/",
            VALID_CROP,
            format="json",
        )
        assert response.status_code == 404

    def test_non_editable_piece_allows_crop(
        self, client, image_in_non_editable_piece, non_editable_piece
    ):
        # Crop is intentionally allowed on sealed/non-editable pieces so potters
        # can correct a bad auto-crop without needing to re-open the piece.
        image = image_in_non_editable_piece
        response = client.patch(
            f"/api/images/{image.id}/crop/",
            VALID_CROP,
            format="json",
        )
        assert response.status_code == 200
        link = PieceStateImage.objects.get(
            image=image, piece_state=non_editable_piece.current_state
        )
        assert link.crop == VALID_CROP

    def test_unauthenticated_returns_403(self, image_in_editable_piece):
        c = APIClient()  # no force_authenticate
        image = image_in_editable_piece
        response = c.patch(
            f"/api/images/{image.id}/crop/",
            VALID_CROP,
            format="json",
        )
        assert response.status_code == 401

    def test_invalid_crop_missing_field_returns_400(
        self, client, image_in_editable_piece
    ):
        image = image_in_editable_piece
        response = client.patch(
            f"/api/images/{image.id}/crop/",
            {"x": 0.1, "y": 0.2, "width": 0.6},  # missing height
            format="json",
        )
        assert response.status_code == 400
