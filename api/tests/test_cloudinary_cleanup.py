import asyncio
from collections.abc import AsyncIterable
from io import BytesIO
from zipfile import ZipFile

import cloudinary.exceptions
import pytest
from django.contrib.auth.models import User

from api.cloudinary_cleanup import (
    REFERENCED_BREAKDOWN_WORKFLOW_IMAGE_PATHS,
    CloudinaryCleanupAsset,
    stream_cloudinary_cleanup_archive,
    summarize_referenced_public_ids,
)
from api.models import GlazeCombination, GlazeType, Image
from api.workflow import _workflow

URL = "/api/admin/cloudinary-cleanup/"
ARCHIVE_URL = "/api/admin/cloudinary-cleanup/archive/"


async def _collect_async_bytes(chunks: AsyncIterable[bytes]) -> bytes:
    return b"".join([chunk async for chunk in chunks])


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
            "summary": {
                "total": 2,
                "referenced": 1,
                "unused": 1,
                "referenced_breakdown": [
                    {"key": "piece_list", "label": "PieceList", "count": 0},
                    {
                        "key": "piece_state_images",
                        "label": "Piece State Images",
                        "count": 0,
                    },
                    {"key": "glaze_tiles", "label": "Glaze Tiles", "count": 0},
                    {
                        "key": "glaze_combinations",
                        "label": "Glaze Combinations",
                        "count": 0,
                    },
                    {
                        "key": "unknown_referenced_assets",
                        "label": "Unknown Referenced Assets",
                        "count": 1,
                    },
                ],
                "reference_warnings": [
                    "Found 1 referenced assets not explained by known source paths."
                ],
            },
        }

    def test_reference_breakdown_warns_when_glaze_tiles_lack_images(self):
        tile_image = Image.objects.create(
            user=None,
            url="https://res.cloudinary.com/demo/image/upload/glaze/used.jpg",
            cloud_name="demo",
            cloudinary_public_id="glaze/used",
        )
        GlazeType.objects.create(
            user=None,
            name="Celadon",
            test_tile_image=tile_image,
        )
        GlazeType.objects.create(user=None, name="Tenmoku")

        breakdown = summarize_referenced_public_ids()

        assert [
            {"key": source.key, "label": source.label, "count": source.count}
            for source in breakdown.sources
        ] == [
            {"key": "piece_list", "label": "PieceList", "count": 0},
            {"key": "piece_state_images", "label": "Piece State Images", "count": 0},
            {"key": "glaze_tiles", "label": "Glaze Tiles", "count": 1},
            {"key": "glaze_combinations", "label": "Glaze Combinations", "count": 0},
            {
                "key": "unknown_referenced_assets",
                "label": "Unknown Referenced Assets",
                "count": 0,
            },
        ]
        assert breakdown.warnings == [
            "Found fewer references than glaze tiles (1 of 2)."
        ]

    def test_reference_breakdown_counts_duplicate_source_occurrences(self):
        shared_image = Image.objects.create(
            user=None,
            url="https://res.cloudinary.com/demo/image/upload/glaze/shared.jpg",
            cloud_name="demo",
            cloudinary_public_id="glaze/shared",
        )
        GlazeType.objects.create(
            user=None,
            name="Celadon",
            test_tile_image=shared_image,
        )
        GlazeCombination.objects.create(
            user=None,
            name="Celadon",
            test_tile_image=shared_image,
        )

        breakdown = summarize_referenced_public_ids({"glaze/shared"})

        assert [
            {"key": source.key, "label": source.label, "count": source.count}
            for source in breakdown.sources
        ] == [
            {"key": "piece_list", "label": "PieceList", "count": 0},
            {"key": "piece_state_images", "label": "Piece State Images", "count": 0},
            {"key": "glaze_tiles", "label": "Glaze Tiles", "count": 1},
            {"key": "glaze_combinations", "label": "Glaze Combinations", "count": 1},
            {
                "key": "unknown_referenced_assets",
                "label": "Unknown Referenced Assets",
                "count": 0,
            },
        ]
        assert breakdown.warnings == []

    def test_reference_breakdown_covers_every_workflow_image_field(self):
        image_paths = set()
        for global_name, config in _workflow.get("globals", {}).items():
            for field_name, field_def in config.get("fields", {}).items():
                if isinstance(field_def, dict) and field_def.get("type") == "image":
                    image_paths.add(f"globals.{global_name}.{field_name}")
        for state in _workflow.get("states", []):
            for field_name, field_def in state.get("fields", {}).items():
                if isinstance(field_def, dict) and field_def.get("type") == "image":
                    image_paths.add(f"states.{state['id']}.{field_name}")

        assert image_paths == REFERENCED_BREAKDOWN_WORKFLOW_IMAGE_PATHS

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

    def test_archive_streams_all_unused_assets_with_cloudinary_paths(
        self, client, user, monkeypatch
    ):
        admin = User.objects.create(
            username="admin@example.com",
            email="admin@example.com",
            is_staff=True,
        )
        client.force_authenticate(user=admin)
        Image.objects.create(
            user=user,
            url="https://res.cloudinary.com/demo/image/upload/glaze_dev/used.jpg",
            cloud_name="demo",
            cloudinary_public_id="glaze_dev/used",
        )
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "api-secret")
        monkeypatch.setenv("CLOUDINARY_UPLOAD_FOLDER", "glaze_dev")

        def fake_resources(**kwargs):
            return {
                "resources": [
                    {
                        "public_id": "glaze_dev/used",
                        "secure_url": "https://example.com/used.jpg",
                        "format": "jpg",
                    },
                    {
                        "public_id": "glaze_dev/piece/orphan",
                        "secure_url": "https://example.com/orphan.heic",
                        "format": "heic",
                    },
                    {
                        "public_id": "glaze_dev/piece/another",
                        "secure_url": "https://example.com/another.webp",
                        "format": "webp",
                    },
                ]
            }

        bodies = {
            "https://example.com/orphan.heic": b"orphan-bytes",
            "https://example.com/another.webp": b"another-bytes",
        }

        class FakeResponse:
            def __init__(self, url: str):
                self._body = bodies[url]

            def raise_for_status(self) -> None:
                pass

            async def aiter_bytes(self, chunk_size: int):
                yield self._body

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

        class FakeClient:
            def __init__(self, timeout: int):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            def stream(self, method: str, url: str):
                return FakeResponse(url)

        monkeypatch.setattr(
            "api.cloudinary_cleanup.cloudinary.api.resources", fake_resources
        )
        monkeypatch.setattr("api.cloudinary_cleanup.httpx.AsyncClient", FakeClient)

        response = client.get(ARCHIVE_URL + "?unreferenced_only=true")

        assert response.status_code == 200
        assert response["Content-Type"] == "application/zip"
        assert response["Cache-Control"] == "no-store"
        assert response["X-Accel-Buffering"] == "no"
        assert response.is_async
        archive_bytes = asyncio.run(_collect_async_bytes(response.streaming_content))
        with ZipFile(BytesIO(archive_bytes)) as archive:
            assert sorted(archive.namelist()) == [
                "demo/glaze_dev/piece/another.webp",
                "demo/glaze_dev/piece/orphan.heic",
            ]
            assert archive.read("demo/glaze_dev/piece/orphan.heic") == b"orphan-bytes"

    def test_archive_iterator_fetches_assets_lazily(self, monkeypatch):
        opened_urls: list[str] = []

        class FakeResponse:
            def __init__(self, url: str):
                self._url = url

            def raise_for_status(self) -> None:
                pass

            async def aiter_bytes(self, chunk_size: int):
                yield f"bytes from {self._url}".encode()

            async def __aenter__(self):
                opened_urls.append(self._url)
                return self

            async def __aexit__(self, *args):
                pass

        class FakeClient:
            def __init__(self, timeout: int):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            def stream(self, method: str, url: str):
                return FakeResponse(url)

        assets = [
            CloudinaryCleanupAsset(
                public_id="glaze_dev/first",
                cloud_name="demo",
                path_prefix="glaze_dev",
                url="https://example.com/first.jpg",
                thumbnail_url="",
                format="jpg",
                bytes=None,
                created_at=None,
                referenced=False,
            ),
            CloudinaryCleanupAsset(
                public_id="glaze_dev/second",
                cloud_name="demo",
                path_prefix="glaze_dev",
                url="https://example.com/second.jpg",
                thumbnail_url="",
                format="jpg",
                bytes=None,
                created_at=None,
                referenced=False,
            ),
        ]
        monkeypatch.setattr("api.cloudinary_cleanup.httpx.AsyncClient", FakeClient)

        async def first_archive_chunk() -> bytes:
            async for chunk in stream_cloudinary_cleanup_archive(assets):
                return chunk
            return b""

        first_chunk = asyncio.run(first_archive_chunk())

        assert first_chunk
        assert opened_urls == ["https://example.com/first.jpg"]
