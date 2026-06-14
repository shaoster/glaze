"""FastMCP server definition and tool registration."""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from typing import Any

from mcp.server.fastmcp import FastMCP

from potterdoc_mcp.client import PotterDocClient

# Module-level client; initialized during lifespan.
_client: PotterDocClient | None = None


def _get_client() -> PotterDocClient:
    if _client is None:
        raise RuntimeError("PotterDocClient not initialized. Is the server running?")
    return _client


@contextlib.asynccontextmanager
async def _lifespan(server: FastMCP) -> AsyncIterator[None]:  # noqa: ARG001
    global _client  # noqa: PLW0603
    _client = PotterDocClient.from_env()
    try:
        yield
    finally:
        await _client.aclose()
        _client = None


mcp = FastMCP(
    "potterdoc",
    instructions=(
        "PotterDoc pottery catalog. Use list_pieces to search and filter pieces, "
        "get_piece_details for full detail, get_workflow_schema to discover available "
        "states and required fields, and transition_piece to advance a piece through "
        "the firing workflow."
    ),
    lifespan=_lifespan,
)


# ------------------------------------------------------------------
# Piece tools
# ------------------------------------------------------------------


@mcp.tool()
async def list_pieces(
    search: str | None = None,
    state: list[str] | None = None,
    tag_ids: list[int] | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    """Search and filter the user's pottery pieces.

    Args:
        search: Case-insensitive substring match on piece name.
        state: Filter to pieces in any of these workflow states (e.g. ["designed", "thrown"]).
        tag_ids: Filter to pieces that have all of these tag IDs.
        limit: Maximum number of results (1-100, default 20).
        offset: Pagination offset (default 0).

    Returns a dict with ``count`` (total matches) and ``results`` (list of pieces
    with id, name, currentState, and tags).
    """
    return await _get_client().list_pieces(
        search=search,
        state=state,
        tag_ids=tag_ids,
        limit=limit,
        offset=offset,
    )


@mcp.tool()
async def get_piece_details(piece_id: str) -> dict[str, Any]:
    """Retrieve full details of a specific pottery piece.

    Returns the piece's properties, current workflow state, all custom fields,
    and the complete state history (append-only).

    Args:
        piece_id: The piece UUID.
    """
    return await _get_client().get_piece(piece_id)


@mcp.tool()
async def create_piece(name: str, notes: str = "") -> dict[str, Any]:
    """Initialize a new pottery piece.

    The backend automatically places the new piece in the 'designed' entry state.

    Args:
        name: Human-readable name for the piece (e.g. "Blue celadon vase").
        notes: Optional free-text notes.

    Returns the newly created piece detail.
    """
    return await _get_client().create_piece(name=name, notes=notes)


# ------------------------------------------------------------------
# Workflow tool
# ------------------------------------------------------------------


@mcp.tool()
async def get_workflow_schema() -> dict[str, Any]:
    """Fetch the dynamic workflow schema.

    Returns the complete workflow definition: all states, allowed transitions
    (successors), required and optional custom fields per state, and the names
    of available global library types (clay bodies, glaze types, locations, etc.).

    Call this before transition_piece to discover what fields are required for
    the target state. Then call list_global_entries with the relevant global name
    to get the actual IDs to supply in custom_fields.
    """
    return await _get_client().get_workflow_schema()


@mcp.tool()
async def list_global_entries(global_name: str) -> list[dict]:
    """List all entries for a global library type (clay bodies, glaze types, etc.).

    Use this to discover the numeric IDs needed when filling custom_fields for a
    state transition. Call get_workflow_schema first to see which globals exist and
    what field names they use.

    Args:
        global_name: The global type key from the workflow schema (e.g. "clay_body",
            "glaze_type", "location").

    Returns a list of global entry objects, each with at least ``id`` and a
    display name field.
    """
    return await _get_client().list_global_entries(global_name)


# ------------------------------------------------------------------
# State transition tool
# ------------------------------------------------------------------


@mcp.tool()
async def transition_piece(
    piece_id: str,
    target_state: str,
    custom_fields: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Transition a pottery piece to a new workflow state.

    Call get_workflow_schema first to discover valid successor states and their
    required custom_fields.

    Args:
        piece_id: The piece UUID.
        target_state: The workflow state ID to transition to (e.g. "wheel_thrown", "bisque_fired").
        custom_fields: Dict of field name → value for any fields required by the
            target state schema. Pass null/omit if the state has no required fields.

    Returns the newly created PieceState record.
    """
    return await _get_client().transition_piece(
        piece_id=piece_id,
        target_state=target_state,
        custom_fields=custom_fields,
    )


# ------------------------------------------------------------------
# Metadata tool
# ------------------------------------------------------------------


@mcp.tool()
async def update_piece_metadata(
    piece_id: str,
    name: str | None = None,
    shared: bool | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    """Update piece metadata — name, sharing flag, or tags.

    Supply only the fields you want to change; omitted fields are left unchanged.
    Note: public library entities (clay bodies, glaze types owned by the library)
    cannot be edited via this endpoint — that restriction is enforced by the server.

    Args:
        piece_id: The piece UUID.
        name: New display name.
        shared: Whether the piece's terminal state is publicly viewable.
        tags: Full replacement list of tag IDs (integers). Call get_workflow_schema
            to discover available tags and their IDs.

    Returns the updated piece summary.
    """
    return await _get_client().update_piece_metadata(
        piece_id=piece_id,
        name=name,
        shared=shared,
        tags=tags,
    )


# ------------------------------------------------------------------
# Image tools
# ------------------------------------------------------------------


@mcp.tool()
async def upload_piece_image(
    piece_id: str,
    url: str,
    caption: str = "",
) -> dict[str, Any]:
    """Attach an image to a piece's current workflow state.

    The server fetches the image from the provided URL and handles storage and
    async JPEG conversion.

    Args:
        piece_id: The piece UUID.
        url: Public HTTPS URL of the image (max 10 MB).
        caption: Optional caption for the image.

    Returns the created PieceStateImage object and background task IDs for
    async JPEG conversion.
    """
    return await _get_client().upload_piece_image(
        piece_id=piece_id,
        url=url,
        caption=caption,
    )


@mcp.tool()
async def crop_piece_image(
    image_id: str,
    x: float,
    y: float,
    width: float,
    height: float,
) -> dict[str, Any]:
    """Update the crop bounds of a piece's image.

    Coordinates are fractions of the original image dimensions (0.0 – 1.0).

    Args:
        image_id: The image UUID.
        x: Left edge as a fraction of image width (0.0 = left edge).
        y: Top edge as a fraction of image height (0.0 = top edge).
        width: Crop width as a fraction of image width.
        height: Crop height as a fraction of image height.

    Returns the updated image object.
    """
    return await _get_client().crop_piece_image(
        image_id=image_id,
        x=x,
        y=y,
        width=width,
        height=height,
    )
