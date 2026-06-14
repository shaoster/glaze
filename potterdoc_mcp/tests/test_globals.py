"""Tests for global entry list client method."""

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


def test_list_global_entries(client: PotterDocClient) -> None:
    entries = [{"id": 1, "name": "Stoneware"}, {"id": 2, "name": "Porcelain"}]
    with patch.object(
        client._http,
        "get",
        new_callable=AsyncMock,
        return_value=_mock_response(200, entries),
    ) as mock_get:
        result = asyncio.run(client.list_global_entries("clay_body"))

    assert result == entries
    mock_get.assert_called_once_with("/api/globals/clay_body/")


def test_list_global_entries_not_found(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "get",
        new_callable=AsyncMock,
        return_value=_mock_response(404, {"detail": "Not found."}),
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.list_global_entries("nonexistent"))
    assert "404" in str(exc_info.value)
