"""Tests for workflow schema client method."""

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


def test_get_workflow_schema(client: PotterDocClient) -> None:
    schema = {
        "version": "0.0.3",
        "entry_state": "designed",
        "states": [{"id": "designed", "label": "Designed"}],
        "successors": {"designed": ["thrown"]},
    }
    with patch.object(
        client._http,
        "get",
        new_callable=AsyncMock,
        return_value=_mock_response(200, schema),
    ) as mock_get:
        result = asyncio.run(client.get_workflow_schema())

    assert result == schema
    mock_get.assert_called_once_with("/api/workflow/")


def test_get_workflow_schema_error(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "get",
        new_callable=AsyncMock,
        return_value=_mock_response(500, {}),
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.get_workflow_schema())
    assert "500" in str(exc_info.value)
