"""Tests for workflow schema client method."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from mcp.shared.exceptions import McpError

from potterdoc_mcp.client import PotterDocClient


def test_get_workflow_schema(client: PotterDocClient) -> None:
    schema = {
        "version": "0.0.3",
        "entry_state": "designed",
        "states": [{"id": "designed", "label": "Designed"}],
        "successors": {"designed": ["thrown"]},
    }
    with patch.object(
        client,
        "_graphql",
        new_callable=AsyncMock,
        return_value={"workflowSchema": schema},
    ) as mock_gql:
        result = asyncio.run(client.get_workflow_schema())

    assert result == schema
    query, *_ = mock_gql.call_args.args
    assert "workflowSchema" in query


def test_get_workflow_schema_error(client: PotterDocClient) -> None:
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = 200
    resp.is_success = True
    resp.json.return_value = {"errors": [{"message": "Authentication required."}]}
    resp.text = ""
    resp.reason_phrase = ""
    with patch.object(
        client._http,
        "post",
        new_callable=AsyncMock,
        return_value=resp,
    ):
        with pytest.raises(McpError) as exc_info:
            asyncio.run(client.get_workflow_schema())
    assert "GraphQL" in str(exc_info.value)
