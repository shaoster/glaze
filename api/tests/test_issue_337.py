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
class TestIssue337ThumbnailProtection:
    @pytest.fixture
    def auth_client(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_block_deletion_of_thumbnail_from_current_state(self, auth_client, user):
        piece = Piece.objects.create(user=user, name="Test Piece")
        state = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        img = Image.objects.create(user=user, url="https://example.com/thumb.jpg")
        PieceStateImage.objects.create(piece_state=state, image=img, order=0)

        piece.thumbnail = img
        piece.save()

        # Try to update current state with NO images (effectively deleting the thumbnail)
        response = auth_client.patch(
            f"/api/pieces/{piece.id}/state/", {"images": []}, format="json"
        )

        assert response.status_code == 400
        assert "images" in response.json()
        assert (
            "Cannot delete the image currently used as the piece thumbnail."
            in response.json()["images"]
        )

    def test_block_deletion_of_state_containing_thumbnail(self, auth_client, user):
        piece = Piece.objects.create(user=user, name="Test Piece", is_editable=True)
        # Entry state (designed)
        PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)

        # Second state (not designed)
        next_state = SUCCESSORS[ENTRY_STATE][0]
        state2 = PieceState.objects.create(piece=piece, state=next_state, order=1)
        img = Image.objects.create(user=user, url="https://example.com/thumb.jpg")
        PieceStateImage.objects.create(piece_state=state2, image=img, order=0)

        # Third state (current)
        further_state = SUCCESSORS[next_state][0]
        PieceState.objects.create(piece=piece, state=further_state, order=2)

        piece.thumbnail = img
        piece.save()

        # Try to delete state2 (which contains the thumbnail and is NOT 'designed')
        response = auth_client.delete(f"/api/pieces/{piece.id}/states/{state2.pk}/")

        assert response.status_code == 403
        assert (
            response.json()["detail"]
            == "Cannot delete a state that contains the current piece thumbnail."
        )

        # Verify state still exists
        assert PieceState.objects.filter(pk=state2.pk).exists()

    def test_allow_deletion_of_non_thumbnail_image(self, auth_client, user):
        piece = Piece.objects.create(user=user, name="Test Piece")
        state = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        img_thumb = Image.objects.create(user=user, url="https://example.com/thumb.jpg")
        img_other = Image.objects.create(user=user, url="https://example.com/other.jpg")
        PieceStateImage.objects.create(piece_state=state, image=img_thumb, order=0)
        PieceStateImage.objects.create(piece_state=state, image=img_other, order=1)

        piece.thumbnail = img_thumb
        piece.save()

        # Try to remove img_other, but KEEP img_thumb
        response = auth_client.patch(
            f"/api/pieces/{piece.id}/state/",
            {"images": [{"url": "https://example.com/thumb.jpg"}]},
            format="json",
        )

        assert response.status_code == 200
        piece.refresh_from_db()
        assert piece.current_state.images[0]["url"] == "https://example.com/thumb.jpg"
        assert len(piece.current_state.images) == 1

    def test_allow_deletion_of_state_not_containing_thumbnail(self, auth_client, user):
        piece = Piece.objects.create(user=user, name="Test Piece", is_editable=True)
        # Entry state (designed)
        PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)

        # Second state (not designed)
        next_state = SUCCESSORS[ENTRY_STATE][0]
        state2 = PieceState.objects.create(piece=piece, state=next_state, order=1)

        # Third state (current) - contains thumbnail
        further_state = SUCCESSORS[next_state][0]
        state3 = PieceState.objects.create(piece=piece, state=further_state, order=2)
        img = Image.objects.create(user=user, url="https://example.com/thumb.jpg")
        PieceStateImage.objects.create(piece_state=state3, image=img, order=0)

        piece.thumbnail = img
        piece.save()

        # Try to delete state2 (which DOES NOT contain the thumbnail and is NOT 'designed')
        response = auth_client.delete(f"/api/pieces/{piece.id}/states/{state2.pk}/")

        assert response.status_code == 200
        assert not PieceState.objects.filter(pk=state2.pk).exists()
