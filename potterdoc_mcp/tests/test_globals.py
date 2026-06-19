"""Tests for global entry list client method."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from mcp.shared.exceptions import McpError

from potterdoc_mcp.client import PotterDocClient


def test_list_global_entries(client: PotterDocClient) -> None:
    entries = [{"id": 1, "name": "Stoneware"}, {"id": 2, "name": "Porcelain"}]
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"globals": entries},
    ) as mock_gql:
        result = asyncio.run(client.list_global_entries("clay_body"))

    assert result == entries
    query, variables = mock_gql.call_args.args
    assert "globals" in query
    assert variables["globalName"] == "clay_body"


def test_list_global_entries_graphql_error(client: PotterDocClient) -> None:
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
            asyncio.run(client.list_global_entries("nonexistent"))
    assert "GraphQL" in str(exc_info.value)
