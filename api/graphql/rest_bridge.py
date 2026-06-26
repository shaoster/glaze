"""Registry-driven REST→GraphQL bridge.

Each REST view is declared as a RestRoute. make_rest_view() generates a DRF
view from it by calling schema.execute_sync() and mapping GraphQL errors back
to HTTP status codes via the http_status extension set in _map_error.
"""

from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field as dataclass_field
from typing import Any, Callable

from django.http import HttpRequest
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

import re

from api.graphql.schema import schema

_CAMEL_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _to_snake(name: str) -> str:
    """Convert a camelCase identifier to snake_case."""
    return _CAMEL_RE.sub("_", name).lower()


def _snake_keys(value: Any) -> Any:
    """Recursively convert all dict keys from camelCase to snake_case."""
    if isinstance(value, dict):
        return {_to_snake(k): _snake_keys(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_snake_keys(item) for item in value]
    return value


class _Context:
    """Minimal context object for schema.execute_sync calls from the REST bridge.

    Strawberry resolvers access ``info.context.request``; passing a plain dict
    results in an AttributeError. This thin wrapper exposes the request as an
    attribute so resolvers work identically to the real GraphQL view.
    """

    def __init__(self, request) -> None:
        self.request = request


@dataclass
class RestRoute:
    method: str  # HTTP verb: "GET", "POST", "PATCH", "DELETE"
    graphql_op: str  # Full GraphQL query or mutation string
    data_key: str  # Top-level key in result.data to return as response body
    extract_vars: Callable[[Any, dict], dict]  # (request, url_kwargs) -> variables dict
    success_status: int = 200  # HTTP status on success (use 201 for creates)
    # Optional top-level key renames applied after snake_case conversion.
    # e.g. {"states": "history"} renames the "states" key to "history" in the body.
    key_renames: dict = dataclass_field(default_factory=dict)
    # Optional post-processing callable applied to the response body after all
    # conversions. Signature: (body: Any) -> Any.
    post_process: Callable[[Any], Any] | None = None
    # Optional extra HTTP headers to set on the response.
    response_headers: dict = dataclass_field(default_factory=dict)
    # When set, pop this key from the body dict and use its value as the HTTP status.
    # Lets resolvers inject variable status codes (e.g. 200 vs 201 for create-or-get).
    success_status_key: str | None = None
    # Optional kwargs forwarded to @extend_schema for OpenAPI documentation.
    extend_schema_kwargs: dict = dataclass_field(default_factory=dict)
    # When set, unauthenticated requests return this status immediately (before
    # GraphQL execution). Use 401 for views that previously used IsAuthenticated
    # (which DRF maps to 401 via WWW-Authenticate), 403 for views that used AllowAny
    # with manual auth checking. None defers to the mutation's _require_auth (default 403).
    unauthenticated_status: int | None = None


def _execute_route(route: RestRoute, request: Any, kwargs: dict) -> Response:
    """Execute a single RestRoute and return a DRF Response."""
    # If a Bearer token was presented but DRF authentication failed, return 401.
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Bearer ") and not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication credentials were not provided."}, status=401
        )
    # For routes configured with a specific unauthenticated_status, check auth now
    # before reaching GraphQL so the correct status code is returned.
    if route.unauthenticated_status is not None and not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication credentials were not provided."},
            status=route.unauthenticated_status,
        )

    from rest_framework.exceptions import ValidationError as DRFValidationError
    try:
        variables = route.extract_vars(request, kwargs)
    except DRFValidationError as exc:
        detail = exc.detail
        if isinstance(detail, dict):
            early_body = {k: [str(v) for v in (vs if isinstance(vs, list) else [vs])] for k, vs in detail.items()}
            return Response(early_body, status=400)
        return Response({"detail": str(detail)}, status=400)

    # Strawberry requires a plain Django HttpRequest, not a DRF Request wrapper.
    django_request: HttpRequest = getattr(request, "_request", request)
    django_request.user = request.user

    result = schema.execute_sync(
        route.graphql_op,
        variable_values=variables,
        context_value=_Context(django_request),
    )
    if result.errors:
        for err in result.errors:
            extensions = getattr(err, "extensions", None) or {}
            http_status = extensions.get("http_status")
            if http_status:
                # Dict ValidationErrors carry the structured detail as an extension so
                # the REST response shape mirrors the original DRF serializer error.
                ext_detail: Any = extensions.get("detail")
                if ext_detail is not None and isinstance(ext_detail, dict):
                    err_body = {k: [str(v) for v in (vs if isinstance(vs, list) else [vs])] for k, vs in ext_detail.items()}
                    return Response(err_body, status=http_status)
                return Response({"detail": err.message}, status=http_status)
        # Fallback: first error message as 400
        return Response({"detail": str(result.errors[0].message)}, status=400)
    body: Any = (result.data or {}).get(route.data_key)
    if body is None:
        # GraphQL returns null for queries that return Optional (e.g. piece by id
        # when not found). Map to 404 so the REST contract is preserved.
        return Response({"detail": "Not found."}, status=404)
    body = _snake_keys(body)
    if route.key_renames and isinstance(body, dict):
        for old_key, new_key in route.key_renames.items():
            if old_key in body:
                body[new_key] = body.pop(old_key)
    if route.post_process is not None:
        body = route.post_process(body)
    # Allow the resolver to inject a variable status code via a meta key.
    status = route.success_status
    if route.success_status_key and isinstance(body, dict):
        override = body.pop(route.success_status_key, None)
        if override is not None:
            status = int(override)
    # HTTP 204 No Content must not have a body.
    response = Response(None if status == 204 else body, status=status)
    for header, value in (route.response_headers or {}).items():
        response[header] = value
    return response


def make_rest_view(route: RestRoute):
    """Return a DRF @api_view callable for the given RestRoute."""

    @api_view([route.method])
    @permission_classes([AllowAny])
    def _view(request, **kwargs):
        return _execute_route(route, request, kwargs)

    from drf_spectacular.utils import extend_schema
    from drf_spectacular.types import OpenApiTypes
    if route.extend_schema_kwargs:
        _view = extend_schema(**route.extend_schema_kwargs)(_view)
    else:
        # No explicit schema provided: supply a generic annotation so drf-spectacular
        # can generate an operation without "unable to guess serializer" errors.
        # The view still appears in the schema so downstream consumers (e.g. the
        # LLM schema filter) can discover it.
        _view = extend_schema(
            # GET/DELETE carry no request body; only mutation verbs do.
            request=OpenApiTypes.OBJECT if route.method in ("POST", "PUT", "PATCH") else None,
            # 204 No Content carries no response body.
            responses={route.success_status: None if route.success_status == 204 else OpenApiTypes.OBJECT},
        )(_view)

    return _view


def make_multi_route_view(*routes: RestRoute):
    """Return a DRF @api_view that dispatches to different RestRoutes by method.

    Use when a single URL handles multiple HTTP methods (e.g. GET + POST).
    All routes must have distinct methods.
    """
    methods = [r.method for r in routes]
    route_map = {r.method: r for r in routes}

    @api_view(methods)
    @permission_classes([AllowAny])
    def _view(request, **kwargs):
        route = route_map[request.method]
        return _execute_route(route, request, kwargs)

    # Apply per-route extend_schema separately (preserves method-specific annotations).
    for r in routes:
        if r.extend_schema_kwargs:
            from drf_spectacular.utils import extend_schema
            _view = extend_schema(**r.extend_schema_kwargs)(_view)

    # If no route contributed schema kwargs, supply a generic per-method annotation
    # so drf-spectacular can generate operations without "unable to guess serializer"
    # errors. Views still appear in the schema so downstream consumers (e.g. the
    # LLM schema filter) can discover them.
    if not any(r.extend_schema_kwargs for r in routes):
        from drf_spectacular.utils import extend_schema
        from drf_spectacular.types import OpenApiTypes
        for r in routes:
            _view = extend_schema(
                methods=[r.method],
                # GET/DELETE carry no request body; only mutation verbs do.
                request=OpenApiTypes.OBJECT if r.method in ("POST", "PUT", "PATCH") else None,
                # 204 No Content carries no response body.
                responses={r.success_status: None if r.success_status == 204 else OpenApiTypes.OBJECT},
            )(_view)

    return _view


# ---------------------------------------------------------------------------
# GraphQL fragments
# ---------------------------------------------------------------------------

_PIECE_DETAIL_FRAGMENT = """
fragment PieceDetail on PieceDetailType {
  id name shared isEditable canEdit notes
  created lastModified photoCount currentLocation
  showcaseStory showcaseFields showcaseVideoUrl ownerAlias
  currentState { state }
  currentStateFull
  thumbnail { url imageId width height crop { x y width height } croppedUrl r2Key cropTaskFailed }
  tags { id name color }
  history: states
}
"""

_PIECE_SUMMARY_FRAGMENT = """
fragment PieceSummary on PieceType {
  id name created lastModified photoCount shared isEditable canEdit
  showcaseStory showcaseFields currentLocation
  currentState { state }
  thumbnail { url imageId width height crop { x y width height } croppedUrl r2Key cropTaskFailed }
  tags { id name color isPublic }
}
"""


# ---------------------------------------------------------------------------
# Post-processing helpers
# ---------------------------------------------------------------------------


def _enrich_piece_detail(body: Any) -> Any:
    """Supplement a piece detail response from the REST bridge.

    The GraphQL ``PieceDetailType.currentState`` only carries ``{state}``, but
    REST clients expect the full PieceState dict (notes, custom_fields, images,
    etc.).  The ``history`` field contains the full PieceState serializations
    via the JSON scalar passthrough (snake_case-converted).

    We reconstruct ``current_state`` from history: the partial ``{state: name}``
    from GraphQL tells us which state name to look for; we take the last history
    entry with that state name.

    When ``exclude_history=true`` is in the request, ``history`` is ``[]`` but
    ``currentStateFull`` carries the full current state as a dedicated scalar.
    We use that as a fallback and then strip it from the final response so that
    the REST contract (``history: []``) is preserved.
    """
    if not isinstance(body, dict):
        return body
    history = body.get("history") or []
    partial_cs = body.get("current_state") or {}
    current_state_name = partial_cs.get("state")
    if history and current_state_name:
        # Find the last history entry matching the current state name.
        matched = [h for h in history if h.get("state") == current_state_name]
        if matched:
            body["current_state"] = matched[-1]
        else:
            # Fallback: use the last history entry.
            body["current_state"] = history[-1]
    elif history:
        body["current_state"] = history[-1]
    elif body.get("current_state_full"):
        # exclude_history=true: history is [] but the full current state is
        # available via the dedicated currentStateFull scalar.
        body["current_state"] = body["current_state_full"]
    # Remove the bridge-internal field; it is not part of the REST contract.
    body.pop("current_state_full", None)
    return body


# ---------------------------------------------------------------------------
# OpenAPI schema helpers — lazy imports avoid circular deps at module load time.
# ---------------------------------------------------------------------------


def _pieces_list_schema() -> dict:
    from drf_spectacular.utils import OpenApiParameter, inline_serializer
    from rest_framework import serializers as drf_serializers

    from api.serializers import PieceSummarySerializer

    return {
        "methods": ["GET"],
        "operation_id": "pieces_list",
        "responses": {
            200: inline_serializer(
                name="PiecePage",
                fields={
                    "count": drf_serializers.IntegerField(),
                    "results": PieceSummarySerializer(many=True),
                },
            )
        },
        "parameters": [
            OpenApiParameter(name="ordering", required=False, type=str),
            OpenApiParameter(name="limit", required=False, type=int),
            OpenApiParameter(name="offset", required=False, type=int),
            OpenApiParameter(name="tag_ids", required=False, type=str),
        ],
    }


def _pieces_create_schema() -> dict:
    from api.serializers import PieceCreateSerializer, PieceDetailSerializer

    return {
        "methods": ["POST"],
        "operation_id": "pieces_create",
        "request": PieceCreateSerializer,
        "responses": {201: PieceDetailSerializer},
    }


def _piece_detail_get_schema() -> dict:
    from api.serializers import PieceDetailSerializer

    return {
        "methods": ["GET"],
        "operation_id": "pieces_retrieve",
        "responses": {200: PieceDetailSerializer},
    }


def _piece_detail_patch_schema() -> dict:
    from api.serializers import PieceDetailSerializer, PieceUpdateSerializer

    return {
        "methods": ["PATCH"],
        "operation_id": "pieces_partial_update",
        "request": PieceUpdateSerializer,
        "responses": {200: PieceDetailSerializer},
    }


def _glaze_combination_images_schema() -> dict:
    from api.serializers import GlazeCombinationImageEntrySerializer

    return {
        "methods": ["GET"],
        "operation_id": "analysis_glaze_combination_images_list",
        "responses": {200: GlazeCombinationImageEntrySerializer(many=True)},
    }


# ---------------------------------------------------------------------------
# Route table
# ---------------------------------------------------------------------------

# GET /pieces/
PIECES_LIST = RestRoute(
    method="GET",
    graphql_op=_PIECE_SUMMARY_FRAGMENT + """
query PiecesList(
  $limit: Int
  $offset: Int
  $ordering: PieceOrdering
  $state: [String!]
  $shared: Boolean
  $search: String
  $tagIds: [ID!]
) {
  pieces(
    limit: $limit
    offset: $offset
    ordering: $ordering
    filter: {
      state: $state
      shared: $shared
      search: $search
      tagIds: $tagIds
    }
  ) {
    count
    results { ...PieceSummary }
  }
}
""",
    data_key="pieces",
    extract_vars=lambda request, kwargs: _extract_pieces_list_vars(request),
    success_status=200,
    response_headers={"X-GraphQL-Endpoint": "/api/graphql/"},
)


def _extract_piece_patch_vars(request, kwargs: dict) -> dict:
    from rest_framework.exceptions import ValidationError as DRFValidationError
    data = request.data
    vars: dict[str, Any] = {"id": str(kwargs["piece_id"])}
    if "name" in data:
        vars["name"] = data["name"]
    if "shared" in data:
        vars["shared"] = data["shared"]
    if "is_editable" in data:
        vars["isEditable"] = data["is_editable"]
    if "thumbnail" in data:
        vars["thumbnail"] = data["thumbnail"]
    if "tags" in data and data["tags"] is not None:
        int_tags = []
        for t in data["tags"]:
            try:
                int_tags.append(int(t))
            except (ValueError, TypeError):
                raise DRFValidationError({"tags": [f"Invalid tag id: '{t}'"]})
        vars["tags"] = int_tags
    if "current_location" in data:
        vars["currentLocation"] = data["current_location"]
    if "showcase_story" in data:
        vars["showcaseStory"] = data["showcase_story"]
    if "showcase_fields" in data:
        vars["showcaseFields"] = data["showcase_fields"]
    return vars


def _extract_pieces_list_vars(request) -> dict:
    qp = request.query_params
    vars: dict[str, Any] = {}

    # Limit / offset — preserve the REST contract default page size of 16.
    from api.piece.helpers import _DEFAULT_PAGE_SIZE
    try:
        vars["limit"] = max(1, min(100, int(qp.get("limit", _DEFAULT_PAGE_SIZE))))
    except (ValueError, TypeError):
        vars["limit"] = _DEFAULT_PAGE_SIZE
    try:
        vars["offset"] = max(0, int(qp.get("offset", 0)))
    except (ValueError, TypeError):
        vars["offset"] = 0

    # Ordering — REST uses the Django orm value; GraphQL uses enum names
    _ORDERING_MAP = {
        "-last_modified": "LAST_MODIFIED_DESC",
        "last_modified": "LAST_MODIFIED_ASC",
        "name": "NAME_ASC",
        "-name": "NAME_DESC",
        "created": "CREATED_ASC",
        "-created": "CREATED_DESC",
    }
    ordering_param = qp.get("ordering", "-last_modified")
    gql_ordering = _ORDERING_MAP.get(ordering_param)
    if gql_ordering:
        vars["ordering"] = gql_ordering

    # Filter: state
    state_param = qp.get("state")
    if state_param:
        vars["state"] = [s.strip() for s in state_param.split(",") if s.strip()]

    # Filter: shared
    shared_param = qp.get("shared")
    if shared_param is not None:
        vars["shared"] = shared_param.lower() in ("true", "1", "yes")

    # Filter: search
    search_param = qp.get("search")
    if search_param:
        vars["search"] = search_param

    # Filter: tag_ids (comma-separated)
    raw_tag_ids = qp.get("tag_ids", "").strip()
    if raw_tag_ids:
        vars["tagIds"] = [t.strip() for t in raw_tag_ids.split(",") if t.strip()]

    return vars


# POST /pieces/
PIECES_CREATE = RestRoute(
    method="POST",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation CreatePiece($name: String!, $notes: String, $thumbnail: String, $currentLocation: String) {
  createPiece(input: { name: $name, notes: $notes, thumbnail: $thumbnail, currentLocation: $currentLocation }) {
    ...PieceDetail
  }
}
""",
    data_key="createPiece",
    extract_vars=lambda request, kwargs: {
        "name": request.data.get("name", ""),
        "notes": request.data.get("notes", ""),
        "thumbnail": request.data.get("thumbnail"),
        "currentLocation": request.data.get("current_location"),
    },
    success_status=201,
    post_process=_enrich_piece_detail,
)

# GET /pieces/{piece_id}/
PIECE_DETAIL_GET = RestRoute(
    method="GET",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
query PieceDetail($id: ID!) {
  piece(id: $id) { ...PieceDetail }
}
""",
    data_key="piece",
    extract_vars=lambda request, kwargs: {"id": str(kwargs["piece_id"])},
    success_status=200,
    post_process=_enrich_piece_detail,
)

# PATCH /pieces/{piece_id}/
PIECE_DETAIL_PATCH = RestRoute(
    method="PATCH",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation UpdatePiece($id: ID!, $name: String, $shared: Boolean, $isEditable: Boolean, $thumbnail: JSON, $tags: [Int!], $currentLocation: String, $showcaseStory: String, $showcaseFields: JSON) {
  updatePiece(id: $id, input: { name: $name, shared: $shared, isEditable: $isEditable, thumbnail: $thumbnail, tags: $tags, currentLocation: $currentLocation, showcaseStory: $showcaseStory, showcaseFields: $showcaseFields }) {
    ...PieceDetail
  }
}
""",
    data_key="updatePiece",
    extract_vars=lambda request, kwargs: _extract_piece_patch_vars(request, kwargs),
    success_status=200,
    post_process=_enrich_piece_detail,
)

# PATCH /pieces/{piece_id}/state/
PIECE_CURRENT_STATE_PATCH = RestRoute(
    method="PATCH",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation UpdateCurrentState($id: ID!, $notes: String, $customFields: JSON, $images: JSON, $created: String) {
  updateCurrentState(id: $id, input: { notes: $notes, customFields: $customFields, images: $images, created: $created }) {
    ...PieceDetail
  }
}
""",
    data_key="updateCurrentState",
    extract_vars=lambda request, kwargs: {
        "id": str(kwargs["piece_id"]),
        **{k: v for k, v in {
            "notes": request.data.get("notes"),
            "customFields": request.data.get("custom_fields"),
            "images": request.data.get("images"),
            "created": request.data.get("created"),
        }.items() if v is not None},
    },
    success_status=200,
    post_process=_enrich_piece_detail,
)

# POST /pieces/{piece_id}/state/upload-image/
PIECE_CURRENT_STATE_UPLOAD_IMAGE = RestRoute(
    method="POST",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation UploadImage($pieceId: ID!, $url: String!, $caption: String) {
  uploadImage(pieceId: $pieceId, input: { url: $url, caption: $caption }) {
    ...PieceDetail
  }
}
""",
    data_key="uploadImage",
    extract_vars=lambda request, kwargs: {
        "pieceId": str(kwargs["piece_id"]),
        "url": request.data.get("url", ""),
        "caption": request.data.get("caption", ""),
    },
    success_status=201,
    post_process=_enrich_piece_detail,
)

# POST /pieces/{piece_id}/state/upload-image-refs/
PIECE_CURRENT_STATE_UPLOAD_IMAGE_REFS = RestRoute(
    method="POST",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation UploadImageFromRefs($pieceId: ID!, $r2Keys: [String!]!, $captions: [String!]) {
  uploadImageFromRefs(pieceId: $pieceId, input: { r2Keys: $r2Keys, captions: $captions }) {
    ...PieceDetail
  }
}
""",
    data_key="uploadImageFromRefs",
    extract_vars=lambda request, kwargs: {
        "pieceId": str(kwargs["piece_id"]),
        "r2Keys": request.data.get("r2_keys", []),
        "captions": request.data.get("captions", []),
    },
    success_status=201,
    post_process=_enrich_piece_detail,
)

# POST /pieces/{piece_id}/states/
PIECE_STATES_POST = RestRoute(
    method="POST",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation TransitionPiece($id: ID!, $targetState: String!, $notes: String, $images: JSON, $customFields: JSON) {
  transitionPiece(id: $id, input: { targetState: $targetState, notes: $notes, images: $images, customFields: $customFields }) {
    ...PieceDetail
  }
}
""",
    data_key="transitionPiece",
    extract_vars=lambda request, kwargs: {
        "id": str(kwargs["piece_id"]),
        "targetState": request.data.get("state", ""),
        "notes": request.data.get("notes"),
        "images": request.data.get("images"),
        "customFields": request.data.get("custom_fields"),
    },
    success_status=201,
    post_process=_enrich_piece_detail,
)

# PATCH /pieces/{piece_id}/states/{state_id}/
PIECE_PAST_STATE_PATCH = RestRoute(
    method="PATCH",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation UpdatePastState($id: ID!, $stateId: ID!, $notes: String, $customFields: JSON, $images: JSON, $created: String) {
  updatePastState(id: $id, stateId: $stateId, input: { notes: $notes, customFields: $customFields, images: $images, created: $created }) {
    ...PieceDetail
  }
}
""",
    data_key="updatePastState",
    extract_vars=lambda request, kwargs: {
        "id": str(kwargs["piece_id"]),
        "stateId": str(kwargs["state_id"]),
        **{k: v for k, v in {
            "notes": request.data.get("notes"),
            "customFields": request.data.get("custom_fields"),
            "images": request.data.get("images"),
            "created": request.data.get("created"),
        }.items() if v is not None},
    },
    success_status=200,
    post_process=_enrich_piece_detail,
)

# DELETE /pieces/{piece_id}/states/{state_id}/
PIECE_PAST_STATE_DELETE = RestRoute(
    method="DELETE",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation DeletePastState($id: ID!, $stateId: ID!) {
  deletePastState(id: $id, stateId: $stateId) {
    ...PieceDetail
  }
}
""",
    data_key="deletePastState",
    extract_vars=lambda request, kwargs: {
        "id": str(kwargs["piece_id"]),
        "stateId": str(kwargs["state_id"]),
    },
    success_status=200,
    post_process=_enrich_piece_detail,
)

# POST /pieces/{piece_id}/states/{state_id}/upload-image/
PIECE_PAST_STATE_UPLOAD_IMAGE = RestRoute(
    method="POST",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation UploadImageToPastState($pieceId: ID!, $stateId: ID!, $url: String!, $caption: String) {
  uploadImageToPastState(pieceId: $pieceId, stateId: $stateId, input: { url: $url, caption: $caption }) {
    ...PieceDetail
  }
}
""",
    data_key="uploadImageToPastState",
    extract_vars=lambda request, kwargs: {
        "pieceId": str(kwargs["piece_id"]),
        "stateId": str(kwargs["state_id"]),
        "url": request.data.get("url", ""),
        "caption": request.data.get("caption", ""),
    },
    success_status=201,
    post_process=_enrich_piece_detail,
)

# POST /pieces/{piece_id}/states/{state_id}/upload-image-refs/
PIECE_PAST_STATE_UPLOAD_IMAGE_REFS = RestRoute(
    method="POST",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation UploadImageFromRefsToPastState($pieceId: ID!, $stateId: ID!, $r2Keys: [String!]!, $captions: [String!]) {
  uploadImageFromRefsToPastState(pieceId: $pieceId, stateId: $stateId, input: { r2Keys: $r2Keys, captions: $captions }) {
    ...PieceDetail
  }
}
""",
    data_key="uploadImageFromRefsToPastState",
    extract_vars=lambda request, kwargs: {
        "pieceId": str(kwargs["piece_id"]),
        "stateId": str(kwargs["state_id"]),
        "r2Keys": request.data.get("r2_keys", []),
        "captions": request.data.get("captions", []),
    },
    success_status=201,
    post_process=_enrich_piece_detail,
)

# PATCH /images/{image_id}/piece_state/{piece_state_id}/
IMAGE_MOVE = RestRoute(
    method="PATCH",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation MoveImage($imageId: ID!, $targetStateId: ID!, $sourceStateId: ID) {
  moveImage(imageId: $imageId, targetStateId: $targetStateId, sourceStateId: $sourceStateId) {
    ...PieceDetail
  }
}
""",
    data_key="moveImage",
    extract_vars=lambda request, kwargs: {
        "imageId": str(kwargs["image_id"]),
        "targetStateId": str(request.data.get("piece_state_id") or kwargs.get("piece_state_id", "")),
        "sourceStateId": str(kwargs["piece_state_id"]),
    },
    success_status=200,
    post_process=_enrich_piece_detail,
)

# PATCH /images/{image_id}/crop/
IMAGE_CROP = RestRoute(
    method="PATCH",
    graphql_op=_PIECE_DETAIL_FRAGMENT + """
mutation CropImage($imageId: ID!, $x: Float, $y: Float, $width: Float, $height: Float) {
  cropImage(imageId: $imageId, crop: { x: $x, y: $y, width: $width, height: $height }) {
    ...PieceDetail
  }
}
""",
    data_key="cropImage",
    extract_vars=lambda request, kwargs: {
        "imageId": str(kwargs["image_id"]),
        "x": request.data.get("x"),
        "y": request.data.get("y"),
        "width": request.data.get("width"),
        "height": request.data.get("height"),
    },
    success_status=200,
    post_process=_enrich_piece_detail,
    unauthenticated_status=401,
)

# GET /globals/{name}/
GLOBAL_ENTRIES_GET = RestRoute(
    method="GET",
    graphql_op="""
query GlobalEntries($globalName: String!, $filters: JSON) {
  globals(globalName: $globalName, filters: $filters)
}
""",
    data_key="globals",
    extract_vars=lambda request, kwargs: {
        "globalName": kwargs["global_name"],
        # .dict() returns {key: last_value_str} — avoids the multi-value list issue
        "filters": request.query_params.dict() if request.query_params else None,
    },
    success_status=200,
)

# POST /globals/{name}/
# The resolver injects _http_status (200 for existing, 201 for new) so we can
# propagate the correct status code through the GraphQL bridge.
GLOBAL_ENTRIES_POST = RestRoute(
    method="POST",
    graphql_op="""
mutation CreateGlobal($globalName: String!, $input: JSON!) {
  createGlobal(globalName: $globalName, input: $input)
}
""",
    data_key="createGlobal",
    extract_vars=lambda request, kwargs: {
        "globalName": kwargs["global_name"],
        "input": dict(request.data),
    },
    success_status=201,
    success_status_key="_http_status",
)

# POST /globals/{name}/{pk}/favorite/
GLOBAL_FAVORITE_ADD = RestRoute(
    method="POST",
    graphql_op="""
mutation AddFavorite($globalName: String!, $pk: ID!) {
  addFavorite(globalName: $globalName, pk: $pk)
}
""",
    data_key="addFavorite",
    extract_vars=lambda request, kwargs: {
        "globalName": kwargs["global_name"],
        "pk": str(kwargs["pk"]),
    },
    success_status=204,
)

# DELETE /globals/{name}/{pk}/favorite/
GLOBAL_FAVORITE_REMOVE = RestRoute(
    method="DELETE",
    graphql_op="""
mutation RemoveFavorite($globalName: String!, $pk: ID!) {
  removeFavorite(globalName: $globalName, pk: $pk)
}
""",
    data_key="removeFavorite",
    extract_vars=lambda request, kwargs: {
        "globalName": kwargs["global_name"],
        "pk": str(kwargs["pk"]),
    },
    success_status=204,
)

# GET /workflow/
WORKFLOW_SCHEMA_GET = RestRoute(
    method="GET",
    graphql_op="""
query WorkflowSchema {
  workflowSchema
}
""",
    data_key="workflowSchema",
    extract_vars=lambda request, kwargs: {},
    success_status=200,
)

# GET /workflow/schema/{state_id}/
WORKFLOW_STATE_SCHEMA_GET = RestRoute(
    method="GET",
    graphql_op="""
query StateSchema($stateId: String!) {
  stateSchema(stateId: $stateId)
}
""",
    data_key="stateSchema",
    extract_vars=lambda request, kwargs: {"stateId": kwargs["state_id"]},
    success_status=200,
)

# GET /analysis/glaze-combination-images/
GLAZE_COMBINATION_IMAGES_GET = RestRoute(
    method="GET",
    graphql_op="""
query GlazeCombinationImages {
  glazeCombinationImages
}
""",
    data_key="glazeCombinationImages",
    extract_vars=lambda request, kwargs: {},
    success_status=200,
)

# ---------------------------------------------------------------------------
# Register drf-spectacular OpenAPI schemas for bridge views.
# Must run after all route instances are created. The helper functions use
# lazy imports to avoid circular dependencies at module load time.
# ---------------------------------------------------------------------------
PIECES_LIST.extend_schema_kwargs.update(_pieces_list_schema())
PIECES_CREATE.extend_schema_kwargs.update(_pieces_create_schema())
PIECE_DETAIL_GET.extend_schema_kwargs.update(_piece_detail_get_schema())
PIECE_DETAIL_PATCH.extend_schema_kwargs.update(_piece_detail_patch_schema())
GLAZE_COMBINATION_IMAGES_GET.extend_schema_kwargs.update(_glaze_combination_images_schema())
