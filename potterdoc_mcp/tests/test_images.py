"""Tests for image upload and crop client methods."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from mcp.shared.exceptions import McpError

from potterdoc_mcp.client import PotterDocClient


def _mock_response(status_code: int, json_body: object) -> MagicMock:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status_code
    resp.is_success = 200 <= status_code < 300
    resp.json.return_value = json_body
    resp.text = ""
    resp.reason_phrase = ""
    return resp


def test_upload_piece_image_url(client: PotterDocClient) -> None:
    upload_result = {"piece_state_image": {"id": "img1"}}
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(201, upload_result),
    ) as mock_post:
        result = asyncio.run(
            client.upload_piece_image(
                "abc", url="https://example.com/photo.jpg", caption="front view"
            )
        )

    assert result == upload_result
    body = mock_post.call_args.kwargs["json"]
    assert body == {"caption": "front view", "url": "https://example.com/photo.jpg"}
    mock_post.assert_called_once_with("/api/pieces/abc/state/upload-image/", json=body)


def test_crop_piece_image(client: PotterDocClient) -> None:
    image = {"id": "img1", "crop": {"x": 0.1, "y": 0.0, "width": 0.8, "height": 1.0}}
    with patch.object(
        client._http,
        "patch",
        new_callable=AsyncMock,
        return_value=_mock_response(200, image),
    ) as mock_patch:
        result = asyncio.run(
            client.crop_piece_image("img1", x=0.1, y=0.0, width=0.8, height=1.0)
        )

    assert result == image
    body = mock_patch.call_args.kwargs["json"]
    assert body == {"x": 0.1, "y": 0.0, "width": 0.8, "height": 1.0}
    mock_patch.assert_called_once_with("/api/images/img1/crop/", json=body)


def test_crop_piece_image_error(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "patch",
        new_callable=AsyncMock,
        return_value=_mock_response(404, {"detail": "Not found."}),
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(
                client.crop_piece_image("bad-id", x=0.0, y=0.0, width=1.0, height=1.0)
            )
    assert "404" in str(exc_info.value)
