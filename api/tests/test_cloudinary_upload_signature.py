import hashlib

import pytest


@pytest.mark.django_db
class TestCloudinaryWidgetConfig:
    def test_returns_503_when_not_configured(self, client, monkeypatch):
        monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)

        response = client.get("/api/uploads/cloudinary/widget-config/")

        assert response.status_code == 503
        assert (
            response.json()["detail"] == "Cloudinary is not configured on the server."
        )

    def test_returns_403_when_not_authenticated(self, client, monkeypatch):
        monkeypatch.delenv("CLOUDINARY_CLOUD_NAME", raising=False)
        monkeypatch.delenv("CLOUDINARY_API_KEY", raising=False)
        client.force_authenticate(user=None)
        response = client.get("/api/uploads/cloudinary/widget-config/")

        assert response.status_code == 403
        assert (
            response.json()["detail"] == "Authentication credentials were not provided."
        )

    def test_returns_config_without_folder(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "public-api-key")
        monkeypatch.delenv("CLOUDINARY_UPLOAD_FOLDER", raising=False)

        response = client.get("/api/uploads/cloudinary/widget-config/")

        assert response.status_code == 200
        assert response.json() == {
            "cloud_name": "demo-cloud",
            "api_key": "public-api-key",
        }

    def test_returns_config_with_folder(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "public-api-key")
        monkeypatch.setenv("CLOUDINARY_UPLOAD_FOLDER", "glaze")
        monkeypatch.delenv("CLOUDINARY_UPLOAD_PRESET", raising=False)

        response = client.get("/api/uploads/cloudinary/widget-config/")

        assert response.status_code == 200
        assert response.json() == {
            "cloud_name": "demo-cloud",
            "api_key": "public-api-key",
            "folder": "glaze",
        }

    def test_returns_config_with_preset(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "public-api-key")
        monkeypatch.delenv("CLOUDINARY_UPLOAD_FOLDER", raising=False)
        monkeypatch.setenv("CLOUDINARY_UPLOAD_PRESET", "glaze_signed")

        response = client.get("/api/uploads/cloudinary/widget-config/")

        assert response.status_code == 200
        assert response.json() == {
            "cloud_name": "demo-cloud",
            "api_key": "public-api-key",
            "upload_preset": "glaze_signed",
        }


@pytest.mark.django_db
class TestCloudinaryWidgetSign:
    def test_returns_503_when_not_configured(self, client, monkeypatch):
        monkeypatch.delenv("CLOUDINARY_API_SECRET", raising=False)

        response = client.post(
            "/api/uploads/cloudinary/widget-signature/",
            {"params_to_sign": {}},
            format="json",
        )

        assert response.status_code == 503
        assert (
            response.json()["detail"] == "Cloudinary is not configured on the server."
        )

    def test_returns_403_when_not_authenticated(self, client, monkeypatch):
        monkeypatch.delenv("CLOUDINARY_API_SECRET", raising=False)
        client.force_authenticate(user=None)
        response = client.post(
            "/api/uploads/cloudinary/widget-signature/",
            {"params_to_sign": {}},
            format="json",
        )

        assert response.status_code == 403
        assert (
            response.json()["detail"] == "Authentication credentials were not provided."
        )

    def test_returns_signature(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")

        params = {"folder": "glaze", "timestamp": "1700000000"}
        response = client.post(
            "/api/uploads/cloudinary/widget-signature/",
            {"params_to_sign": params},
            format="json",
        )

        assert response.status_code == 200
        # Server enforces allowed_formats, resource_type, and exif before signing.
        enforced = {
            **params,
            "allowed_formats": "jpg,jpeg,png,webp,heic,avif",
            "exif": "false",
            "resource_type": "image",
        }
        signing_string = "&".join(f"{k}={enforced[k]}" for k in sorted(enforced.keys()))
        expected = hashlib.sha1(
            f"{signing_string}super-secret".encode("utf-8")
        ).hexdigest()
        assert response.json() == {"signature": expected}

    def test_enforces_resource_type_image(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")

        # Client sends resource_type=video; server must override it to image.
        params = {"resource_type": "video", "timestamp": "1700000000"}
        response = client.post(
            "/api/uploads/cloudinary/widget-signature/",
            {"params_to_sign": params},
            format="json",
        )

        assert response.status_code == 200
        enforced = {
            **params,
            "allowed_formats": "jpg,jpeg,png,webp,heic,avif",
            "exif": "false",
            "resource_type": "image",
        }
        signing_string = "&".join(f"{k}={enforced[k]}" for k in sorted(enforced.keys()))
        expected = hashlib.sha1(
            f"{signing_string}super-secret".encode("utf-8")
        ).hexdigest()
        assert response.json() == {"signature": expected}

        # Confirm the signature differs from what the tampered params would have produced.
        tampered_string = "&".join(f"{k}={params[k]}" for k in sorted(params.keys()))
        tampered_sig = hashlib.sha1(
            f"{tampered_string}super-secret".encode("utf-8")
        ).hexdigest()
        assert response.json()["signature"] != tampered_sig

    def test_enforces_allowed_formats(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")

        # Client omits allowed_formats; server must inject the allowlist.
        params = {"timestamp": "1700000000"}
        response = client.post(
            "/api/uploads/cloudinary/widget-signature/",
            {"params_to_sign": params},
            format="json",
        )

        assert response.status_code == 200
        enforced = {
            **params,
            "allowed_formats": "jpg,jpeg,png,webp,heic,avif",
            "exif": "false",
            "resource_type": "image",
        }
        signing_string = "&".join(f"{k}={enforced[k]}" for k in sorted(enforced.keys()))
        expected = hashlib.sha1(
            f"{signing_string}super-secret".encode("utf-8")
        ).hexdigest()
        assert response.json() == {"signature": expected}

    def test_enforces_exif_stripped(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")

        # Client sends exif=true; server must override it to false.
        params = {"exif": "true", "timestamp": "1700000000"}
        response = client.post(
            "/api/uploads/cloudinary/widget-signature/",
            {"params_to_sign": params},
            format="json",
        )

        assert response.status_code == 200
        enforced = {
            **params,
            "allowed_formats": "jpg,jpeg,png,webp,heic,avif",
            "exif": "false",
            "resource_type": "image",
        }
        signing_string = "&".join(f"{k}={enforced[k]}" for k in sorted(enforced.keys()))
        expected = hashlib.sha1(
            f"{signing_string}super-secret".encode("utf-8")
        ).hexdigest()
        assert response.json() == {"signature": expected}

        # Confirm the signature differs from what the tampered params would have produced.
        tampered_string = "&".join(f"{k}={params[k]}" for k in sorted(params.keys()))
        tampered_sig = hashlib.sha1(
            f"{tampered_string}super-secret".encode("utf-8")
        ).hexdigest()
        assert response.json()["signature"] != tampered_sig

    def test_returns_400_when_params_not_dict(self, client, monkeypatch):
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")

        response = client.post(
            "/api/uploads/cloudinary/widget-signature/",
            {"params_to_sign": "not-a-dict"},
            format="json",
        )

        assert response.status_code == 400
