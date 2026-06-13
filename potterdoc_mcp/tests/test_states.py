"""Tests for state transition client method."""

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


def test_transition_piece_no_custom_fields(client: PotterDocClient) -> None:
    state = {"id": "s1", "state_name": "thrown"}
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(201, state),
    ) as mock_post:
        result = asyncio.run(client.transition_piece("abc", "thrown"))

    assert result == state
    body = mock_post.call_args.kwargs["json"]
    assert body == {"state": "thrown"}
    mock_post.assert_called_once_with("/api/pieces/abc/states/", json=body)


def test_transition_piece_with_custom_fields(client: PotterDocClient) -> None:
    state = {"id": "s2", "state_name": "glazed"}
    fields = {"glaze_type": 3, "notes": "celadon"}
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(201, state),
    ) as mock_post:
        result = asyncio.run(
            client.transition_piece("abc", "glazed", custom_fields=fields)
        )

    assert result == state
    body = mock_post.call_args.kwargs["json"]
    assert body == {"state": "glazed", "custom_fields": fields}


def test_transition_piece_invalid_transition(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(400, {"state": ["Invalid transition."]}),
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.transition_piece("abc", "fired"))
    assert "400" in str(exc_info.value)
