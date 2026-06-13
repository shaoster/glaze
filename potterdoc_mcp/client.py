"""HTTP client wrapping the PotterDoc REST/GraphQL API."""

from __future__ import annotations

import os
from typing import Any

import httpx
from mcp.shared.exceptions import McpError
from mcp.types import ErrorData

_DEFAULT_TIMEOUT = 30.0
_GRAPHQL_PIECE_FIELDS = """
  id
  name
  currentState {
    stateName
    stateLabel
  }
  tags {
    name
  }
"""


def _error(message: str) -> McpError:
    return McpError(ErrorData(code=-32603, message=message))


def _raise_for_status(response: httpx.Response) -> None:
    if response.is_success:
        return
    try:
        detail = response.json()
    except Exception:
        detail = response.text or response.reason_phrase
    raise _error(f"PotterDoc API error {response.status_code}: {detail}")


class PotterDocClient:
    """Thin async wrapper around PotterDoc's REST and GraphQL APIs."""

    def __init__(self, base_url: str, token: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers={"Authorization": f"Bearer {token}"},
            timeout=_DEFAULT_TIMEOUT,
        )

    @classmethod
    def from_env(cls) -> "PotterDocClient":
        base_url = os.environ.get("POTTERDOC_API_URL", "http://localhost:8000")
        token = os.environ.get("POTTERDOC_API_TOKEN", "")
        if not token:
            raise _error(
                "POTTERDOC_API_TOKEN environment variable is not set. "
                "Generate a token from Settings → API Tokens in PotterDoc."
            )
        return cls(base_url, token)

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Pieces
    # ------------------------------------------------------------------

    async def list_pieces(
        self,
        search: str | None = None,
        state: list[str] | None = None,
        tag_ids: list[int] | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        """GraphQL-backed piece query (token-efficient)."""
        filter_parts: list[str] = []
        if search:
            filter_parts.append(f'search: "{search}"')
        if state:
            joined = ", ".join(f'"{s}"' for s in state)
            filter_parts.append(f"state: [{joined}]")
        if tag_ids:
            joined = ", ".join(str(t) for t in tag_ids)
            filter_parts.append(f"tagIds: [{joined}]")

        filter_arg = f"filter: {{{', '.join(filter_parts)}}}" if filter_parts else ""
        query = f"""
        query {{
          pieces({filter_arg}, limit: {limit}, offset: {offset}) {{
            count
            results {{{_GRAPHQL_PIECE_FIELDS}}}
          }}
        }}
        """
        r = await self._http.post("/api/graphql/", json={"query": query})
        _raise_for_status(r)
        body = r.json()
        if "errors" in body:
            raise _error(f"GraphQL error: {body['errors']}")
        return body["data"]["pieces"]  # type: ignore[no-any-return]

    async def get_piece(self, piece_id: str) -> dict[str, Any]:
        r = await self._http.get(f"/api/pieces/{piece_id}/")
        _raise_for_status(r)
        return r.json()  # type: ignore[no-any-return]

    async def create_piece(self, name: str, notes: str = "") -> dict[str, Any]:
        r = await self._http.post("/api/pieces/", json={"name": name, "notes": notes})
        _raise_for_status(r)
        return r.json()  # type: ignore[no-any-return]

    async def update_piece_metadata(
        self,
        piece_id: str,
        *,
        name: str | None = None,
        notes: str | None = None,
        shared: bool | None = None,
        tags: list[str] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if name is not None:
            payload["name"] = name
        if notes is not None:
            payload["notes"] = notes
        if shared is not None:
            payload["shared"] = shared
        if tags is not None:
            payload["tags"] = tags
        if not payload:
            raise _error("No fields provided to update_piece_metadata.")
        r = await self._http.patch(f"/api/pieces/{piece_id}/", json=payload)
        _raise_for_status(r)
        return r.json()  # type: ignore[no-any-return]

    # ------------------------------------------------------------------
    # Workflow
    # ------------------------------------------------------------------

    async def get_workflow_schema(self) -> dict[str, Any]:
        r = await self._http.get("/api/workflow/")
        _raise_for_status(r)
        return r.json()  # type: ignore[no-any-return]

    # ------------------------------------------------------------------
    # State transitions
    # ------------------------------------------------------------------

    async def transition_piece(
        self,
        piece_id: str,
        target_state: str,
        custom_fields: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"state": target_state}
        if custom_fields:
            payload["custom_fields"] = custom_fields
        r = await self._http.post(f"/api/pieces/{piece_id}/states/", json=payload)
        _raise_for_status(r)
        return r.json()  # type: ignore[no-any-return]

    # ------------------------------------------------------------------
    # Images
    # ------------------------------------------------------------------

    async def upload_piece_image(
        self,
        piece_id: str,
        url: str | None = None,
        base64: str | None = None,
        caption: str = "",
    ) -> dict[str, Any]:
        if not url and not base64:
            raise _error("Either 'url' or 'base64' must be provided.")
        payload: dict[str, Any] = {"caption": caption}
        if url:
            payload["url"] = url
        else:
            payload["base64"] = base64
        r = await self._http.post(
            f"/api/pieces/{piece_id}/state/upload-image/", json=payload
        )
        _raise_for_status(r)
        return r.json()  # type: ignore[no-any-return]

    async def crop_piece_image(
        self,
        image_id: str,
        x: float,
        y: float,
        width: float,
        height: float,
    ) -> dict[str, Any]:
        crop = {"x": x, "y": y, "width": width, "height": height}
        r = await self._http.patch(f"/api/images/{image_id}/crop/", json={"crop": crop})
        _raise_for_status(r)
        return r.json()  # type: ignore[no-any-return]
