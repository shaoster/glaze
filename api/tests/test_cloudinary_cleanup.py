import pytest
import cloudinary.exceptions
from django.contrib.auth.models import User

from api.models import Image

URL = "/api/admin/cloudinary-cleanup/"


@pytest.mark.django_db
class TestCloudinaryCleanup:
    def test_requires_admin_user(self, client):
        response = client.get(URL)

        assert response.status_code == 403

    def test_scan_returns_unused_assets_only(self, client, user, monkeypatch):
        admin = User.objects.create(
            username="admin@example.com",
            email="admin@example.com",
            is_staff=True,
        )
        client.force_authenticate(user=admin)
        Image.objects.create(
            user=user,
            url="https://res.cloudinary.com/demo/image/upload/piece/used.jpg",
            cloud_name="demo",
            cloudinary_public_id="piece/used",
        )
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "api-secret")
        monkeypatch.setenv("CLOUDINARY_UPLOAD_FOLDER", "glaze_dev")

        def fake_resources(**kwargs):
            assert kwargs == {
                "resource_type": "image",
                "type": "upload",
                "max_results": 500,
            }
            return {
                "resources": [
                    {
                        "public_id": "piece/used",
                        "secure_url": "https://example.com/used.jpg",
                        "bytes": 1234,
                        "created_at": "2026-05-06T12:00:00Z",
                    },
                    {
                        "public_id": "piece/orphan",
                        "secure_url": "https://example.com/orphan.jpg",
                        "bytes": 5678,
                        "created_at": "2026-05-06T12:05:00Z",
                    },
                ]
            }

        monkeypatch.setattr(
            "api.cloudinary_cleanup.cloudinary.api.resources", fake_resources
        )

        response = client.get(URL)

        assert response.status_code == 200
        assert response.json() == {
            "assets": [
                {
                    "public_id": "piece/orphan",
                    "cloud_name": "demo",
                    "path_prefix": "glaze_dev",
                    "url": "https://example.com/orphan.jpg",
                    "thumbnail_url": (
                        "https://res.cloudinary.com/demo/image/upload/"
                        "c_fill,h_96,w_96/v1/piece/orphan.jpg"
                    ),
                    "bytes": 5678,
                    "created_at": "2026-05-06T12:05:00Z",
                },
            ],
            "summary": {"total": 2, "referenced": 1, "unused": 1},
        }

    def test_delete_rejects_referenced_assets(self, client, user, monkeypatch):
        admin = User.objects.create(
            username="admin@example.com",
            email="admin@example.com",
            is_staff=True,
        )
        client.force_authenticate(user=admin)
        Image.objects.create(
            user=user,
            url="https://res.cloudinary.com/demo/image/upload/piece/used.jpg",
            cloud_name="demo",
            cloudinary_public_id="piece/used",
        )
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "api-secret")

        response = client.delete(URL, {"public_ids": ["piece/used"]}, format="json")

        assert response.status_code == 400
        assert response.json() == {
            "detail": "Cannot delete referenced Cloudinary assets: piece/used"
        }

    def test_delete_unused_assets(self, client, monkeypatch):
        admin = User.objects.create(
            username="admin@example.com",
            email="admin@example.com",
            is_staff=True,
        )
        client.force_authenticate(user=admin)
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "api-secret")

        def fake_delete_resources(public_ids, **kwargs):
            assert public_ids == ["piece/orphan"]
            assert kwargs == {"resource_type": "image"}
            return {"deleted": {"piece/orphan": "deleted"}}

        monkeypatch.setattr(
            "api.cloudinary_cleanup.cloudinary.api.delete_resources",
            fake_delete_resources,
        )

        response = client.delete(URL, {"public_ids": ["piece/orphan"]}, format="json")

        assert response.status_code == 200
        assert response.json() == {"deleted": {"piece/orphan": "deleted"}}

    def test_delete_cloudinary_error_returns_503(self, client, monkeypatch):
        admin = User.objects.create(
            username="admin@example.com",
            email="admin@example.com",
            is_staff=True,
        )
        client.force_authenticate(user=admin)
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "api-secret")

        def fake_delete_resources(public_ids, **kwargs):
            raise cloudinary.exceptions.Error("boom")

        monkeypatch.setattr(
            "api.cloudinary_cleanup.cloudinary.api.delete_resources",
            fake_delete_resources,
        )

        response = client.delete(URL, {"public_ids": ["piece/orphan"]}, format="json")

        assert response.status_code == 503
        assert response.json() == {"detail": "Unable to delete Cloudinary assets."}
