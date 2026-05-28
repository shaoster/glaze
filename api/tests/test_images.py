import pytest
from rest_framework.test import APIClient

from api.models import (
    ENTRY_STATE,
    SUCCESSORS,
    Image,
    Piece,
    PieceState,
    PieceStateImage,
)


@pytest.mark.django_db
class TestPieceImagePatch:
    @pytest.fixture
    def auth_client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    @pytest.fixture
    def editable_piece_with_two_states(self, user):
        piece = Piece.objects.create(user=user, name="Bowl", is_editable=True)
        state1 = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        next_state = SUCCESSORS[ENTRY_STATE][0]
        state2 = PieceState.objects.create(piece=piece, state=next_state, order=1)
        return piece, state1, state2

    def _url(self, image_id, from_state_id):
        return f"/api/images/{image_id}/piece_state/{from_state_id}/"

    def test_move_non_thumbnail_image(
        self, auth_client, editable_piece_with_two_states
    ):
        piece, state1, state2 = editable_piece_with_two_states
        img = Image.objects.create(user=piece.user, url="https://example.com/img.jpg")
        PieceStateImage.objects.create(piece_state=state1, image=img, order=0)

        response = auth_client.patch(
            self._url(img.id, state1.id),
            {"piece_state_id": str(state2.id)},
            format="json",
        )

        assert response.status_code == 200
        data = response.json()
        history = data["history"]
        state2_data = next(s for s in history if s["id"] == str(state2.id))
        state1_data = next(s for s in history if s["id"] == str(state1.id))
        assert any(i["image_id"] == str(img.id) for i in state2_data["images"])
        assert not any(i["image_id"] == str(img.id) for i in state1_data["images"])

    def test_move_thumbnail_image(self, auth_client, editable_piece_with_two_states):
        piece, state1, state2 = editable_piece_with_two_states
        img = Image.objects.create(user=piece.user, url="https://example.com/thumb.jpg")
        PieceStateImage.objects.create(piece_state=state1, image=img, order=0)
        piece.thumbnail = img
        piece.save()

        response = auth_client.patch(
            self._url(img.id, state1.id),
            {"piece_state_id": str(state2.id)},
            format="json",
        )

        assert response.status_code == 200
        piece.refresh_from_db()
        assert piece.thumbnail_id == img.id  # thumbnail FK unchanged

    def test_image_in_another_users_piece_returns_404(
        self, other_user, editable_piece_with_two_states
    ):
        # other_user owns the image but the piece belongs to `user` → 404 on the
        # piece ownership check, before any DB mutation occurs.
        _, state1, state2 = editable_piece_with_two_states
        img = Image.objects.create(user=other_user, url="https://example.com/other.jpg")
        PieceStateImage.objects.create(piece_state=state1, image=img, order=0)

        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.patch(
            self._url(img.id, state1.id),
            {"piece_state_id": str(state2.id)},
            format="json",
        )
        assert response.status_code == 404

    def test_unowned_image_returns_404(
        self, auth_client, editable_piece_with_two_states
    ):
        _, state1, _ = editable_piece_with_two_states
        img = Image.objects.create(url="https://example.com/public.jpg")  # user=None
        PieceStateImage.objects.create(piece_state=state1, image=img, order=0)

        response = auth_client.patch(
            self._url(img.id, state1.id),
            {"piece_state_id": str(state1.id)},
            format="json",
        )
        assert response.status_code == 404

    def test_non_editable_piece_returns_403(self, auth_client, user):
        piece = Piece.objects.create(user=user, name="Non-editable")
        state = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        img = Image.objects.create(user=user, url="https://example.com/img.jpg")
        PieceStateImage.objects.create(piece_state=state, image=img, order=0)

        response = auth_client.patch(
            self._url(img.id, state.id),
            {"piece_state_id": str(state.id)},
            format="json",
        )
        assert response.status_code == 403
        assert "editable" in response.json()["detail"]

    def test_no_op_returns_200(self, auth_client, editable_piece_with_two_states):
        piece, state1, _ = editable_piece_with_two_states
        img = Image.objects.create(user=piece.user, url="https://example.com/img.jpg")
        PieceStateImage.objects.create(piece_state=state1, image=img, order=0)

        response = auth_client.patch(
            self._url(img.id, state1.id),
            {},
            format="json",
        )

        assert response.status_code == 200
        assert PieceStateImage.objects.filter(piece_state=state1, image=img).exists()

    def test_invalid_target_state_returns_404(
        self, auth_client, editable_piece_with_two_states, user
    ):
        piece, state1, _ = editable_piece_with_two_states
        img = Image.objects.create(user=user, url="https://example.com/img.jpg")
        PieceStateImage.objects.create(piece_state=state1, image=img, order=0)

        # State from a different piece — scoped out by get_object_or_404(piece.states)
        other_piece = Piece.objects.create(user=user, name="Other", is_editable=True)
        other_state = PieceState.objects.create(
            piece=other_piece, state=ENTRY_STATE, order=0
        )

        response = auth_client.patch(
            self._url(img.id, state1.id),
            {"piece_state_id": str(other_state.id)},
            format="json",
        )
        assert response.status_code == 404

    def test_invalid_target_state_uuid_returns_400(
        self, auth_client, editable_piece_with_two_states, user
    ):
        _, state1, _ = editable_piece_with_two_states
        img = Image.objects.create(user=user, url="https://example.com/img.jpg")
        PieceStateImage.objects.create(piece_state=state1, image=img, order=0)

        response = auth_client.patch(
            self._url(img.id, state1.id),
            {"piece_state_id": "not-a-uuid"},
            format="json",
        )
        assert response.status_code == 400


@pytest.mark.django_db
class TestImageModelHelpers:
    def test_image_str_as_dict_and_getitem(self):
        image = Image.objects.create(
            user=None,
            url="https://example.com/img.jpg",
            cloud_name="demo",
            cloudinary_public_id="piece/img",
        )

        assert str(image) == "https://example.com/img.jpg"
        assert image.as_dict() == {
            "url": "https://example.com/img.jpg",
            "cloudinary_public_id": "piece/img",
            "cloud_name": "demo",
        }
        assert image["cloudinary_public_id"] == "piece/img"

    def test_image_equality_falls_back_for_non_dict(self):
        image = Image(url="https://example.com/img.jpg")

        assert (image == object()) is False
