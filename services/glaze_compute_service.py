"""Glaze compute service — remote offloading of CPU/memory-intensive tasks.

All three functions use a metadata-in / metadata-out interface:
- Celery passes public R2 source URLs and presigned PUT destination URLs.
- Modal fetches source bytes, processes them, and PUTs results directly to R2.
- No bytes transit through the Celery↔Modal boundary.

Deployment (Modal):
    modal deploy services/glaze_compute_service.py

Local usage:
    modal run services/glaze_compute_service.py::crop_image ...
"""

import io
import logging
import math
import tempfile
from fractions import Fraction
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

# ── Modal configuration ───────────────────────────────────────────────────────

try:
    import modal

    _pil_image = modal.Image.debian_slim().pip_install(
        # Versions must stay in sync with pyproject.toml — enforced by
        # tools/check_modal_deps.py in CI.
        "pillow==12.2.0",
        "pillow-heif==1.3.0",
        "requests==2.33.1",
    )

    _video_image = (
        modal.Image.debian_slim()
        .apt_install("ffmpeg", "fonts-dejavu-core")
        .pip_install(
            "av>=17.0.1",
            "numpy",
            "pillow==12.2.0",
            "pillow-heif==1.3.0",
            "requests==2.33.1",
        )
    )

    app = modal.App("glaze-compute")

except ImportError:
    app = None  # type: ignore[assignment]
    modal = None  # type: ignore[assignment]


# ── Crop constants (mirror api/crops.py) ─────────────────────────────────────

_CROPPED_IMAGE_MAX_EDGE = 1600
_CROPPED_IMAGE_JPEG_QUALITY = 82

# ── Showcase video constants (mirror api/showcase/render.py) ─────────────────

_SHOWCASE_VIDEO_FPS = 24
_SHOWCASE_VIDEO_CANVAS_SIZE = (1280, 720)
_SHOWCASE_VIDEO_FADE_SECONDS = 0.75
_SHOWCASE_VIDEO_CLOSING_SECONDS = 3.0
_SLIDE_RENDER_SCALE = 2
_BACKGROUND = (0, 0, 0)


# ── PIL helpers ───────────────────────────────────────────────────────────────


def _fetch_bytes(url: str) -> bytes:
    import requests

    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.content


def _put_bytes(presigned_url: str, data: bytes, content_type: str) -> None:
    import requests

    resp = requests.put(
        presigned_url,
        data=data,
        headers={"Content-Type": content_type},
        timeout=120,
    )
    resp.raise_for_status()


def _crop_image_bytes(original_bytes: bytes, crop: dict) -> bytes:
    """Crop and resize image bytes to a JPEG derivative.

    Mirrors generate_cropped_image_bytes() in api/crops.py exactly.
    """
    from PIL import Image as PILImage
    from PIL import ImageOps
    from pillow_heif import register_heif_opener

    register_heif_opener()

    with PILImage.open(io.BytesIO(original_bytes)) as source:
        image = ImageOps.exif_transpose(source)
        assert image is not None
        width, height = image.size
        left = max(0, min(width, round(float(crop["x"]) * width)))
        top = max(0, min(height, round(float(crop["y"]) * height)))
        right = max(
            left + 1,
            min(width, round((float(crop["x"]) + float(crop["width"])) * width)),
        )
        bottom = max(
            top + 1,
            min(height, round((float(crop["y"]) + float(crop["height"])) * height)),
        )
        cropped = image.crop((left, top, right, bottom))
        long_edge = max(cropped.size)
        if long_edge > _CROPPED_IMAGE_MAX_EDGE:
            scale = _CROPPED_IMAGE_MAX_EDGE / long_edge
            cropped = cropped.resize(
                (
                    max(1, round(cropped.size[0] * scale)),
                    max(1, round(cropped.size[1] * scale)),
                )
            )
        if cropped.mode == "RGBA":
            bg = PILImage.new("RGB", cropped.size, (255, 255, 255))
            bg.paste(cropped, mask=cropped.split()[3])
            cropped = bg
        elif cropped.mode != "RGB":
            cropped = cropped.convert("RGB")
        out = io.BytesIO()
        cropped.save(out, format="JPEG", quality=_CROPPED_IMAGE_JPEG_QUALITY)
        return out.getvalue()


def _convert_to_jpeg_bytes(original_bytes: bytes) -> tuple[bytes, int, int]:
    """Convert image bytes to JPEG, returning (jpeg_bytes, width, height).

    Mirrors the PIL pipeline in the convert_image_to_jpeg task in api/tasks.py.
    """
    from PIL import Image as PILImage
    from PIL import ImageOps
    from pillow_heif import register_heif_opener

    register_heif_opener()

    with PILImage.open(io.BytesIO(original_bytes)) as src:
        img = ImageOps.exif_transpose(src)
        assert img is not None
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        elif img.mode == "RGBA":
            background = PILImage.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        long_edge = max(img.size)
        _MAX = 2560
        if long_edge > _MAX:
            scale = _MAX / long_edge
            img = img.resize(
                (max(1, round(img.size[0] * scale)), max(1, round(img.size[1] * scale)))
            )
        width, height = img.size
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue(), width, height


# ── Showcase video helpers (mirrors api/showcase/render.py) ──────────────────


def _slide_start_times(
    durations: list[float], transition_seconds: float
) -> list[float]:
    starts = []
    t = 0.0
    for i, d in enumerate(durations):
        starts.append(t)
        t += d
        if i < len(durations) - 1:
            t -= transition_seconds
    return starts


def _fade_alpha(t: float, fade_start: float, fade_seconds: float) -> float:
    if fade_seconds <= 0 or t <= fade_start:
        return 1.0
    return min(1.0, max(0.0, 1.0 - (t - fade_start) / fade_seconds))


_FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
_FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
_TEXT_COLOR_PRIMARY = (255, 255, 255)
_TEXT_COLOR_SECONDARY = (180, 180, 180)
_TEXT_SHADOW = (0, 0, 0)


def _load_font(path: str, size: int) -> Any:
    from PIL import ImageFont

    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def _draw_text_centered(
    draw: Any, text: str, font: Any, canvas_w: int, y: int, color: tuple
) -> None:

    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    x = max(0, (canvas_w - text_w) // 2)
    # Drop shadow for legibility over any background
    draw.text((x + 2, y + 2), text, font=font, fill=_TEXT_SHADOW)
    draw.text((x, y), text, font=font, fill=color)


def _draw_text_wrapped(
    draw: Any, text: str, font: Any, max_width: int, x: int, y: int, color: tuple
) -> int:
    """Draw wrapped text, return the y position after the last line."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    line_height = draw.textbbox((0, 0), "A", font=font)[3] + 8
    for line in lines:
        draw.text((x + 2, y + 2), line, font=font, fill=_TEXT_SHADOW)
        draw.text((x, y), line, font=font, fill=color)
        y += line_height
    return y


def _render_slide_canvas(slide: dict) -> Any:
    """Render a single slide dict (cover/image/note) to a PIL image at canvas size."""
    import requests
    from PIL import Image as PILImage
    from PIL import ImageDraw, ImageOps
    from pillow_heif import register_heif_opener

    register_heif_opener()

    canvas_w, canvas_h = _SHOWCASE_VIDEO_CANVAS_SIZE
    canvas = PILImage.new("RGB", (canvas_w, canvas_h), _BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    kind = slide.get("kind", "image")
    image_data = slide.get("image")
    heading = slide.get("heading") or ""
    caption = slide.get("caption") or ""
    text = slide.get("text") or ""
    state_label = slide.get("state_label") or ""

    # Render photo if present (cover and image slides may have one)
    if image_data and image_data.get("url"):
        image_url = image_data["url"]
        try:
            img_bytes = requests.get(image_url, timeout=30).content
            with PILImage.open(io.BytesIO(img_bytes)) as raw:
                img = ImageOps.exif_transpose(raw)
                assert img is not None
                img = img.convert("RGB")
                img_w, img_h = img.size
                scale_factor = min(canvas_w / img_w, canvas_h / img_h)
                new_w = max(1, round(img_w * scale_factor))
                new_h = max(1, round(img_h * scale_factor))
                img = img.resize((new_w, new_h), PILImage.Resampling.LANCZOS)
                x = (canvas_w - new_w) // 2
                y = (canvas_h - new_h) // 2
                canvas.paste(img, (x, y))
        except Exception:
            logger.warning("Failed to fetch slide image: %s", image_url)

    if kind == "cover":
        font_title = _load_font(_FONT_BOLD, 56)
        font_sub = _load_font(_FONT_REGULAR, 28)
        if heading:
            _draw_text_centered(
                draw,
                heading,
                font_title,
                canvas_w,
                canvas_h // 2 - 40,
                _TEXT_COLOR_PRIMARY,
            )
        if state_label:
            _draw_text_centered(
                draw,
                state_label,
                font_sub,
                canvas_w,
                canvas_h // 2 + 30,
                _TEXT_COLOR_SECONDARY,
            )

    elif kind == "note":
        font_label = _load_font(_FONT_REGULAR, 22)
        font_body = _load_font(_FONT_REGULAR, 30)
        margin = 80
        if state_label:
            _draw_text_centered(
                draw,
                state_label.upper(),
                font_label,
                canvas_w,
                40,
                _TEXT_COLOR_SECONDARY,
            )
        if text:
            _draw_text_wrapped(
                draw,
                text,
                font_body,
                canvas_w - margin * 2,
                margin,
                100,
                _TEXT_COLOR_PRIMARY,
            )

    else:  # "image"
        font_caption = _load_font(_FONT_REGULAR, 24)
        font_label = _load_font(_FONT_REGULAR, 20)
        if caption:
            _draw_text_centered(
                draw,
                caption,
                font_caption,
                canvas_w,
                canvas_h - 52,
                _TEXT_COLOR_SECONDARY,
            )
        if state_label:
            draw.text(
                (22, canvas_h - 52),
                state_label,
                font=font_label,
                fill=_TEXT_COLOR_SECONDARY,
            )

    return canvas


def _render_closing_canvas() -> Any:
    """Render a branded closing frame (black background, 'PotterDoc' wordmark)."""
    from PIL import Image as PILImage
    from PIL import ImageDraw

    canvas_w, canvas_h = _SHOWCASE_VIDEO_CANVAS_SIZE
    canvas = PILImage.new("RGB", (canvas_w, canvas_h), _BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    font = _load_font(_FONT_BOLD, 64)
    font_sub = _load_font(_FONT_REGULAR, 28)
    _draw_text_centered(
        draw, "PotterDoc", font, canvas_w, canvas_h // 2 - 48, _TEXT_COLOR_PRIMARY
    )
    _draw_text_centered(
        draw,
        "potterdoc.com",
        font_sub,
        canvas_w,
        canvas_h // 2 + 28,
        _TEXT_COLOR_SECONDARY,
    )
    return canvas


def _make_progress_callback(
    progress_webhook_url: str, progress_token: str
) -> Callable[[int], None]:
    import requests as req

    def callback(pct: int) -> None:
        try:
            req.post(
                progress_webhook_url,
                json={"progress": pct},
                headers={"X-Task-Token": progress_token},
                timeout=5,
            )
        except Exception:
            pass

    return callback


def _render_to_file(
    storyboard: dict,
    output_path: Path,
    music_url: str | None = None,
    on_progress: Callable[[int], None] | None = None,
) -> None:
    """Render a storyboard to an fMP4+sidx file at output_path.

    Uses frag_keyframe+empty_moov+default_base_moof+dash movflags for
    efficient HTTP range-request seeking without a player library.
    Fixed GOP (gop_size = FPS) gives deterministic fragment count.
    """
    import av
    import numpy as np
    from av.audio.resampler import AudioResampler

    slides = list(storyboard.get("slides", []))
    durations = [float(s.get("duration_ms", 3000)) / 1000.0 for s in slides]
    durations.append(_SHOWCASE_VIDEO_CLOSING_SECONDS)

    transition_seconds = min(
        _SHOWCASE_VIDEO_FADE_SECONDS,
        *(d / 2 for d in durations),
    )
    fade_seconds = min(_SHOWCASE_VIDEO_FADE_SECONDS, durations[-1] / 2)

    slide_canvases = [_render_slide_canvas(s) for s in slides]
    slide_canvases.append(_render_closing_canvas())

    with av.open(
        str(output_path),
        mode="w",
        format="mp4",
        options={"movflags": "frag_keyframe+empty_moov+default_base_moof+dash"},
    ) as container:
        video_stream = container.add_stream("libx264", rate=_SHOWCASE_VIDEO_FPS)
        video_stream.width = _SHOWCASE_VIDEO_CANVAS_SIZE[0]
        video_stream.height = _SHOWCASE_VIDEO_CANVAS_SIZE[1]
        video_stream.pix_fmt = "yuv420p"
        video_stream.time_base = Fraction(1, _SHOWCASE_VIDEO_FPS)
        video_stream.thread_count = 1
        video_stream.codec_context.gop_size = _SHOWCASE_VIDEO_FPS

        if len(slide_canvases) == 1:
            total_frames = max(1, math.ceil(durations[0] * _SHOWCASE_VIDEO_FPS))
        else:
            starts = _slide_start_times(durations, transition_seconds)
            effective_duration = starts[-1] + durations[-1]
            total_frames = max(1, math.ceil(effective_duration * _SHOWCASE_VIDEO_FPS))

        import time as _time

        last_reported = _time.monotonic()
        frame_count = 0
        video_packets: list[Any] = []

        for frame_img in _iter_video_frames(
            slide_canvases, durations, transition_seconds, fade_seconds
        ):
            video_frame = av.VideoFrame.from_image(frame_img)
            video_frame.pts = frame_count
            video_frame.time_base = Fraction(1, _SHOWCASE_VIDEO_FPS)
            for packet in video_stream.encode(video_frame):
                video_packets.append(packet)
            frame_count += 1
            if on_progress is not None:
                now = _time.monotonic()
                if now - last_reported >= 1.0:
                    on_progress(min(100, round(frame_count / total_frames * 100)))
                    last_reported = now

        for packet in video_stream.encode():
            video_packets.append(packet)

        video_duration_seconds = frame_count / _SHOWCASE_VIDEO_FPS

        audio_stream = container.add_stream("aac", rate=44100)
        audio_stream.layout = "stereo"
        audio_resampler = AudioResampler(format="fltp", layout="stereo", rate=44100)

        # music_url resolved by caller (Celery) and passed in
        audio_packets: list[Any] = []
        sample_rate = 44100
        target_samples = round(video_duration_seconds * sample_rate)
        layout = "stereo"
        packet_time_base = Fraction(1, sample_rate)

        if music_url:
            import requests as req

            try:
                music_bytes = req.get(music_url, timeout=30).content
                with av.open(io.BytesIO(music_bytes)) as music_container:
                    in_stream = music_container.streams.audio[0]
                    samples_written = 0
                    for frame in music_container.decode(in_stream):
                        resampled = audio_resampler.resample(frame)
                        if resampled is None:
                            continue
                        for rf in (
                            resampled if isinstance(resampled, list) else [resampled]
                        ):
                            samples = np.array(rf.to_ndarray(), dtype=np.float32)
                            if samples_written + samples.shape[-1] > target_samples:
                                samples = samples[
                                    ..., : target_samples - samples_written
                                ]
                            audio_frame = av.AudioFrame.from_ndarray(
                                samples, format="fltp", layout=layout
                            )
                            audio_frame.sample_rate = sample_rate
                            audio_frame.pts = samples_written
                            audio_frame.time_base = packet_time_base
                            for packet in audio_stream.encode(audio_frame):
                                packet.time_base = packet_time_base
                                audio_packets.append(packet)
                            samples_written += samples.shape[-1]
                            if samples_written >= target_samples:
                                break
                    if samples_written < target_samples:
                        remaining = target_samples - samples_written
                        silence = av.AudioFrame(
                            format="fltp", layout=layout, samples=remaining
                        )
                        silence.sample_rate = sample_rate
                        silence.pts = samples_written
                        silence.time_base = packet_time_base
                        for plane in silence.planes:
                            plane.update(b"\x00" * plane.buffer_size)
                        for packet in audio_stream.encode(silence):
                            packet.time_base = packet_time_base
                            audio_packets.append(packet)
            except Exception:
                logger.warning("Failed to load music track, rendering silent video")

        if not audio_packets:
            silence = av.AudioFrame(
                format="fltp", layout=layout, samples=target_samples
            )
            silence.sample_rate = sample_rate
            silence.pts = 0
            silence.time_base = packet_time_base
            for plane in silence.planes:
                plane.update(b"\x00" * plane.buffer_size)
            for packet in audio_stream.encode(silence):
                packet.time_base = packet_time_base
                audio_packets.append(packet)

        for packet in audio_stream.encode():
            audio_packets.append(packet)

        audio_offset = 0
        for packet in audio_packets:
            timestamp = packet.dts if packet.dts is not None else packet.pts
            if timestamp is None:
                continue
            audio_offset = max(audio_offset, -int(timestamp))
        if audio_offset:
            for packet in audio_packets:
                if packet.pts is not None:
                    packet.pts += audio_offset
                if packet.dts is not None:
                    packet.dts += audio_offset

        def _packet_timestamp(packet: Any) -> float:
            timestamp = packet.dts if packet.dts is not None else packet.pts
            if timestamp is None or packet.time_base is None:
                return 0.0
            return float(timestamp * packet.time_base)

        for packet in sorted(
            [*video_packets, *audio_packets],
            key=lambda p: (
                _packet_timestamp(p),
                0 if p.stream and p.stream.type == "video" else 1,
            ),
        ):
            container.mux(packet)


def _iter_video_frames(
    slide_canvases: list[Any],
    durations: list[float],
    transition_seconds: float,
    fade_seconds: float,
) -> Any:
    """Yield PIL images for each video frame, with fade transitions."""
    from PIL import Image as PILImage

    fps = _SHOWCASE_VIDEO_FPS
    n = len(slide_canvases)

    if n == 1:
        total_duration = durations[0]
        fade_start = total_duration - fade_seconds
        num_frames = max(1, math.ceil(total_duration * fps))
        for i in range(num_frames):
            t = i / fps
            alpha = _fade_alpha(t, fade_start, fade_seconds)
            if alpha < 1.0:
                frame = PILImage.blend(
                    slide_canvases[0],
                    PILImage.new("RGB", _SHOWCASE_VIDEO_CANVAS_SIZE, _BACKGROUND),
                    1.0 - alpha,
                )
            else:
                frame = slide_canvases[0].copy()
            yield frame
        return

    starts = _slide_start_times(durations, transition_seconds)
    effective_duration = starts[-1] + durations[-1]
    num_frames = max(1, math.ceil(effective_duration * fps))

    for i in range(num_frames):
        t = i / fps
        # Find which slide(s) are active at time t
        active_idx = 0
        for idx in range(n):
            if t >= starts[idx]:
                active_idx = idx

        slide_t = t - starts[active_idx]
        current = slide_canvases[active_idx]

        # Transition blend with next slide
        if active_idx < n - 1 and slide_t >= durations[active_idx] - transition_seconds:
            blend_t = (slide_t - (durations[active_idx] - transition_seconds)) / max(
                transition_seconds, 1e-9
            )
            blend_t = max(0.0, min(1.0, blend_t))
            frame = PILImage.blend(current, slide_canvases[active_idx + 1], blend_t)
        else:
            frame = current.copy()

        # Fade out at end
        global_fade_start = (
            effective_duration - durations[-1] + (durations[-1] - fade_seconds)
        )
        alpha = _fade_alpha(t, global_fade_start, fade_seconds)
        if alpha < 1.0:
            frame = PILImage.blend(
                frame,
                PILImage.new("RGB", _SHOWCASE_VIDEO_CANVAS_SIZE, _BACKGROUND),
                1.0 - alpha,
            )

        yield frame


# ── Modal functions ───────────────────────────────────────────────────────────

if app is not None:

    @app.function(image=_pil_image)
    def crop_image(source_url: str, crop: dict, presigned_put_url: str) -> None:
        """Fetch source image, apply crop, PUT JPEG derivative to R2.

        Args:
            source_url: Public R2 URL of the original image.
            crop: Normalized {x, y, width, height} crop coordinates.
            presigned_put_url: Presigned PUT URL for the crop derivative key.
        """
        original_bytes = _fetch_bytes(source_url)
        jpeg_bytes = _crop_image_bytes(original_bytes, crop)
        _put_bytes(presigned_put_url, jpeg_bytes, "image/jpeg")

    @app.function(image=_pil_image)
    def convert_to_jpeg(source_url: str, presigned_put_url: str) -> dict:
        """Fetch source image, convert to JPEG, PUT to R2.

        Args:
            source_url: Public R2 URL of the source image.
            presigned_put_url: Presigned PUT URL for the JPEG derivative key.

        Returns:
            {"width": int, "height": int} for DB writeback by Celery.
        """
        original_bytes = _fetch_bytes(source_url)
        jpeg_bytes, width, height = _convert_to_jpeg_bytes(original_bytes)
        _put_bytes(presigned_put_url, jpeg_bytes, "image/jpeg")
        return {"width": width, "height": height}

    @app.function(image=_video_image, ephemeral_disk=2048, timeout=900)
    def render_showcase_video(
        storyboard: dict,
        presigned_put_url: str,
        progress_webhook_url: str,
        progress_token: str,
        music_url: str | None = None,
    ) -> None:
        """Render storyboard to fMP4+sidx, PUT MP4 to R2 via presigned URL.

        Args:
            storyboard: Render-ready storyboard snapshot dict.
            presigned_put_url: Presigned PUT URL for the showcase video R2 key.
            progress_webhook_url: URL to POST progress updates to.
            progress_token: HMAC token for authenticating progress callbacks.
            music_url: Resolved audio URL for the selected music track, or None.
        """
        on_progress = _make_progress_callback(progress_webhook_url, progress_token)

        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
            output_path = Path(tf.name)

        try:
            _render_to_file(
                storyboard, output_path, music_url=music_url, on_progress=on_progress
            )
            mp4_bytes = output_path.read_bytes()
            _put_bytes(presigned_put_url, mp4_bytes, "video/mp4")
        finally:
            output_path.unlink(missing_ok=True)
