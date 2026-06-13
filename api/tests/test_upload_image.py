import base64
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from api.models import ENTRY_STATE, AsyncTask, Piece, PieceState, PieceStateImage

_FAKE_PUBLIC_URL = "https://r2.example.com/images/1/abc.jpg"
_FAKE_PNG_URL = "https://r2.example.com/images/1/abc.png"
_SMALL_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16  # minimal JPEG-like bytes
_SMALL_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _mock_r2_upload(key, data, content_type):
    ext = key.rsplit(".", 1)[-1]
    return f"https://r2.example.com/{key}" if ext != "jpg" else _FAKE_PUBLIC_URL


@pytest.mark.django_db
class TestUploadImageEndpoints:
    @pytest.fixture
    def auth_client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    @pytest.fixture
    def piece_with_state(self, user):
        piece = Piece.objects.create(user=user, name="Bowl")
        state = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        return piece, state

    @pytest.fixture
    def editable_piece_with_state(self, user):
        piece = Piece.objects.create(user=user, name="Bowl", is_editable=True)
        state = PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=0)
        return piece, state

    def _current_url(self, piece_id):
        return f"/api/pieces/{piece_id}/state/upload-image/"

    def _past_url(self, piece_id, state_id):
        return f"/api/pieces/{piece_id}/states/{state_id}/upload-image/"

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", side_effect=_mock_r2_upload)
    @patch("api.piece.image_views._requests.get")
    @patch("api.piece.image_views.AsyncTask.objects.create")
    @patch("api.tasks.get_task_interface")
    def test_url_jpeg_upload_no_conversion_task(
        self,
        mock_task_iface,
        mock_task_create,
        mock_get,
        mock_upload,
        mock_r2,
        auth_client,
        piece_with_state,
    ):
        piece, state = piece_with_state
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "image/jpeg"}
        mock_resp.iter_content.return_value = [_SMALL_JPEG]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        response = auth_client.post(
            self._current_url(piece.id),
            {"url": "https://example.com/photo.jpg"},
            format="json",
        )

        assert response.status_code == 201
        data = response.json()
        assert "piece_state_image" in data
        assert data["background_tasks"]["conversion_task_id"] is None
        mock_task_create.assert_not_called()

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PNG_URL)
    @patch("api.piece.image_views._requests.get")
    def test_url_png_upload_enqueues_conversion_task(
        self, mock_get, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        piece, state = piece_with_state
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "image/png"}
        mock_resp.iter_content.return_value = [_SMALL_PNG]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        with patch("api.tasks.get_task_interface") as mock_iface:
            mock_iface.return_value.submit = MagicMock()
            response = auth_client.post(
                self._current_url(piece.id),
                {"url": "https://example.com/photo.png"},
                format="json",
            )

        assert response.status_code == 201
        data = response.json()
        assert data["background_tasks"]["conversion_task_id"] is not None
        task = AsyncTask.objects.get(id=data["background_tasks"]["conversion_task_id"])
        assert task.task_type == "convert_image_to_jpeg"

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    def test_base64_with_data_uri_prefix(
        self, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state
        b64 = base64.b64encode(_SMALL_JPEG).decode()
        payload = f"data:image/jpeg;base64,{b64}"

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._current_url(piece.id),
                {"base64": payload},
                format="json",
            )

        assert response.status_code == 201
        assert "piece_state_image" in response.json()

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    def test_base64_raw_string(
        self, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state
        b64 = base64.b64encode(_SMALL_JPEG).decode()

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._current_url(piece.id),
                {"base64": b64},
                format="json",
            )

        assert response.status_code == 201

    def test_both_url_and_base64_returns_400(self, auth_client, piece_with_state):
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id),
            {"url": "https://example.com/img.jpg", "base64": "abc"},
            format="json",
        )
        assert response.status_code == 400

    def test_neither_url_nor_base64_returns_400(self, auth_client, piece_with_state):
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id),
            {"caption": "no image"},
            format="json",
        )
        assert response.status_code == 400

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    def test_non_https_url_returns_400(self, mock_r2, auth_client, piece_with_state):
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id),
            {"url": "http://example.com/img.jpg"},
            format="json",
        )
        assert response.status_code == 400

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views._requests.get", side_effect=Exception("timeout"))
    def test_url_fetch_failure_returns_400(
        self, mock_get, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id),
            {"url": "https://example.com/broken.jpg"},
            format="json",
        )
        assert response.status_code == 400

    def test_other_users_piece_returns_404(self, other_user, piece_with_state):
        piece, _ = piece_with_state
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.post(
            self._current_url(piece.id),
            {"url": "https://example.com/img.jpg"},
            format="json",
        )
        assert response.status_code == 404

    def test_past_state_non_editable_piece_returns_403(
        self, auth_client, piece_with_state
    ):
        piece, state = piece_with_state
        # piece.is_editable is False by default
        response = auth_client.post(
            self._past_url(piece.id, state.id),
            {"url": "https://example.com/img.jpg"},
            format="json",
        )
        assert response.status_code == 403

    def test_current_state_no_states_returns_404(self, auth_client, user):
        piece = Piece.objects.create(user=user, name="Empty")
        auth_client_local = APIClient()
        auth_client_local.force_authenticate(user=user)
        response = auth_client_local.post(
            self._current_url(piece.id),
            {"url": "https://example.com/img.jpg"},
            format="json",
        )
        assert response.status_code == 404

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    @patch("api.piece.image_views._requests.get")
    def test_past_state_editable_piece_succeeds(
        self, mock_get, mock_upload, mock_r2, auth_client, editable_piece_with_state
    ):
        piece, state = editable_piece_with_state
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "image/jpeg"}
        mock_resp.iter_content.return_value = [_SMALL_JPEG]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._past_url(piece.id, state.id),
                {"url": "https://example.com/img.jpg"},
                format="json",
            )

        assert response.status_code == 201
        assert PieceStateImage.objects.filter(piece_state=state).count() == 1

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    @patch("api.piece.image_views._requests.get")
    def test_caption_stored(
        self, mock_get, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state
        mock_resp = MagicMock()
        mock_resp.headers = {"Content-Type": "image/jpeg"}
        mock_resp.iter_content.return_value = [_SMALL_JPEG]
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._current_url(piece.id),
                {"url": "https://example.com/img.jpg", "caption": "my caption"},
                format="json",
            )

        assert response.status_code == 201
        link = PieceStateImage.objects.get()
        assert link.caption == "my caption"
