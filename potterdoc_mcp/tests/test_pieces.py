"""Tests for piece-related client methods."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from mcp.shared.exceptions import McpError

from potterdoc_mcp.client import PotterDocClient


def test_list_pieces_no_filters(client: PotterDocClient) -> None:
    expected = {"count": 1, "results": [{"id": "abc", "name": "Vase"}]}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"pieces": expected},
    ) as mock_gql:
        result = asyncio.run(client.list_pieces())

    assert result == expected
    call_args = mock_gql.call_args
    query, variables = call_args.args
    assert "pieces(" in query
    assert variables["limit"] == 20
    assert variables["offset"] == 0
    assert "filter" not in variables


def test_list_pieces_with_search(client: PotterDocClient) -> None:
    expected = {"count": 0, "results": []}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"pieces": expected},
    ) as mock_gql:
        result = asyncio.run(client.list_pieces(search="bowl", limit=5))

    assert result == expected
    _, variables = mock_gql.call_args.args
    assert variables["filter"]["search"] == "bowl"
    assert variables["limit"] == 5


def test_list_pieces_graphql_error_raises_mcp_error(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
    ) as mock_post:
        from unittest.mock import MagicMock

        import httpx

        resp = MagicMock(spec=httpx.Response)
        resp.status_code = 401
        resp.is_success = False
        resp.json.return_value = {"detail": "unauthorized"}
        resp.text = ""
        resp.reason_phrase = ""
        mock_post.return_value = resp
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.list_pieces())
    assert "401" in str(exc_info.value)


def test_list_pieces_gql_error_in_body_raises_mcp_error(
    client: PotterDocClient,
) -> None:
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
    ) as mock_post:
        from unittest.mock import MagicMock

        import httpx

        resp = MagicMock(spec=httpx.Response)
        resp.status_code = 200
        resp.is_success = True
        resp.json.return_value = {"errors": [{"message": "some graphql error"}]}
        resp.text = ""
        resp.reason_phrase = ""
        mock_post.return_value = resp
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.list_pieces())
    assert "GraphQL" in str(exc_info.value)


def test_get_piece(client: PotterDocClient) -> None:
    piece = {"id": "abc", "name": "Bowl", "states": []}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"piece": piece},
    ):
        result = asyncio.run(client.get_piece("abc"))

    assert result == piece


def test_get_piece_not_found(client: PotterDocClient) -> None:
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"piece": None},
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.get_piece("nonexistent"))
    assert "not found" in str(exc_info.value).lower()


def test_create_piece(client: PotterDocClient) -> None:
    piece = {"id": "xyz", "name": "Mug", "currentState": {"state": "designed"}}
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"createPiece": piece},
    ) as mock_gql:
        result = asyncio.run(client.create_piece(name="Mug", notes="handles"))

    assert result == piece
    _, variables = mock_gql.call_args.args
    assert variables["input"]["name"] == "Mug"
    assert variables["input"]["notes"] == "handles"
