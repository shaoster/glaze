from unittest.mock import MagicMock, Mock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from api.models import ENTRY_STATE, AsyncTask, Piece, PieceState, PieceStateImage

_FAKE_PUBLIC_URL = "https://r2.example.com/images/1/abc.jpg"
_FAKE_PNG_URL = "https://r2.example.com/images/1/abc.png"
_SMALL_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16
_SMALL_PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _jpeg_file(name="photo.jpg"):
    return SimpleUploadedFile(name, _SMALL_JPEG, content_type="image/jpeg")


def _png_file(name="photo.png"):
    return SimpleUploadedFile(name, _SMALL_PNG, content_type="image/png")


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
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    def test_jpeg_upload_no_conversion_task(
        self, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._current_url(piece.id),
                {"file": _jpeg_file()},
            )

        assert response.status_code == 201
        data = response.json()
        assert "piece_state_image" in data
        assert data["background_tasks"]["conversion_task_id"] is None
        assert not AsyncTask.objects.filter(task_type="convert_image_to_jpeg").exists()

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PNG_URL)
    def test_png_upload_enqueues_conversion_task(
        self, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state

        with patch("api.tasks.get_task_interface") as mock_iface:
            mock_iface.return_value.submit = MagicMock()
            response = auth_client.post(
                self._current_url(piece.id),
                {"file": _png_file()},
            )

        assert response.status_code == 201
        data = response.json()
        assert data["background_tasks"]["conversion_task_id"] is not None
        task = AsyncTask.objects.get(id=data["background_tasks"]["conversion_task_id"])
        assert task.task_type == "convert_image_to_jpeg"

    def test_missing_file_returns_400(self, auth_client, piece_with_state):
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id),
            {"caption": "no file"},
            format="json",
        )
        assert response.status_code == 400

    def test_unauthenticated_returns_401(self, piece_with_state):
        piece, _ = piece_with_state
        response = APIClient().post(
            self._current_url(piece.id),
            {"file": _jpeg_file()},
        )
        assert response.status_code == 401

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    def test_unsupported_content_type_returns_400(
        self, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state
        f = SimpleUploadedFile("doc.pdf", b"%PDF", content_type="application/pdf")
        response = auth_client.post(self._current_url(piece.id), {"file": f})
        assert response.status_code == 400

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    def test_oversized_image_returns_400(self, mock_r2, auth_client, piece_with_state):
        from api.piece.image_views import _MAX_UPLOAD_BYTES

        piece, _ = piece_with_state
        big_file = SimpleUploadedFile(
            "huge.jpg", b"\x00" * (_MAX_UPLOAD_BYTES + 1), content_type="image/jpeg"
        )
        response = auth_client.post(self._current_url(piece.id), {"file": big_file})
        assert response.status_code == 400

    def test_other_users_piece_returns_404(self, other_user, piece_with_state):
        piece, _ = piece_with_state
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.post(
            self._current_url(piece.id),
            {"file": _jpeg_file()},
        )
        assert response.status_code == 404

    def test_past_state_non_editable_piece_returns_403(
        self, auth_client, piece_with_state
    ):
        piece, state = piece_with_state
        response = auth_client.post(
            self._past_url(piece.id, state.id),
            {"file": _jpeg_file()},
        )
        assert response.status_code == 403

    def test_current_state_no_states_returns_404(self, user):
        piece = Piece.objects.create(user=user, name="Empty")
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post(
            self._current_url(piece.id),
            {"file": _jpeg_file()},
        )
        assert response.status_code == 404

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    def test_past_state_editable_piece_succeeds(
        self, mock_upload, mock_r2, auth_client, editable_piece_with_state
    ):
        piece, state = editable_piece_with_state

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._past_url(piece.id, state.id),
                {"file": _jpeg_file()},
            )

        assert response.status_code == 201
        assert PieceStateImage.objects.filter(piece_state=state).count() == 1

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    def test_caption_stored(self, mock_upload, mock_r2, auth_client, piece_with_state):
        piece, _ = piece_with_state

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._current_url(piece.id),
                {"file": _jpeg_file(), "caption": "my caption"},
            )

        assert response.status_code == 201
        assert PieceStateImage.objects.get().caption == "my caption"


def _mock_httpx_response(
    content=_SMALL_JPEG, content_type="image/jpeg", status_code=200
):
    resp = Mock()
    resp.content = content
    resp.headers = {"content-type": content_type}
    resp.status_code = status_code
    resp.raise_for_status = Mock()
    if status_code >= 400:
        resp.raise_for_status.side_effect = Exception("HTTP error")
    return resp


@pytest.mark.django_db
class TestUploadImageFromRefsEndpoints:
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
        return f"/api/pieces/{piece_id}/state/upload-image-refs/"

    def _past_url(self, piece_id, state_id):
        return f"/api/pieces/{piece_id}/states/{state_id}/upload-image-refs/"

    def _refs_payload(
        self, download_link="https://cdn.openai.com/files/img.jpg", caption=""
    ):
        return {
            "openaiFileIdRefs": [
                {
                    "name": "photo.jpg",
                    "id": "file-abc123",
                    "mime_type": "image/jpeg",
                    "download_link": download_link,
                }
            ],
            "caption": caption,
        }

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    @patch("api.piece.image_views.httpx.get")
    def test_jpeg_ref_succeeds(
        self, mock_get, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        mock_get.return_value = _mock_httpx_response()
        piece, _ = piece_with_state

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._current_url(piece.id), self._refs_payload(), format="json"
            )

        assert response.status_code == 201
        data = response.json()
        assert "piece_state_image" in data
        assert data["background_tasks"]["conversion_task_id"] is None

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PNG_URL)
    @patch("api.piece.image_views.httpx.get")
    def test_png_ref_enqueues_conversion(
        self, mock_get, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        mock_get.return_value = _mock_httpx_response(_SMALL_PNG, "image/png")
        piece, _ = piece_with_state

        with patch("api.tasks.get_task_interface") as mock_iface:
            mock_iface.return_value.submit = MagicMock()
            response = auth_client.post(
                self._current_url(piece.id), self._refs_payload(), format="json"
            )

        assert response.status_code == 201
        assert response.json()["background_tasks"]["conversion_task_id"] is not None

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.httpx.get")
    def test_unsupported_content_type_returns_400(
        self, mock_get, mock_r2, auth_client, piece_with_state
    ):
        mock_get.return_value = _mock_httpx_response(b"%PDF", "application/pdf")
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id), self._refs_payload(), format="json"
        )
        assert response.status_code == 400

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.httpx.get")
    def test_oversized_image_returns_400(
        self, mock_get, mock_r2, auth_client, piece_with_state
    ):
        from api.piece.image_views import _MAX_UPLOAD_BYTES

        mock_get.return_value = _mock_httpx_response(b"\x00" * (_MAX_UPLOAD_BYTES + 1))
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id), self._refs_payload(), format="json"
        )
        assert response.status_code == 400

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.httpx.get")
    def test_failed_fetch_returns_400(
        self, mock_get, mock_r2, auth_client, piece_with_state
    ):
        mock_get.side_effect = Exception("network error")
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id), self._refs_payload(), format="json"
        )
        assert response.status_code == 400

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    def test_http_download_link_returns_400(
        self, mock_r2, auth_client, piece_with_state
    ):
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id),
            self._refs_payload(download_link="http://evil.com/img.jpg"),
            format="json",
        )
        assert response.status_code == 400

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    def test_missing_refs_returns_400(self, mock_r2, auth_client, piece_with_state):
        piece, _ = piece_with_state
        response = auth_client.post(
            self._current_url(piece.id), {"caption": "no refs"}, format="json"
        )
        assert response.status_code == 400

    def test_unauthenticated_returns_401(self, piece_with_state):
        piece, _ = piece_with_state
        response = APIClient().post(
            self._current_url(piece.id), self._refs_payload(), format="json"
        )
        assert response.status_code == 401

    def test_other_users_piece_returns_404(self, other_user, piece_with_state):
        piece, _ = piece_with_state
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)
        response = other_client.post(
            self._current_url(piece.id), self._refs_payload(), format="json"
        )
        assert response.status_code == 404

    def test_past_state_non_editable_returns_403(self, auth_client, piece_with_state):
        piece, state = piece_with_state
        response = auth_client.post(
            self._past_url(piece.id, state.id), self._refs_payload(), format="json"
        )
        assert response.status_code == 403

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    @patch("api.piece.image_views.httpx.get")
    def test_past_state_editable_succeeds(
        self, mock_get, mock_upload, mock_r2, auth_client, editable_piece_with_state
    ):
        mock_get.return_value = _mock_httpx_response()
        piece, state = editable_piece_with_state

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._past_url(piece.id, state.id), self._refs_payload(), format="json"
            )

        assert response.status_code == 201
        assert PieceStateImage.objects.filter(piece_state=state).count() == 1

    @patch("api.piece.image_views.r2.is_r2_configured", return_value=True)
    @patch("api.piece.image_views.r2.upload_bytes", return_value=_FAKE_PUBLIC_URL)
    @patch("api.piece.image_views.httpx.get")
    def test_caption_stored(
        self, mock_get, mock_upload, mock_r2, auth_client, piece_with_state
    ):
        mock_get.return_value = _mock_httpx_response()
        piece, _ = piece_with_state

        with patch("api.tasks.get_task_interface"):
            response = auth_client.post(
                self._current_url(piece.id),
                self._refs_payload(caption="pottery photo"),
                format="json",
            )

        assert response.status_code == 201
        assert PieceStateImage.objects.get().caption == "pottery photo"
