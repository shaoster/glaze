"""Regression tests for Cloudinary URL parsing and image field storage.

The data migrations that used these helpers (0025–0027) have been squashed
into a single initial migration.  The URL-parsing logic is preserved here so
the extraction rules are not silently broken in future.
"""

import re
from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from django.test import TestCase

from api.models import GlazeCombination, GlazeType, Piece, PieceState

CLOUDINARY_URL = (
    'https://res.cloudinary.com/demo-cloud/image/upload'
    '/v1776304349/glaze-public/tile.heic'
)
EXPECTED_CLOUD_NAME = 'demo-cloud'
EXPECTED_PUBLIC_ID = 'glaze-public/tile'


# ---------------------------------------------------------------------------
# URL-parsing helpers (originally from migrations 0025–0027)
# ---------------------------------------------------------------------------

_CLOUDINARY_HOSTNAME = 'res.cloudinary.com'
_TRANSFORM_RE = re.compile(r'^[a-z]{1,4}_')
_VERSION_RE = re.compile(r'^v\d+$')


def _parse_cloudinary_public_id(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if parsed.hostname != _CLOUDINARY_HOSTNAME:
        return None
    parts = parsed.path.split('/')
    if len(parts) < 5 or parts[2] != 'image' or parts[3] != 'upload':
        return None
    after_upload = parts[4:]
    i = 0
    while i < len(after_upload) - 1 and (
        _TRANSFORM_RE.match(after_upload[i]) or _VERSION_RE.match(after_upload[i])
    ):
        i += 1
    public_id_parts = after_upload[i:]
    if not public_id_parts:
        return None
    public_id_parts[-1] = re.sub(r'\.[^.]+$', '', public_id_parts[-1])
    result = '/'.join(public_id_parts)
    return result or None


def _parse_cloud_name(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if parsed.hostname != _CLOUDINARY_HOSTNAME:
        return None
    parts = parsed.path.split('/')
    if len(parts) < 4 or parts[2] != 'image' or parts[3] != 'upload':
        return None
    return parts[1] or None


# ---------------------------------------------------------------------------
# URL parsing tests
# ---------------------------------------------------------------------------

class TestParseCloudinaryPublicId:
    def test_extracts_public_id_without_version(self):
        url = 'https://res.cloudinary.com/demo/image/upload/glaze_prod/tile.jpg'
        assert _parse_cloudinary_public_id(url) == 'glaze_prod/tile'

    def test_strips_version_segment(self):
        url = 'https://res.cloudinary.com/demo/image/upload/v1776802576/glaze_prod/img.jpg'
        assert _parse_cloudinary_public_id(url) == 'glaze_prod/img'

    def test_skips_transform_segments(self):
        url = 'https://res.cloudinary.com/demo/image/upload/f_auto/v123/folder/img.png'
        assert _parse_cloudinary_public_id(url) == 'folder/img'

    def test_heic_extension_stripped(self):
        url = 'https://res.cloudinary.com/demo/image/upload/v1/glaze_prod/photo.heic'
        assert _parse_cloudinary_public_id(url) == 'glaze_prod/photo'

    def test_non_cloudinary_url_returns_none(self):
        assert _parse_cloudinary_public_id('https://example.com/tile.jpg') is None

    def test_empty_string_returns_none(self):
        assert _parse_cloudinary_public_id('') is None

    def test_svg_thumbnail_returns_none(self):
        assert _parse_cloudinary_public_id('/thumbnails/mug.svg') is None

    def test_folder_segment_not_mistaken_for_transform(self):
        url = 'https://res.cloudinary.com/demo/image/upload/glaze_prod/abc.jpg'
        assert _parse_cloudinary_public_id(url) == 'glaze_prod/abc'


class TestParseCloudName:
    def test_extracts_cloud_name(self):
        url = 'https://res.cloudinary.com/mycloud/image/upload/v1/folder/img.jpg'
        assert _parse_cloud_name(url) == 'mycloud'

    def test_returns_none_for_non_cloudinary(self):
        assert _parse_cloud_name('https://example.com/img.jpg') is None

    def test_returns_none_for_empty_string(self):
        assert _parse_cloud_name('') is None


# ---------------------------------------------------------------------------
# Image field storage round-trip tests
# ---------------------------------------------------------------------------

class TestImageFieldStorageRoundTrip(TestCase):
    """Verify the model correctly stores and retrieves image dict values."""

    def test_dict_value_round_trips_through_orm(self):
        image = {
            'url': CLOUDINARY_URL,
            'cloudinary_public_id': EXPECTED_PUBLIC_ID,
            'cloud_name': EXPECTED_CLOUD_NAME,
        }
        gt = GlazeType.objects.create(user=None, name='Shino', test_tile_image=image)
        gt.refresh_from_db()
        assert gt.test_tile_image == image

    def test_none_value_stored_as_null(self):
        gt = GlazeType.objects.create(user=None, name='Tenmoku', test_tile_image=None)
        gt.refresh_from_db()
        assert gt.test_tile_image is None

    def test_dict_missing_public_id_is_valid(self):
        image = {'url': 'https://example.com/tile.jpg', 'cloudinary_public_id': None}
        gt = GlazeType.objects.create(user=None, name='Ash', test_tile_image=image)
        gt.refresh_from_db()
        assert gt.test_tile_image == image

    def test_glaze_combination_stores_dict_image(self):
        image = {
            'url': CLOUDINARY_URL,
            'cloudinary_public_id': EXPECTED_PUBLIC_ID,
            'cloud_name': EXPECTED_CLOUD_NAME,
        }
        combo = GlazeCombination.objects.create(
            user=None,
            name='Celadon!Shino',
            test_tile_image=image,
        )
        combo.refresh_from_db()
        assert combo.test_tile_image == image

    def test_all_image_fields_accessible_after_roundtrip(self):
        image = {
            'url': CLOUDINARY_URL,
            'cloudinary_public_id': EXPECTED_PUBLIC_ID,
            'cloud_name': EXPECTED_CLOUD_NAME,
        }
        gt = GlazeType.objects.create(user=None, name='Chun Li', test_tile_image=image)
        gt.refresh_from_db()
        assert gt.test_tile_image['cloudinary_public_id'] == EXPECTED_PUBLIC_ID
        assert gt.test_tile_image['cloud_name'] == EXPECTED_CLOUD_NAME
