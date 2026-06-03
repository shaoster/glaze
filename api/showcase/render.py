"""Deterministic Showcase video rendering helpers.

This module turns a render-ready storyboard snapshot into a playable MP4 file.
The render pipeline is intentionally boring: it uses a fixed canvas size, fixed
frame rate, and fixed slide durations so the same storyboard always yields the
same output bytes.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
import re
import tempfile
import textwrap
import unicodedata
from fractions import Fraction
from functools import lru_cache
from pathlib import Path
from typing import Any

import av
import numpy as np
import requests
from av.audio.resampler import AudioResampler
from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont, ImageOps
from pillow_heif import register_heif_opener

from .music import get_track
from .storyboard import validate_storyboard

SHOWCASE_VIDEO_TASK_TYPE = "generate_showcase_video"
SHOWCASE_VIDEO_RENDER_VERSION = "4"
SHOWCASE_VIDEO_FORMAT = "mp4"
SHOWCASE_VIDEO_CANVAS_SIZE = (1280, 720)
SHOWCASE_VIDEO_FPS = 24
SHOWCASE_VIDEO_FADE_SECONDS = 0.75
SHOWCASE_VIDEO_CLOSING_SECONDS = 3.0
_BRAND_LOCKUP_SCALE = 4
_BRAND_ICON_VIEWBOX = 128
_BRAND_ICON_FILL = "#C66A3D"
_BRAND_ICON_STROKE = "#8A3F1D"
_BRAND_ICON_WHEEL_FILL = "#E6C3A0"

_BACKGROUND = (0, 0, 0)
_ACCENT = (122, 79, 58)
_INK = (54, 38, 28)
_MUTED = (108, 90, 78)
_WHITE = (255, 250, 246)
_FONT_PATH = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent

register_heif_opener()


def _canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


@lru_cache(maxsize=None)
def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if _FONT_PATH.exists():
        return ImageFont.truetype(str(_FONT_PATH), size=size)
    return ImageFont.load_default()


def compute_storyboard_hash(storyboard: dict) -> str:
    """Return a stable content hash for a storyboard snapshot."""
    payload = {
        "render_version": SHOWCASE_VIDEO_RENDER_VERSION,
        "storyboard": storyboard,
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def _load_image(image_dict: dict | None) -> PILImage.Image | None:
    if not image_dict:
        return None
    url = str(image_dict.get("url") or "").strip()
    if not url:
        return None

    try:
        if url.startswith(("http://", "https://")):
            response = requests.get(url, timeout=15)
            response.raise_for_status()
            raw = response.content
        else:
            raw = Path(url).read_bytes()
        image = PILImage.open(io.BytesIO(raw))
        image.load()
        return ImageOps.exif_transpose(image).convert("RGB")
    except Exception:
        return None


def _fit_image(
    image: PILImage.Image,
    *,
    crop: dict | None = None,
    preserve_aspect: bool = False,
) -> PILImage.Image:
    width, height = SHOWCASE_VIDEO_CANVAS_SIZE
    if crop:
        try:
            crop_x = float(crop.get("x", 0.0))
            crop_y = float(crop.get("y", 0.0))
            crop_w = float(crop.get("width", 1.0))
            crop_h = float(crop.get("height", 1.0))
        except (TypeError, ValueError, AttributeError):
            crop_x = crop_y = 0.0
            crop_w = crop_h = 1.0
        left = max(0, min(image.width - 1, round(image.width * crop_x)))
        top = max(0, min(image.height - 1, round(image.height * crop_y)))
        right = max(left + 1, min(image.width, round(image.width * (crop_x + crop_w))))
        bottom = max(top + 1, min(image.height, round(image.height * (crop_y + crop_h))))
        image = image.crop((left, top, right, bottom))
    if preserve_aspect:
        canvas = PILImage.new("RGB", (width, height), _BACKGROUND)
        contained = ImageOps.contain(
            image,
            (width, height),
            method=PILImage.Resampling.LANCZOS,
        )
        left = (width - contained.width) // 2
        top = (height - contained.height) // 2
        canvas.paste(contained, (left, top))
        return canvas
    return ImageOps.fit(
        image,
        (width, height),
        method=PILImage.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )


def _wrap_text(text: str, *, width: int) -> list[str]:
    if not text:
        return []
    lines: list[str] = []
    for paragraph in text.splitlines():
        if not paragraph.strip():
            lines.append("")
            continue
        lines.extend(textwrap.wrap(paragraph, width=width))
    return lines or [text]


def _ascii_text(text: str | None) -> str:
    if not text:
        return ""
    normalized = (
        text.replace("→", " -> ")
        .replace("←", " <- ")
        .replace("↔", " <-> ")
        .replace("—", "-")
        .replace("–", "-")
    )
    ascii_text = unicodedata.normalize("NFKD", normalized).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text).strip()


def _draw_text_block(
    draw: ImageDraw.ImageDraw,
    text: str,
    *,
    box: tuple[int, int, int, int],
    fill: tuple[int, int, int] = _INK,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    line_spacing: int = 8,
    stroke_width: int = 0,
    stroke_fill: tuple[int, int, int] | None = None,
) -> None:
    left, top, right, bottom = box
    max_chars = max(10, (right - left) // 18)
    lines = _wrap_text(text, width=max_chars)
    y = top
    for line in lines:
        bbox = draw.textbbox(
            (left, y),
            line,
            font=font,
            stroke_width=stroke_width,
        )
        draw.text(
            (left, y),
            line,
            fill=fill,
            font=font,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )
        y = int(bbox[3]) + line_spacing
        if y > bottom:
            break


def _placeholder_canvas() -> PILImage.Image:
    width, height = SHOWCASE_VIDEO_CANVAS_SIZE
    canvas = PILImage.new("RGB", (width, height), _BACKGROUND)
    draw = ImageDraw.Draw(canvas)
    font = _load_font(36)
    draw.rectangle((0, 0, width, height), fill=_BACKGROUND)
    draw.rounded_rectangle((72, 72, width - 72, height - 72), radius=32, fill=_WHITE)
    draw.text((112, 112), "PotterDoc", fill=_ACCENT, font=font)
    return canvas


def _render_potterdoc_icon(size: int) -> PILImage.Image:
    """Render the favicon-style PotterDoc icon at a square size."""
    canvas = PILImage.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    scale = size / _BRAND_ICON_VIEWBOX
    stroke_width = max(1, round(scale))

    wheel_cx = 64 * scale
    wheel_cy = 93.2143 * scale
    wheel_rx = 42 * scale
    wheel_ry = 12 * scale
    draw.ellipse(
        (
            wheel_cx - wheel_rx,
            wheel_cy - wheel_ry,
            wheel_cx + wheel_rx,
            wheel_cy + wheel_ry,
        ),
        fill=_BRAND_ICON_WHEEL_FILL,
        outline=_BRAND_ICON_STROKE,
        width=stroke_width,
    )

    body_left = 42 * scale
    body_top = 29.2143 * scale
    body_right = 86 * scale
    body_bottom = 93.2143 * scale
    draw.rounded_rectangle(
        (body_left, body_top, body_right, body_bottom),
        radius=max(1, round(3.0 * scale)),
        fill=_BRAND_ICON_FILL,
        outline=_BRAND_ICON_STROKE,
        width=stroke_width,
    )

    rim_cx = 64 * scale
    rim_cy = 29.2143 * scale
    rim_rx = 22.5 * scale
    rim_ry = 6.4286 * scale
    draw.ellipse(
        (
            rim_cx - rim_rx,
            rim_cy - rim_ry,
            rim_cx + rim_rx,
            rim_cy + rim_ry,
        ),
        fill=_BRAND_ICON_STROKE,
    )
    return canvas


def _brand_lockup_layout(scale: int) -> dict[str, int]:
    width, height = SHOWCASE_VIDEO_CANVAS_SIZE
    work_width = width * scale
    work_height = height * scale
    title_font = _load_font(56 * scale)
    measurement_canvas = PILImage.new("RGBA", (1, 1), (0, 0, 0, 0))
    measurement_draw = ImageDraw.Draw(measurement_canvas)

    text = "PotterDoc"
    text_bbox = measurement_draw.textbbox((0, 0), text, font=title_font)
    text_width = int(text_bbox[2] - text_bbox[0])

    icon_size = int(96 * scale)
    gap = int(30 * scale)
    total_width = icon_size + gap + text_width
    center_x = work_width // 2
    center_y = work_height // 2
    left_x = center_x - total_width // 2
    icon_y = center_y - icon_size // 2
    text_x = left_x + icon_size + gap
    text_y = int(center_y - ((text_bbox[1] + text_bbox[3]) / 2))
    return {
        "icon_size": icon_size,
        "gap": gap,
        "icon_x": left_x,
        "icon_y": icon_y,
        "text_x": text_x,
        "text_y": text_y,
        "center_y": center_y,
    }


def _render_closing_frame() -> PILImage.Image:
    width, height = SHOWCASE_VIDEO_CANVAS_SIZE
    scale = _BRAND_LOCKUP_SCALE
    work = PILImage.new("RGBA", (width * scale, height * scale), "#000000")
    draw = ImageDraw.Draw(work)

    title_font = _load_font(56 * scale)
    text = "PotterDoc"
    layout = _brand_lockup_layout(scale)
    icon = _render_potterdoc_icon(layout["icon_size"])
    work.alpha_composite(icon, (layout["icon_x"], layout["icon_y"]))
    draw.text(
        (layout["text_x"], layout["text_y"]),
        text,
        fill="#F1E4D2",
        font=title_font,
    )

    return work.resize((width, height), resample=PILImage.Resampling.LANCZOS).convert("RGB")


def _fade_background_frame(frame: PILImage.Image, alpha: float) -> PILImage.Image:
    alpha = max(0.0, min(1.0, alpha))
    if alpha <= 0.0:
        return frame
    background = PILImage.new("RGB", SHOWCASE_VIDEO_CANVAS_SIZE, _BACKGROUND)
    return PILImage.blend(frame, background, alpha)


def _render_cover_frame(storyboard: dict, slide: dict) -> PILImage.Image:
    canvas = _placeholder_canvas()
    source = _load_image(slide.get("image"))
    if source is not None:
        source = _fit_image(
            source,
            crop=slide.get("image", {}).get("crop"),
            preserve_aspect=bool(slide.get("image", {}).get("crop")),
        )
        canvas.paste(source, (0, 0))
        overlay = PILImage.new("RGBA", SHOWCASE_VIDEO_CANVAS_SIZE, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.rectangle(
            (0, 440, SHOWCASE_VIDEO_CANVAS_SIZE[0], SHOWCASE_VIDEO_CANVAS_SIZE[1]),
            fill=(0, 0, 0, 120),
        )
        canvas = PILImage.alpha_composite(canvas.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(canvas)
    title_font = _load_font(42)
    body_font = _load_font(28)
    draw.rounded_rectangle((72, 540, 1208, 648), radius=24, fill=_WHITE)
    draw.text((110, 572), slide.get("heading") or "Untitled piece", fill=_ACCENT, font=title_font)
    story = (slide.get("text") or "").strip()
    if story:
        _draw_text_block(
            draw,
            story,
            box=(110, 606, 1120, 640),
            fill=_MUTED,
            font=body_font,
        )
    return canvas


def _render_image_frame(slide: dict) -> PILImage.Image:
    canvas = _placeholder_canvas()
    source = _load_image(slide.get("image"))
    if source is not None:
        source = _fit_image(
            source,
            crop=slide.get("image", {}).get("crop"),
            preserve_aspect=bool(slide.get("image", {}).get("crop")),
        )
        canvas.paste(source, (0, 0))
    draw = ImageDraw.Draw(canvas)
    header_font = _load_font(30)
    body_font = _load_font(28)
    draw.text(
        (72, 44),
        _ascii_text(slide.get("state_label") or "State"),
        fill=_WHITE,
        font=header_font,
        stroke_width=3,
        stroke_fill=_INK,
    )
    caption = _ascii_text((slide.get("caption") or "").strip())
    if caption:
        _draw_text_block(
            draw,
            caption,
            box=(72, 594, 1208, 680),
            fill=_WHITE,
            font=body_font,
            stroke_width=2,
            stroke_fill=_INK,
        )
    return canvas


def _render_note_frame(slide: dict) -> PILImage.Image:
    canvas = _placeholder_canvas()
    draw = ImageDraw.Draw(canvas)
    title_font = _load_font(36)
    body_font = _load_font(28)
    draw.rounded_rectangle((72, 72, 1208, 648), radius=32, fill=_WHITE)
    draw.text(
        (112, 120),
        _ascii_text(slide.get("state_label") or "Note"),
        fill=_ACCENT,
        font=title_font,
    )
    note = _ascii_text((slide.get("text") or "").strip())
    if note:
        _draw_text_block(
            draw,
            note,
            box=(112, 180, 1140, 612),
            fill=_INK,
            font=body_font,
            line_spacing=10,
        )
    return canvas


def _slide_duration_seconds(slide: dict) -> float:
    duration_ms = float(slide.get("duration_ms", 0) or 0)
    return max(0.1, duration_ms / 1000.0)


def _resolve_music_audio_path(storyboard: dict) -> Path:
    track = get_track(storyboard.get("music_track_id"))
    if track is None:
        raise ValueError(f"Unknown music track id: {storyboard.get('music_track_id')!r}")
    audio_url = track.audio.url
    if not audio_url:
        raise ValueError(f"Track {track.track_id!r} does not have a local audio asset.")
    audio_path = Path(audio_url)
    if not audio_path.is_absolute():
        audio_path = _REPO_ROOT / audio_path
    if not audio_path.exists():
        raise FileNotFoundError(f"Music asset not found: {audio_path}")
    return audio_path


def _slide_start_times(durations: list[float], transition_seconds: float) -> list[float]:
    starts = [0.0]
    for duration in durations[:-1]:
        starts.append(starts[-1] + duration - transition_seconds)
    return starts


def _render_slide_canvases(storyboard: dict) -> list[PILImage.Image]:
    canvases: list[PILImage.Image] = []
    for slide in storyboard.get("slides", []):
        kind = slide.get("kind")
        if kind == "cover":
            canvases.append(_render_cover_frame(storyboard, slide))
        elif kind == "image":
            canvases.append(_render_image_frame(slide))
        else:
            canvases.append(_render_note_frame(slide))
    canvases.append(_render_closing_frame())
    return canvases


def _iter_video_frames(
    slide_canvases: list[PILImage.Image],
    durations: list[float],
    transition_seconds: float,
    fade_seconds: float,
):
    if not slide_canvases:
        return

    if len(slide_canvases) == 1:
        frame_count = max(1, math.ceil(durations[0] * SHOWCASE_VIDEO_FPS))
        total_duration = durations[0]
        for index in range(frame_count):
            t = index / SHOWCASE_VIDEO_FPS
            yield _fade_background_frame(
                slide_canvases[0],
                _fade_alpha(t=t, total_duration=total_duration, fade_seconds=fade_seconds),
            )
        return

    starts = _slide_start_times(durations, transition_seconds)
    total_duration = starts[-1] + durations[-1]
    frame_count = max(1, math.ceil(total_duration * SHOWCASE_VIDEO_FPS))
    for index in range(frame_count):
        t = index / SHOWCASE_VIDEO_FPS
        slide_index = len(slide_canvases) - 1
        for candidate, start in enumerate(starts):
            if t < start + durations[candidate]:
                slide_index = candidate
                break
        if slide_index < len(slide_canvases) - 1:
            transition_start = starts[slide_index + 1]
            if t >= transition_start:
                alpha = min(1.0, (t - transition_start) / transition_seconds)
                frame = PILImage.blend(
                    slide_canvases[slide_index],
                    slide_canvases[slide_index + 1],
                    alpha,
                )
                yield _fade_background_frame(
                    frame,
                    _fade_alpha(
                        t=t,
                        total_duration=total_duration,
                        fade_seconds=fade_seconds,
                    ),
                )
                continue
        yield _fade_background_frame(
            slide_canvases[slide_index],
            _fade_alpha(t=t, total_duration=total_duration, fade_seconds=fade_seconds),
        )


def _fade_alpha(*, t: float, total_duration: float, fade_seconds: float) -> float:
    if fade_seconds <= 0:
        return 0.0
    fade_start = max(0.0, total_duration - fade_seconds)
    if t < fade_start:
        return 0.0
    return min(1.0, (t - fade_start) / fade_seconds)


def _write_video_stream(
    container: av.container.output.OutputContainer,
    slide_canvases: list[PILImage.Image],
    durations: list[float],
    transition_seconds: float,
    fade_seconds: float,
) -> tuple[list[Any], float]:
    video_stream = container.add_stream("libx264", rate=SHOWCASE_VIDEO_FPS)
    video_stream.width = SHOWCASE_VIDEO_CANVAS_SIZE[0]
    video_stream.height = SHOWCASE_VIDEO_CANVAS_SIZE[1]
    video_stream.pix_fmt = "yuv420p"
    video_stream.time_base = Fraction(1, SHOWCASE_VIDEO_FPS)

    packets: list[Any] = []
    frame_count = 0
    for frame in _iter_video_frames(
        slide_canvases,
        durations,
        transition_seconds,
        fade_seconds,
    ):
        video_frame = av.VideoFrame.from_image(frame)
        video_frame.pts = frame_count
        video_frame.time_base = Fraction(1, SHOWCASE_VIDEO_FPS)
        for packet in video_stream.encode(video_frame):
            packets.append(packet)
        frame_count += 1

    for packet in video_stream.encode():
        packets.append(packet)

    return packets, frame_count / SHOWCASE_VIDEO_FPS


def _write_audio_stream(
    container: av.container.output.OutputContainer,
    audio_path: Path,
    video_duration_seconds: float,
    fade_seconds: float,
) -> list[Any]:
    with av.open(str(audio_path)) as audio_container:
        source_stream = audio_container.streams.audio[0]
        sample_rate = int(source_stream.rate or 44100)
        layout = source_stream.layout.name if source_stream.layout else "stereo"
        audio_stream = container.add_stream("aac", rate=sample_rate)
        audio_stream.layout = layout
        audio_stream.sample_rate = sample_rate
        audio_stream.time_base = Fraction(1, sample_rate)
        audio_stream.codec_context.time_base = Fraction(1, sample_rate)
        resampler = AudioResampler(format="fltp", layout=layout, rate=sample_rate)
        packet_time_base = Fraction(1, sample_rate)
        packets: list[Any] = []

        target_samples = int(round(video_duration_seconds * sample_rate))
        fade_samples = int(round(fade_seconds * sample_rate))
        samples_written = 0

        def _encode_audio_frame(frame: av.AudioFrame) -> None:
            nonlocal samples_written
            arr = frame.to_ndarray()
            if arr.ndim == 1:
                arr = arr[np.newaxis, :]
            frame_samples = arr.shape[-1]
            if samples_written >= target_samples:
                return
            remaining = target_samples - samples_written
            if frame_samples > remaining:
                arr = arr[:, :remaining]
                frame_samples = remaining
            arr = _apply_audio_fade(
                arr,
                samples_written=samples_written,
                target_samples=target_samples,
                fade_samples=fade_samples,
            )
            frame = av.AudioFrame.from_ndarray(arr, format="fltp", layout=layout)
            frame.sample_rate = sample_rate
            frame.pts = samples_written
            frame.time_base = Fraction(1, sample_rate)
            for packet in audio_stream.encode(frame):
                packet.time_base = packet_time_base
                packets.append(packet)
            samples_written += frame_samples

        for packet in audio_container.demux(source_stream):
            for decoded in packet.decode():
                for resampled in resampler.resample(decoded):
                    _encode_audio_frame(resampled)
                    if samples_written >= target_samples:
                        break
                if samples_written >= target_samples:
                    break
            if samples_written >= target_samples:
                break

        for resampled in resampler.resample(None):
            _encode_audio_frame(resampled)
            if samples_written >= target_samples:
                break

        if samples_written < target_samples:
            remaining = target_samples - samples_written
            silence = av.AudioFrame(format="fltp", layout=layout, samples=remaining)
            silence.sample_rate = sample_rate
            silence.pts = samples_written
            silence.time_base = Fraction(1, sample_rate)
            for plane in silence.planes:
                plane.update(b"\x00" * plane.buffer_size)
            for packet in audio_stream.encode(silence):
                packet.time_base = packet_time_base
                packets.append(packet)

        for packet in audio_stream.encode():
            packet.time_base = packet_time_base
            packets.append(packet)

        return packets


def _apply_audio_fade(
    samples: np.ndarray,
    *,
    samples_written: int,
    target_samples: int,
    fade_samples: int,
) -> np.ndarray:
    if fade_samples <= 0 or samples_written >= target_samples:
        return samples

    frame_samples = samples.shape[-1]
    positions = samples_written + np.arange(frame_samples, dtype=np.float32)
    gain = np.clip((target_samples - positions) / max(1, fade_samples), 0.0, 1.0)
    if np.all(gain >= 1.0):
        return samples
    return samples * gain[np.newaxis, :]


def render_storyboard_to_mp4(storyboard: dict) -> Path:
    """Render a storyboard snapshot to a deterministic MP4 file."""
    validate_storyboard(storyboard)
    input_hash = compute_storyboard_hash(storyboard)
    temp_file = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=f".{SHOWCASE_VIDEO_FORMAT}",
        prefix=f"{input_hash}-",
    )
    output_path = Path(temp_file.name)
    temp_file.close()

    slides = list(storyboard.get("slides", []))
    if not slides:
        raise ValueError("Storyboard did not contain any slides to render.")

    durations = [_slide_duration_seconds(slide) for slide in slides]
    durations.append(SHOWCASE_VIDEO_CLOSING_SECONDS)
    transition_seconds = min(
        SHOWCASE_VIDEO_FADE_SECONDS,
        *(duration / 2 for duration in durations),
    )
    fade_seconds = min(SHOWCASE_VIDEO_FADE_SECONDS, durations[-1] / 2)

    slide_canvases = _render_slide_canvases(storyboard)
    video_duration_seconds = 0.0
    with av.open(str(output_path), mode="w", format="mp4") as container:
        video_packets, video_duration_seconds = _write_video_stream(
            container,
            slide_canvases,
            durations,
            transition_seconds,
            fade_seconds,
        )
        audio_path = _resolve_music_audio_path(storyboard)
        audio_packets = _write_audio_stream(
            container,
            audio_path,
            video_duration_seconds,
            fade_seconds,
        )

        # AAC encoders emit a few priming frames with negative DTS before the
        # first real sample, which breaks muxing.  Compute the shift needed to
        # bring the earliest timestamp to zero, then apply it to all packets.
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
            key=lambda packet: (
                _packet_timestamp(packet),
                0 if packet.stream and packet.stream.type == "video" else 1,
            ),
        ):
            container.mux(packet)

    return output_path


def _cloudinary_video_folder() -> str:
    return os.environ.get("CLOUDINARY_VIDEO_UPLOAD_FOLDER", "").strip().strip("/")


def is_showcase_video_cloudinary_enabled() -> bool:
    return all(
        [
            os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip(),
            os.environ.get("CLOUDINARY_API_KEY", "").strip(),
            os.environ.get("CLOUDINARY_API_SECRET", "").strip(),
            _cloudinary_video_folder(),
            os.environ.get("CLOUDINARY_VIDEO_UPLOAD_PRESET", "").strip(),
        ]
    )


def upload_storyboard_video_to_cloudinary(
    video_path: Path,
    *,
    input_hash: str,
) -> dict[str, Any] | None:
    """Upload a rendered video to Cloudinary when credentials are available.

    The upload is optional. If Cloudinary is not configured, or the upload
    fails, callers should keep using the local artifact path.
    """

    if not is_showcase_video_cloudinary_enabled():
        return None
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "").strip()
    api_key = os.environ.get("CLOUDINARY_API_KEY", "").strip()
    api_secret = os.environ.get("CLOUDINARY_API_SECRET", "").strip()

    import cloudinary  # noqa: PLC0415
    import cloudinary.uploader  # noqa: PLC0415

    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret,
        secure=True,
    )

    upload_kwargs: dict[str, Any] = {
        "public_id": input_hash,
        "folder": _cloudinary_video_folder(),
        "overwrite": True,
        "resource_type": "video",
        "format": SHOWCASE_VIDEO_FORMAT,
    }
    upload_kwargs["upload_preset"] = os.environ.get(
        "CLOUDINARY_VIDEO_UPLOAD_PRESET", ""
    ).strip()

    result = cloudinary.uploader.upload(str(video_path), **upload_kwargs)
    return {
        "cloud_name": result.get("cloud_name") or cloud_name,
        "public_id": result.get("public_id") or input_hash,
        "secure_url": result.get("secure_url") or result.get("url"),
        "asset_id": result.get("asset_id"),
        "version": result.get("version"),
        "resource_type": result.get("resource_type") or "video",
    }
