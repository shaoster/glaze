"""Tests for image upload and crop client methods."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from mcp.shared.exceptions import McpError

from potterdoc_mcp.client import PotterDocClient


def test_upload_piece_image_url(client: PotterDocClient) -> None:
    upload_result = {
        "id": "abc",
        "currentState": {"state": "designed"},
        "states": [{"images": [{"image_id": "img1"}]}],
    }
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"uploadImage": upload_result},
    ) as mock_gql:
        result = asyncio.run(
            client.upload_piece_image(
                "abc", url="https://example.com/photo.jpg", caption="front view"
            )
        )

    assert result == upload_result
    query, variables = mock_gql.call_args.args
    assert "uploadImage" in query
    assert "states" in query
    assert variables["pieceId"] == "abc"
    assert variables["input"]["url"] == "https://example.com/photo.jpg"
    assert variables["input"]["caption"] == "front view"


def test_crop_piece_image(client: PotterDocClient) -> None:
    piece = {"id": "abc", "thumbnail": {"url": "u", "croppedUrl": "cu"}}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"cropImage": piece},
    ) as mock_gql:
        result = asyncio.run(
            client.crop_piece_image("img1", x=0.1, y=0.0, width=0.8, height=1.0)
        )

    assert result == piece
    _, variables = mock_gql.call_args.args
    assert variables["imageId"] == "img1"
    assert variables["crop"] == {"x": 0.1, "y": 0.0, "width": 0.8, "height": 1.0}


def test_crop_piece_image_error(client: PotterDocClient) -> None:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 200
    resp.is_success = True
    resp.json.return_value = {"errors": [{"message": "Not found."}]}
    resp.text = ""
    resp.reason_phrase = ""
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=resp,
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(
                client.crop_piece_image("bad-id", x=0.0, y=0.0, width=1.0, height=1.0)
            )
    assert "GraphQL" in str(exc_info.value)
