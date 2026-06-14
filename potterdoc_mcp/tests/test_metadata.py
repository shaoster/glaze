"""Tests for update_piece_metadata client method."""

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


def test_update_name(client: PotterDocClient) -> None:
    piece = {"id": "abc", "name": "New Name"}
    with patch.object(
        client._http,
        "patch",
        new_callable=AsyncMock,
        return_value=_mock_response(200, piece),
    ) as mock_patch:
        result = asyncio.run(client.update_piece_metadata("abc", name="New Name"))

    assert result == piece
    body = mock_patch.call_args.kwargs["json"]
    assert body == {"name": "New Name"}
    mock_patch.assert_called_once_with("/api/pieces/abc/", json=body)


def test_update_tags_and_shared(client: PotterDocClient) -> None:
    piece = {"id": "abc", "shared": True, "tags": [{"name": "bowl"}]}
    with patch.object(
        client._http,
        "patch",
        new_callable=AsyncMock,
        return_value=_mock_response(200, piece),
    ) as mock_patch:
        result = asyncio.run(
            client.update_piece_metadata("abc", shared=True, tags=["bowl"])
        )

    assert result == piece
    body = mock_patch.call_args.kwargs["json"]
    assert body == {"shared": True, "tags": ["bowl"]}


def test_update_no_fields_raises(client: PotterDocClient) -> None:
    with pytest.raises(McpError, match="No fields"):
        asyncio.run(client.update_piece_metadata("abc"))
