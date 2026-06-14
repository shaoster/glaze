"""Tests for piece-related client methods."""

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


def test_list_pieces_no_filters(client: PotterDocClient) -> None:
    expected = {"count": 1, "results": [{"id": "abc", "name": "Vase"}]}
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(200, {"data": {"pieces": expected}}),
    ) as mock_post:
        result = asyncio.run(client.list_pieces())

    assert result == expected
    call_kwargs = mock_post.call_args
    body = call_kwargs.kwargs["json"]
    assert "pieces(" in body["query"]
    assert body["variables"]["limit"] == 20
    assert body["variables"]["offset"] == 0
    assert "filter" not in body["variables"]


def test_list_pieces_with_search(client: PotterDocClient) -> None:
    expected = {"count": 0, "results": []}
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(200, {"data": {"pieces": expected}}),
    ) as mock_post:
        result = asyncio.run(client.list_pieces(search="bowl", limit=5))

    assert result == expected
    body = mock_post.call_args.kwargs["json"]
    assert body["variables"]["filter"]["search"] == "bowl"
    assert body["variables"]["limit"] == 5


def test_list_pieces_api_error_raises_mcp_error(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(401, {"detail": "unauthorized"}),
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.list_pieces())
    assert "401" in str(exc_info.value)


def test_list_pieces_graphql_error_raises_mcp_error(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(
            200, {"errors": [{"message": "some graphql error"}]}
        ),
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.list_pieces())
    assert "GraphQL" in str(exc_info.value)


def test_get_piece(client: PotterDocClient) -> None:
    piece = {"id": "abc", "name": "Bowl"}
    with patch.object(
        client._http,
        "get",
        new_callable=AsyncMock,
        return_value=_mock_response(200, piece),
    ) as mock_get:
        result = asyncio.run(client.get_piece("abc"))

    assert result == piece
    mock_get.assert_called_once_with("/api/pieces/abc/")


def test_get_piece_not_found(client: PotterDocClient) -> None:
    with patch.object(
        client._http,
        "get",
        new_callable=AsyncMock,
        return_value=_mock_response(404, {"detail": "Not found."}),
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.get_piece("nonexistent"))
    assert "404" in str(exc_info.value)


def test_create_piece(client: PotterDocClient) -> None:
    piece = {"id": "xyz", "name": "Mug", "notes": "handles"}
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=_mock_response(201, piece),
    ) as mock_post:
        result = asyncio.run(client.create_piece(name="Mug", notes="handles"))

    assert result == piece
    body = mock_post.call_args.kwargs["json"]
    assert body["name"] == "Mug"
    assert body["notes"] == "handles"
    mock_post.assert_called_once_with("/api/pieces/", json=body)
