import re
from unittest import mock

import pytest

R2_ENV = {
    "R2_ACCOUNT_ID": "test-account",
    "R2_ACCESS_KEY_ID": "test-key",
    "R2_SECRET_ACCESS_KEY": "test-secret",
    "R2_BUCKET_NAME": "test-bucket",
    "R2_PUBLIC_URL": "https://media.example.com",
}

ENDPOINT = "/api/uploads/r2/presigned-url/"


@pytest.fixture
def r2_env(monkeypatch):
    for key, value in R2_ENV.items():
        monkeypatch.setenv(key, value)


@pytest.fixture
def presign_mock():
    with mock.patch(
        "api.r2.generate_presigned_post",
        return_value={
            "url": "https://test-account.r2.cloudflarestorage.com/test-bucket",
            "fields": {"key": "images/1/x.jpg", "Content-Type": "image/jpeg"},
        },
    ) as presign:
        yield presign


@pytest.mark.django_db
class TestR2PresignedUploadUrl:
    def test_returns_401_when_not_authenticated(self, client, r2_env):
        client.force_authenticate(user=None)
        response = client.post(ENDPOINT, {"content_type": "image/jpeg"}, format="json")
        assert response.status_code == 401

    def test_returns_503_when_not_configured(self, client, monkeypatch):
        for key in R2_ENV:
            monkeypatch.delenv(key, raising=False)
        response = client.post(ENDPOINT, {"content_type": "image/jpeg"}, format="json")
        assert response.status_code == 503

    def test_issues_presigned_url_with_server_generated_key(
        self, client, user, r2_env, presign_mock
    ):
        response = client.post(ENDPOINT, {"content_type": "image/jpeg"}, format="json")

        assert response.status_code == 200
        body = response.json()
        # Key shape: images/{user.id}/{uuid4}.{ext} — server-generated, the
        # extension comes from the validated content type.
        assert re.fullmatch(
            rf"images/{user.id}/[0-9a-f]{{8}}-[0-9a-f]{{4}}-4[0-9a-f]{{3}}"
            rf"-[89ab][0-9a-f]{{3}}-[0-9a-f]{{12}}\.jpg",
            body["key"],
        )
        assert body["upload_url"] == (
            "https://test-account.r2.cloudflarestorage.com/test-bucket"
        )
        assert isinstance(body["fields"], dict)
        assert body["public_url"] == f"https://media.example.com/{body['key']}"
        assert body["expires_in"] == 600
        assert body["max_bytes"] > 0
        presign_mock.assert_called_once_with(body["key"], "image/jpeg", expires=600)

    def test_extension_follows_content_type(self, client, r2_env, presign_mock):
        response = client.post(ENDPOINT, {"content_type": "image/png"}, format="json")
        assert response.status_code == 200
        assert response.json()["key"].endswith(".png")

    def test_rejects_disallowed_content_type(self, client, r2_env, presign_mock):
        response = client.post(
            ENDPOINT, {"content_type": "application/x-sh"}, format="json"
        )
        assert response.status_code == 400
        presign_mock.assert_not_called()

    def test_rejects_missing_content_type(self, client, r2_env, presign_mock):
        response = client.post(ENDPOINT, {}, format="json")
        assert response.status_code == 400
        presign_mock.assert_not_called()

    def test_rejects_unknown_resource_type(self, client, r2_env, presign_mock):
        response = client.post(
            ENDPOINT,
            {"content_type": "image/jpeg", "resource_type": "raw"},
            format="json",
        )
        assert response.status_code == 400
        presign_mock.assert_not_called()

    def test_video_requires_staff(self, client, r2_env, presign_mock):
        response = client.post(
            ENDPOINT,
            {"content_type": "video/mp4", "resource_type": "video"},
            format="json",
        )
        assert response.status_code == 403
        presign_mock.assert_not_called()

    def test_audio_requires_staff(self, client, r2_env, presign_mock):
        response = client.post(
            ENDPOINT,
            {"content_type": "audio/flac", "resource_type": "audio"},
            format="json",
        )
        assert response.status_code == 403
        presign_mock.assert_not_called()

    def test_staff_can_request_video_upload(self, client, user, r2_env, presign_mock):
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        response = client.post(
            ENDPOINT,
            {"content_type": "video/mp4", "resource_type": "video"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["key"].startswith(f"videos/{user.id}/")
        assert response.json()["key"].endswith(".mp4")

    def test_staff_can_request_audio_upload(self, client, user, r2_env, presign_mock):
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        response = client.post(
            ENDPOINT,
            {"content_type": "audio/flac", "resource_type": "audio"},
            format="json",
        )
        assert response.status_code == 200
        assert response.json()["key"].startswith(f"audio/{user.id}/")
        assert response.json()["key"].endswith(".flac")

    def test_image_content_type_not_valid_for_video(
        self, client, user, r2_env, presign_mock
    ):
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        response = client.post(
            ENDPOINT,
            {"content_type": "image/jpeg", "resource_type": "video"},
            format="json",
        )
        assert response.status_code == 400
        presign_mock.assert_not_called()


class TestR2Helpers:
    def test_is_r2_configured_requires_all_vars(self, monkeypatch):
        from api import r2

        for key, value in R2_ENV.items():
            monkeypatch.setenv(key, value)
        assert r2.is_r2_configured() is True

        monkeypatch.setenv("R2_BUCKET_NAME", "")
        assert r2.is_r2_configured() is False

    def test_public_url_round_trip(self, monkeypatch):
        from api import r2

        monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com/")
        key = "images/1/abc.jpg"
        url = r2.public_url_for_key(key)
        assert url == "https://media.example.com/images/1/abc.jpg"
        assert r2.key_for_public_url(url) == key

    def test_key_for_public_url_rejects_foreign_urls(self, monkeypatch):
        from api import r2

        monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com")
        assert (
            r2.key_for_public_url("https://foreign-cdn.example.org/demo/x.jpg") is None
        )
        assert r2.key_for_public_url("") is None

    def test_key_for_public_url_strips_query(self, monkeypatch):
        from api import r2

        monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com")
        assert (
            r2.key_for_public_url("https://media.example.com/images/1/a.jpg?v=2")
            == "images/1/a.jpg"
        )
