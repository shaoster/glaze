"""Shared fixtures for potterdoc_mcp tests."""

from __future__ import annotations

import pytest

from potterdoc_mcp.client import PotterDocClient


@pytest.fixture()
def client() -> PotterDocClient:
    """Return a PotterDocClient pointed at a fake base URL with a fake token."""
    return PotterDocClient(base_url="http://testserver", token="pdagent_testtoken")
