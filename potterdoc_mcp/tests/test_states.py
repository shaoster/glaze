"""Tests for state transition client method."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from mcp.shared.exceptions import McpError

from potterdoc_mcp.client import PotterDocClient


def test_transition_piece_no_custom_fields(client: PotterDocClient) -> None:
    state = {"id": "abc", "currentState": {"state": "thrown"}}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"transitionPiece": state},
    ) as mock_gql:
        result = asyncio.run(client.transition_piece("abc", "thrown"))

    assert result == state
    _, variables = mock_gql.call_args.args
    assert variables["id"] == "abc"
    assert variables["input"]["targetState"] == "thrown"
    assert "customFields" not in variables["input"]


def test_transition_piece_with_custom_fields(client: PotterDocClient) -> None:
    state = {"id": "abc", "currentState": {"state": "glazed"}}
    fields = {"glaze_type": 3, "notes": "celadon"}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"transitionPiece": state},
    ) as mock_gql:
        result = asyncio.run(
            client.transition_piece("abc", "glazed", custom_fields=fields)
        )

    assert result == state
    _, variables = mock_gql.call_args.args
    assert variables["input"]["customFields"] == fields


def test_transition_piece_invalid_transition(client: PotterDocClient) -> None:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 200
    resp.is_success = True
    resp.json.return_value = {"errors": [{"message": "Invalid transition."}]}
    resp.text = ""
    resp.reason_phrase = ""
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=resp,
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.transition_piece("abc", "fired"))
    assert "GraphQL" in str(exc_info.value)
