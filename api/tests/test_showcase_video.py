from pathlib import Path
from unittest.mock import patch

import av
import numpy as np
import pytest
from django.urls import reverse
from PIL import Image as PILImage

from api.models import AsyncTask, Image, Piece, PieceState, PieceStateImage
from api.showcase.render import (
    _BACKGROUND,
    _BRAND_LOCKUP_SCALE,
    _ascii_text,
    _apply_audio_fade,
    _brand_lockup_layout,
    _fade_background_frame,
    _load_image,
    _render_image_frame,
    _render_closing_frame,
)
from api.showcase.storyboard import build_keepsake_storyboard
from api.tasks import _execute_task
from api.workflow import TERMINAL_STATES


def _make_local_png(path: Path, color: tuple[int, int, int]) -> str:
    from PIL import Image as PILImage

    img = PILImage.new("RGB", (96, 96), color)
    img.save(path, format="PNG")
    return str(path)


def _make_oriented_jpeg(path: Path) -> str:
    from PIL import Image as PILImage

    img = PILImage.new("RGB", (80, 120), (240, 200, 120))
    exif = img.getexif()
    exif[274] = 6  # Rotate 90 degrees clockwise
    img.save(path, format="JPEG", exif=exif)
    return str(path)


def _make_piece_with_terminal_state(user, *, name: str = "Showcase Bowl") -> Piece:
    piece = Piece.objects.create(user=user, name=name)
    terminal_state = sorted(TERMINAL_STATES)[0]
    PieceState.objects.create(piece=piece, user=user, state=terminal_state)
    return piece


def _attach_image(piece: Piece, *, url: str, caption: str = "Frame") -> Image:
    image = Image.objects.create(user=piece.user, url=url)
    state = piece.current_state
    assert state is not None
    PieceStateImage.objects.create(
        piece_state=state,
        image=image,
        order=0,
        caption=caption,
    )
    return image


@pytest.mark.django_db(transaction=True)
class TestShowcaseVideoApi:
    def test_load_image_applies_exif_rotation(self, tmp_path):
        image_path = tmp_path / "rotated.jpg"
        loaded = _load_image({"url": _make_oriented_jpeg(image_path)})

        assert loaded is not None
        assert loaded.size == (120, 80)

    def test_load_image_opens_heic_files(self, tmp_path):
        from pillow_heif import register_heif_opener

        register_heif_opener()

        from PIL import Image as PILImage

        source = PILImage.new("RGB", (48, 72), (30, 120, 210))
        path = tmp_path / "source.heif"
        source.save(path, format="HEIF")

        loaded = _load_image({"url": str(path)})

        assert loaded is not None
        assert loaded.size == (48, 72)

    def test_render_image_frame_uses_ascii_state_labels_without_framing_bars(
        self, tmp_path
    ):
        image_path = tmp_path / "frame.png"
        source_color = (90, 150, 210)
        slide = {
            "image": {"url": _make_local_png(image_path, source_color)},
            "state_label": "Queued → Glaze",
            "caption": "First pass → second pass",
        }

        frame = _render_image_frame(slide)

        assert _ascii_text("Queued → Glaze") == "Queued -> Glaze"
        assert frame.getpixel((1200, 50)) == source_color

    def test_fit_image_preserves_crop_aspect_with_letterboxing(self, tmp_path):
        image_path = tmp_path / "wide.png"
        source = PILImage.new("RGB", (240, 120), (120, 80, 40))
        source.save(image_path, format="PNG")

        from api.showcase.render import _fit_image

        fitted = _fit_image(
            _load_image({"url": str(image_path)}),
            crop={"x": 0.0, "y": 0.0, "width": 0.5, "height": 1.0},
            preserve_aspect=True,
        )

        assert fitted.size == (1280, 720)
        assert fitted.getpixel((10, 10)) == _BACKGROUND
        assert fitted.getpixel((640, 360)) == (120, 80, 40)

    def test_fade_background_frame_does_not_leave_the_last_slide_hanging(
        self,
    ):
        frame = PILImage.new("RGB", (1280, 720), (200, 40, 40))

        faded = _fade_background_frame(frame, 1.0)

        assert faded.getpixel((640, 360)) == _BACKGROUND

    def test_render_closing_frame_keeps_brand_lockup_separated(self):
        frame = _render_closing_frame()
        layout = _brand_lockup_layout(_BRAND_LOCKUP_SCALE)
        gap_mid_x = ((layout["icon_x"] + layout["icon_size"] + layout["text_x"]) // 2) // _BRAND_LOCKUP_SCALE
        gap_mid_y = layout["center_y"] // _BRAND_LOCKUP_SCALE

        assert frame.getpixel((gap_mid_x, gap_mid_y)) == (0, 0, 0)

    def test_apply_audio_fade_scales_tail_samples(self):
        samples = np.ones((2, 8), dtype=np.float32)

        faded = _apply_audio_fade(
            samples,
            samples_written=4,
            target_samples=8,
            fade_samples=4,
        )

        assert faded.shape == samples.shape
        assert faded[0, 0] == pytest.approx(1.0)
        assert faded[0, 1] < faded[0, 0]
        assert faded[0, 2] < faded[0, 1]
        assert faded[0, 3] == pytest.approx(0.25)
        assert faded[0, 4] == pytest.approx(0.0)

    def test_thumbnail_fallback_preserves_crop(self, user):
        piece = Piece.objects.create(user=user, name="Thumbnail Crop")
        state = PieceState.objects.create(piece=piece, user=user, state=sorted(TERMINAL_STATES)[0])
        image = Image.objects.create(
            user=user,
            url="https://example.com/thumb.jpg",
            cloud_name="demo",
            cloudinary_public_id="pieces/thumb",
        )
        PieceStateImage.objects.create(
            piece_state=state,
            image=image,
            crop={"x": 0.2, "y": 0.1, "width": 0.6, "height": 0.5},
            order=0,
        )
        piece.thumbnail = image
        piece.save(update_fields=["thumbnail"])

        storyboard = build_keepsake_storyboard(piece).to_dict()

        assert storyboard["slides"][0]["image"]["crop"] == {
            "x": 0.2,
            "y": 0.1,
            "width": 0.6,
            "height": 0.5,
        }

    def test_render_storyboard_includes_audio_and_crossfade(self, user, tmp_path):
        piece = _make_piece_with_terminal_state(user, name="Audio Piece")
        cover_path = tmp_path / "cover.png"
        detail_path = tmp_path / "detail.png"
        piece.thumbnail = _attach_image(
            piece,
            url=_make_local_png(cover_path, (200, 120, 80)),
            caption="Cover",
        )
        piece.save()

        PieceState.objects.create(
            piece=piece,
            user=user,
            state=sorted(TERMINAL_STATES)[0],
        )
        _attach_image(
            piece,
            url=_make_local_png(detail_path, (80, 140, 200)),
            caption="Detail",
        )

        from api.showcase.storyboard import build_keepsake_storyboard
        from api.showcase.render import render_storyboard_to_mp4

        storyboard = build_keepsake_storyboard(piece)
        output_path = render_storyboard_to_mp4(storyboard.to_dict())
        with av.open(str(output_path)) as container:
            assert any(stream.type == "audio" for stream in container.streams)
            assert any(stream.type == "video" for stream in container.streams)
            duration = container.duration / 1_000_000 if container.duration else 0.0

        assert duration > (
            storyboard.total_duration_ms / 1000.0
        )

    def test_submit_enqueues_async_task_and_streams_artifact(
        self, client, user, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "public-api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_FOLDER", "showcase-videos")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_PRESET", "glaze_video_signed")

        piece = _make_piece_with_terminal_state(user)
        cover_path = tmp_path / "cover.png"
        piece.thumbnail = _attach_image(
            piece,
            url=_make_local_png(cover_path, (200, 120, 80)),
            caption="Cover",
        )
        piece.save()

        client.force_authenticate(user=user)
        url = reverse("piece-showcase-video", kwargs={"piece_id": piece.id})

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=lambda self_obj, task_obj: _execute_task(task_obj.id),
        ), patch(
            "api.showcase.upload_storyboard_video_to_cloudinary",
            autospec=True,
            return_value={
                "cloud_name": "demo-cloud",
                "public_id": "video-hash",
                "secure_url": "https://res.cloudinary.com/demo-cloud/video/upload/v1/showcase-videos/video-hash.mp4",
                "resource_type": "video",
            },
        ):
            response = client.post(url, {}, format="json")

        assert response.status_code == 202
        body = response.json()
        assert body["status"] == "pending"

        task = AsyncTask.objects.get(id=body["task_id"])
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["input_hash"] == task.input_params["input_hash"]
        assert task.result["storyboard"]["slides"][0]["heading"] == piece.name

        status_response = client.get(url)
        assert status_response.status_code == 200
        status_body = status_response.json()
        assert status_body["status"] == "succeeded"
        assert status_body["artifact"]["url"] == (
            "https://res.cloudinary.com/demo-cloud/video/upload/"
            "v1/showcase-videos/video-hash.mp4"
        )
        assert status_body["artifact"]["download_url"] == (
            "https://res.cloudinary.com/demo-cloud/video/upload/"
            "v1/showcase-videos/video-hash.mp4"
        )

    def test_task_uses_storyboard_snapshot_even_if_piece_changes_before_execution(
        self, client, user, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "public-api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_FOLDER", "showcase-videos")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_PRESET", "glaze_video_signed")

        piece = _make_piece_with_terminal_state(user, name="Original Name")
        cover_path = tmp_path / "cover.png"
        piece.thumbnail = _attach_image(
            piece,
            url=_make_local_png(cover_path, (90, 150, 200)),
            caption="Cover",
        )
        piece.save()

        client.force_authenticate(user=user)
        url = reverse("piece-showcase-video", kwargs={"piece_id": piece.id})

        submitted: list[AsyncTask] = []

        def _capture_submit(self_obj, task_obj):
            submitted.append(task_obj)

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=_capture_submit,
        ), patch(
            "api.showcase.upload_storyboard_video_to_cloudinary",
            autospec=True,
            return_value={
                "cloud_name": "demo-cloud",
                "public_id": "video-hash",
                "secure_url": "https://res.cloudinary.com/demo-cloud/video/upload/v1/showcase-videos/video-hash.mp4",
                "resource_type": "video",
            },
        ):
            response = client.post(url, {}, format="json")

        assert response.status_code == 202
        assert submitted
        task = submitted[0]

        piece.name = "Mutated Name"
        piece.save(update_fields=["name"])

        with patch(
            "api.showcase.upload_storyboard_video_to_cloudinary",
            autospec=True,
            return_value={
                "cloud_name": "demo-cloud",
                "public_id": "video-hash",
                "secure_url": "https://res.cloudinary.com/demo-cloud/video/upload/v1/showcase-videos/video-hash.mp4",
                "resource_type": "video",
            },
        ):
            _execute_task(task.id)

        task.refresh_from_db()
        assert task.status == AsyncTask.Status.SUCCESS
        assert task.result["storyboard"]["slides"][0]["heading"] == "Original Name"

    def test_get_marks_render_stale_after_piece_changes(
        self, client, user, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "public-api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_FOLDER", "showcase-videos")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_PRESET", "glaze_video_signed")

        piece = _make_piece_with_terminal_state(user, name="Stable")
        cover_path = tmp_path / "cover.png"
        piece.thumbnail = _attach_image(
            piece,
            url=_make_local_png(cover_path, (120, 90, 140)),
            caption="Cover",
        )
        piece.save()

        client.force_authenticate(user=user)
        url = reverse("piece-showcase-video", kwargs={"piece_id": piece.id})

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=lambda self_obj, task_obj: _execute_task(task_obj.id),
        ), patch(
            "api.showcase.upload_storyboard_video_to_cloudinary",
            autospec=True,
            return_value={
                "cloud_name": "demo-cloud",
                "public_id": "video-hash",
                "secure_url": "https://res.cloudinary.com/demo-cloud/video/upload/v1/showcase-videos/video-hash.mp4",
                "resource_type": "video",
            },
        ):
            response = client.post(url, {}, format="json")

        assert response.status_code == 202
        task_id = response.json()["task_id"]

        piece.name = "Changed"
        piece.save(update_fields=["name"])

        status_response = client.get(url)
        assert status_response.status_code == 200
        body = status_response.json()
        assert body["task_id"] == task_id
        assert body["status"] == "stale-needs-regeneration"
        assert body["is_stale"] is True
        assert body["stored_input_hash"] != body["current_input_hash"]

    def test_other_user_cannot_access_piece_showcase_video(self, client, user, other_user):
        piece = _make_piece_with_terminal_state(user)
        client.force_authenticate(user=other_user)
        url = reverse("piece-showcase-video", kwargs={"piece_id": piece.id})

        response = client.get(url)

        assert response.status_code == 404

    def test_artifact_redirects_to_cloudinary_when_uploaded(
        self, client, user, tmp_path, monkeypatch
    ):
        piece = _make_piece_with_terminal_state(user, name="Cloudinary Ready")
        cover_path = tmp_path / "cover.png"
        piece.thumbnail = _attach_image(
            piece,
            url=_make_local_png(cover_path, (70, 160, 110)),
            caption="Cover",
        )
        piece.save()

        monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
        monkeypatch.setenv("CLOUDINARY_API_KEY", "public-api-key")
        monkeypatch.setenv("CLOUDINARY_API_SECRET", "super-secret")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_FOLDER", "showcase-videos")
        monkeypatch.setenv("CLOUDINARY_VIDEO_UPLOAD_PRESET", "glaze_video_signed")

        client.force_authenticate(user=user)
        url = reverse("piece-showcase-video", kwargs={"piece_id": piece.id})

        with patch(
            "api.tasks.InMemoryTaskInterface.submit",
            autospec=True,
            side_effect=lambda self_obj, task_obj: _execute_task(task_obj.id),
        ), patch(
            "api.showcase.upload_storyboard_video_to_cloudinary",
            autospec=True,
            return_value={
                "cloud_name": "demo-cloud",
                "public_id": "video-hash",
                "secure_url": "https://res.cloudinary.com/demo-cloud/video/upload/v1/showcase-videos/video-hash.mp4",
                "resource_type": "video",
            },
        ) as upload_mock:
            response = client.post(url, {}, format="json")

        assert response.status_code == 202
        task_id = response.json()["task_id"]
        upload_mock.assert_called_once()
        assert upload_mock.call_args.kwargs["input_hash"] == AsyncTask.objects.get(
            id=task_id
        ).input_params["input_hash"]

        status_response = client.get(url)
        assert status_response.status_code == 200
        artifact_url = status_response.json()["artifact"]["url"]
        assert artifact_url == (
            "https://res.cloudinary.com/demo-cloud/video/upload/"
            "v1/showcase-videos/video-hash.mp4"
        )

        task = AsyncTask.objects.get(id=task_id)
        assert task.result["cloudinary_asset"]["secure_url"] == (
            "https://res.cloudinary.com/demo-cloud/video/upload/"
            "v1/showcase-videos/video-hash.mp4"
        )

    def test_submit_rejected_when_cloudinary_video_is_not_configured(
        self, client, user, tmp_path, monkeypatch
    ):
        piece = _make_piece_with_terminal_state(user, name="Disabled")
        cover_path = tmp_path / "cover.png"
        piece.thumbnail = _attach_image(
            piece,
            url=_make_local_png(cover_path, (220, 180, 90)),
            caption="Cover",
        )
        piece.save()

        monkeypatch.delenv("CLOUDINARY_VIDEO_UPLOAD_FOLDER", raising=False)
        monkeypatch.delenv("CLOUDINARY_VIDEO_UPLOAD_PRESET", raising=False)

        client.force_authenticate(user=user)
        url = reverse("piece-showcase-video", kwargs={"piece_id": piece.id})

        response = client.post(url, {}, format="json")

        assert response.status_code == 503
        assert response.json()["detail"] == (
            "Cloudinary showcase video uploads are not configured."
        )

        status_response = client.get(url)
        assert status_response.status_code == 200
        assert status_response.json()["status"] == "disabled"
        assert status_response.json()["enabled"] is False
