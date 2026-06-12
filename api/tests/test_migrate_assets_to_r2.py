"""Tests for the migrate_assets_to_r2 management command."""

import io

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import CommandError
from PIL import Image as PILImage

from api.crops import crop_key_for
from api.models import ENTRY_STATE, Image, Piece, PieceState, PieceStateImage

CROP = {"x": 0.1, "y": 0.2, "width": 0.6, "height": 0.5}
CLOUDINARY_URL = "https://res.cloudinary.com/demo/image/upload/glaze/mug.jpg"


def _png_bytes(size=(100, 80)) -> bytes:
    buf = io.BytesIO()
    PILImage.new("RGB", size, (200, 30, 30)).save(buf, format="PNG")
    return buf.getvalue()


def _set_r2_env(monkeypatch):
    monkeypatch.setenv("R2_ACCOUNT_ID", "acct")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "key")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "secret")
    monkeypatch.setenv("R2_BUCKET_NAME", "bucket")
    monkeypatch.setenv("R2_PUBLIC_URL", "https://media.example.com")


class _FakeHttpResponse:
    def __init__(self, content: bytes, content_type: str):
        self.content = content
        self.headers = {"content-type": content_type}

    def raise_for_status(self) -> None:
        return None


class _FakeHttpClient:
    """Stands in for httpx.Client; records requested URLs."""

    def __init__(self, *args, **kwargs):
        self.requested: list[str] = []

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False

    def get(self, url: str) -> _FakeHttpResponse:
        self.requested.append(url)
        return _FakeHttpResponse(_png_bytes(), "image/png")


def _mock_r2_store(monkeypatch):
    """In-memory R2: upload_bytes/object_exists/get_object_bytes share a dict."""
    store: dict[str, bytes] = {}

    def upload_bytes(key, data, content_type):
        store[key] = data
        return f"https://media.example.com/{key}"

    monkeypatch.setattr("api.r2.upload_bytes", upload_bytes)
    monkeypatch.setattr("api.r2.object_exists", lambda key: key in store)
    monkeypatch.setattr("api.r2.get_object_bytes", lambda key: store[key])
    return store


def _mock_http(monkeypatch):
    fake = _FakeHttpClient()
    monkeypatch.setattr(
        "api.management.commands.migrate_assets_to_r2.httpx.Client",
        lambda *args, **kwargs: fake,
    )
    return fake


@pytest.fixture
def user(db):
    return User.objects.create(
        username="migrate@example.com", email="migrate@example.com"
    )


def _make_piece_with_link(user, image, *, crop=None):
    piece = Piece.objects.create(user=user, name="Mug", is_editable=True)
    state = PieceState.objects.create(
        piece=piece, user=user, state=ENTRY_STATE, order=1
    )
    return PieceStateImage.objects.create(
        piece_state=state, image=image, order=0, crop=crop
    )


@pytest.mark.django_db
class TestMigrateAssetsToR2:
    def test_requires_r2_configuration(self, monkeypatch):
        for var in (
            "R2_ACCOUNT_ID",
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "R2_BUCKET_NAME",
            "R2_PUBLIC_URL",
        ):
            monkeypatch.delenv(var, raising=False)
        with pytest.raises(CommandError, match="R2 is not configured"):
            call_command("migrate_assets_to_r2")

    def test_migrates_cloudinary_image_and_backfills_crop(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        store = _mock_r2_store(monkeypatch)
        http = _mock_http(monkeypatch)
        image = Image.objects.create(user=user, url=CLOUDINARY_URL)
        link = _make_piece_with_link(user, image, crop=CROP)

        call_command("migrate_assets_to_r2")

        image.refresh_from_db()
        expected_key = f"images/{user.id}/{image.id}.png"
        assert http.requested == [CLOUDINARY_URL]
        assert image.r2_key == expected_key
        assert image.url == f"https://media.example.com/{expected_key}"
        assert expected_key in store

        link.refresh_from_db()
        crop_key = crop_key_for(expected_key, CROP)
        assert link.cropped_r2_key == crop_key
        assert link.cropped_url == f"https://media.example.com/{crop_key}"
        assert crop_key in store

    def test_second_run_is_a_noop(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        store = _mock_r2_store(monkeypatch)
        _mock_http(monkeypatch)
        image = Image.objects.create(user=user, url=CLOUDINARY_URL)
        _make_piece_with_link(user, image, crop=CROP)

        call_command("migrate_assets_to_r2")
        first_run_store = dict(store)
        http_second = _mock_http(monkeypatch)

        call_command("migrate_assets_to_r2")

        assert http_second.requested == []
        assert store == first_run_store

    def test_skips_non_cloudinary_and_already_migrated_rows(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        _mock_r2_store(monkeypatch)
        http = _mock_http(monkeypatch)
        external = Image.objects.create(
            user=user, url="https://example.org/some/pasted.jpg"
        )
        migrated = Image.objects.create(
            user=user,
            url="https://media.example.com/images/1/done.jpg",
            r2_key="images/1/done.jpg",
        )

        call_command("migrate_assets_to_r2")

        external.refresh_from_db()
        migrated.refresh_from_db()
        assert http.requested == []
        assert external.r2_key is None
        assert external.url == "https://example.org/some/pasted.jpg"
        assert migrated.r2_key == "images/1/done.jpg"

    def test_dry_run_writes_nothing(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        store = _mock_r2_store(monkeypatch)
        http = _mock_http(monkeypatch)
        image = Image.objects.create(user=user, url=CLOUDINARY_URL)
        link = _make_piece_with_link(user, image, crop=CROP)

        call_command("migrate_assets_to_r2", "--dry-run")

        image.refresh_from_db()
        link.refresh_from_db()
        assert http.requested == []
        assert store == {}
        assert image.r2_key is None
        assert image.url == CLOUDINARY_URL
        assert link.cropped_r2_key is None

    def test_download_failure_continues_with_remaining_images(self, user, monkeypatch):
        _set_r2_env(monkeypatch)
        _mock_r2_store(monkeypatch)

        bad_url = "https://res.cloudinary.com/demo/image/upload/glaze/broken.jpg"

        class _FlakyClient(_FakeHttpClient):
            def get(self, url: str) -> _FakeHttpResponse:
                if url == bad_url:
                    raise RuntimeError("connection reset")
                return super().get(url)

        flaky = _FlakyClient()
        monkeypatch.setattr(
            "api.management.commands.migrate_assets_to_r2.httpx.Client",
            lambda *args, **kwargs: flaky,
        )
        broken = Image.objects.create(user=user, url=bad_url)
        # Created second, but ordering is by created — both get attempted.
        ok = Image.objects.create(user=user, url=CLOUDINARY_URL)

        call_command("migrate_assets_to_r2")

        broken.refresh_from_db()
        ok.refresh_from_db()
        assert broken.r2_key is None
        assert ok.r2_key == f"images/{user.id}/{ok.id}.png"
