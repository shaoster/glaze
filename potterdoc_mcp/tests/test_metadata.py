"""Tests for update_piece_metadata client method."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from mcp.shared.exceptions import McpError

from potterdoc_mcp.client import PotterDocClient


def test_update_name(client: PotterDocClient) -> None:
    piece = {"id": "abc", "name": "New Name", "shared": False}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"updatePiece": piece},
    ) as mock_gql:
        result = asyncio.run(client.update_piece_metadata("abc", name="New Name"))

    assert result == piece
    _, variables = mock_gql.call_args.args
    assert variables["input"] == {"name": "New Name"}
    assert variables["id"] == "abc"


def test_update_tags_and_shared(client: PotterDocClient) -> None:
    piece = {"id": "abc", "shared": True, "name": "abc"}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"updatePiece": piece},
    ) as mock_gql:
        result = asyncio.run(
            client.update_piece_metadata("abc", shared=True, tags=[42])
        )

    assert result == piece
    _, variables = mock_gql.call_args.args
    assert variables["input"] == {"shared": True, "tags": [42]}


def test_update_tags_coerced_to_int(client: PotterDocClient) -> None:
    """Tags passed as strings must be coerced to int before sending to GraphQL."""
    piece = {"id": "abc", "name": "abc", "shared": False}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"updatePiece": piece},
    ) as mock_gql:
        asyncio.run(client.update_piece_metadata("abc", tags=[7, 13]))

    _, variables = mock_gql.call_args.args
    assert variables["input"]["tags"] == [7, 13]
    assert all(isinstance(t, int) for t in variables["input"]["tags"])


def test_update_no_fields_raises(client: PotterDocClient) -> None:
    with pytest.raises(McpError, match="No fields"):
        asyncio.run(client.update_piece_metadata("abc"))
