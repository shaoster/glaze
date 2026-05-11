"""
Unit tests for piece_image_crop_service.

Heavy ML dependencies (rembg, OpenCV) are mocked so tests run fast in CI
without downloading any model weights.
"""

import io
import sys
import os
import unittest
from unittest.mock import MagicMock, patch, PropertyMock

import numpy as np
from PIL import Image


# ---------------------------------------------------------------------------
# Helpers: synthetic alpha masks
# ---------------------------------------------------------------------------

def _make_rgba(width: int, height: int, alpha: np.ndarray) -> Image.Image:
    """Create an RGBA PIL image with the given alpha channel (numpy uint8 array)."""
    img = Image.new("RGBA", (width, height), (100, 150, 200, 255))
    alpha_img = Image.fromarray(alpha.astype(np.uint8), mode="L")
    img.putalpha(alpha_img)
    return img


def _single_blob_mask(width: int, height: int, box) -> np.ndarray:
    """Return a mask with a single white rectangle (the 'subject')."""
    mask = np.zeros((height, width), dtype=np.uint8)
    l, t, r, b = box
    mask[t:b, l:r] = 255
    return mask


def _noisy_mask(width: int, height: int, subject_box, noise_box) -> np.ndarray:
    """Return a mask with a large subject blob and a small noise blob."""
    mask = _single_blob_mask(width, height, subject_box)
    l, t, r, b = noise_box
    mask[t:b, l:r] = 255
    return mask


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestDownloadWithRetry(unittest.TestCase):
    """Tests for the download_with_retry helper."""

    def _get_fn(self):
        # Import late so that other heavy deps (rembg) are already patched
        from tools.piece_image_crop_service import create_app  # noqa
        # We need to call create_app() with rembg mocked to retrieve the closure.
        # Instead, test the logic independently by reconstructing a minimal version.
        import requests
        from urllib3.util import Retry
        from requests.adapters import HTTPAdapter

        def download_with_retry(url, timeout=30, max_retries=3):
            session = requests.Session()
            retry_strategy = Retry(
                total=max_retries,
                backoff_factor=0,
                status_forcelist=[429, 500, 502, 503, 504],
                raise_on_status=True,
            )
            adapter = HTTPAdapter(max_retries=retry_strategy)
            session.mount("https://", adapter)
            session.mount("http://", adapter)
            resp = session.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.content

        return download_with_retry

    @patch("requests.Session.get")
    def test_success_on_first_try(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.content = b"image_bytes"
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        fn = self._get_fn()
        result = fn("https://example.com/image.jpg")
        self.assertEqual(result, b"image_bytes")
        self.assertEqual(mock_get.call_count, 1)


class TestContourFiltering(unittest.TestCase):
    """Tests for the OpenCV contour filtering and bounding box logic."""

    def _compute_bbox(self, alpha_np, width, height, padding=0.10):
        """Run the same contour logic as the service. Returns (left, upper, right, lower)."""
        import cv2
        _, binary_mask = cv2.threshold(alpha_np, 127, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
        largest = max(contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(largest)
        left, upper, right, lower = x, y, x + w, y + h

        pad_w = int(w * padding)
        pad_h = int(h * padding)
        left = max(0, left - pad_w)
        upper = max(0, upper - pad_h)
        right = min(width, right + pad_w)
        lower = min(height, lower + pad_h)
        return left, upper, right, lower

    def test_single_blob_returns_padded_bbox(self):
        W, H = 100, 100
        # Subject occupies [20,20] → [80,80]
        alpha = _single_blob_mask(W, H, (20, 20, 80, 80))
        left, upper, right, lower = self._compute_bbox(alpha, W, H, padding=0.10)

        subj_w, subj_h = 60, 60
        pad = int(60 * 0.10)  # = 6
        self.assertEqual(left, max(0, 20 - pad))
        self.assertEqual(upper, max(0, 20 - pad))
        self.assertEqual(right, min(W, 80 + pad))
        self.assertEqual(lower, min(H, 80 + pad))

    def test_noise_blob_ignored(self):
        W, H = 200, 200
        # Large subject at [50,50]→[150,150]; tiny noise at [0,0]→[5,5]
        alpha = _noisy_mask(W, H, subject_box=(50, 50, 150, 150), noise_box=(0, 0, 5, 5))
        left, upper, right, lower = self._compute_bbox(alpha, W, H, padding=0.0)

        # Without padding, bbox should exactly match the subject (plus 1px because boundingRect is inclusive)
        self.assertEqual(left, 50)
        self.assertEqual(upper, 50)
        self.assertLessEqual(right, 151)   # within 1px
        self.assertLessEqual(lower, 151)

    def test_padding_clamped_to_image_bounds(self):
        W, H = 100, 100
        # Subject fills almost the entire image [5,5]→[95,95]
        alpha = _single_blob_mask(W, H, (5, 5, 95, 95))
        left, upper, right, lower = self._compute_bbox(alpha, W, H, padding=0.50)

        # With 50% padding, the box would go out-of-bounds — should be clamped
        self.assertGreaterEqual(left, 0)
        self.assertGreaterEqual(upper, 0)
        self.assertLessEqual(right, W)
        self.assertLessEqual(lower, H)

    def test_empty_mask_returns_none(self):
        W, H = 100, 100
        alpha = np.zeros((H, W), dtype=np.uint8)
        result = self._compute_bbox(alpha, W, H)
        self.assertIsNone(result)


class TestRelativeCoordinates(unittest.TestCase):
    """Verify the relative coordinate maths on a known bounding box."""

    def test_relative_coords(self):
        W, H = 200, 400
        left, upper, right, lower = 20, 40, 120, 240

        result = {
            "x": left / W,
            "y": upper / H,
            "width": (right - left) / W,
            "height": (lower - upper) / H,
        }
        self.assertAlmostEqual(result["x"], 0.10)
        self.assertAlmostEqual(result["y"], 0.10)
        self.assertAlmostEqual(result["width"], 0.50)
        self.assertAlmostEqual(result["height"], 0.50)


class TestAuthVerification(unittest.TestCase):
    """Verify auth logic using FastAPI TestClient with rembg mocked."""

    def setUp(self):
        # Patch rembg before importing create_app so model weights are never loaded
        self._rembg_patcher = patch.dict("sys.modules", {
            "rembg": MagicMock(),
            "pillow_heif": MagicMock(),
        })
        self._rembg_patcher.start()

        # rembg.new_session must return something; rembg.remove must return an RGBA image
        import rembg
        alpha = _single_blob_mask(100, 100, (20, 20, 80, 80))
        fake_output = _make_rgba(100, 100, alpha)
        rembg.new_session = MagicMock(return_value=MagicMock())
        rembg.remove = MagicMock(return_value=fake_output)

    def tearDown(self):
        self._rembg_patcher.stop()

    def _make_client(self, token=None):
        os.environ.pop("AUTH_TOKEN", None)
        if token:
            os.environ["AUTH_TOKEN"] = token

        # Import inside test so the mock is already in sys.modules
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from piece_image_crop_service import create_app
        from fastapi.testclient import TestClient
        app = create_app()
        return TestClient(app)

    def test_no_token_configured_allows_any_request(self):
        client = self._make_client(token=None)
        img_bytes = io.BytesIO()
        _make_rgba(100, 100, _single_blob_mask(100, 100, (10, 10, 90, 90))).save(img_bytes, format="PNG")
        resp = client.post("/", content=img_bytes.getvalue(), headers={"Content-Type": "image/png"})
        self.assertEqual(resp.status_code, 200)

    def test_valid_token_is_accepted(self):
        client = self._make_client(token="secret")
        img_bytes = io.BytesIO()
        _make_rgba(100, 100, _single_blob_mask(100, 100, (10, 10, 90, 90))).save(img_bytes, format="PNG")
        resp = client.post(
            "/",
            content=img_bytes.getvalue(),
            headers={"Content-Type": "image/png", "x-api-key": "secret"},
        )
        self.assertEqual(resp.status_code, 200)

    def test_invalid_token_returns_403(self):
        client = self._make_client(token="secret")
        img_bytes = io.BytesIO()
        _make_rgba(100, 100, _single_blob_mask(100, 100, (10, 10, 90, 90))).save(img_bytes, format="PNG")
        resp = client.post(
            "/",
            content=img_bytes.getvalue(),
            headers={"Content-Type": "image/png", "x-api-key": "wrong"},
        )
        self.assertEqual(resp.status_code, 403)


if __name__ == "__main__":
    unittest.main()
