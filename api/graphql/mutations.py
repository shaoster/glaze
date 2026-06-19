"""GraphQL mutation type for Glaze.

Each mutation delegates to the corresponding resolver in api/piece/resolvers.py
or api/piece/image_resolvers.py. Auth is checked via _require_auth before any
data access.
"""

from __future__ import annotations

import strawberry
from django.core.exceptions import PermissionDenied
from django.http import Http404
from rest_framework.exceptions import ValidationError
from strawberry.exceptions import StrawberryGraphQLError

from api.piece.image_resolvers import (
    resolve_crop_image,
    resolve_move_image,
    resolve_upload_image,
    resolve_upload_image_from_refs,
    resolve_upload_image_from_refs_to_past_state,
    resolve_upload_image_to_past_state,
)
from api.piece.resolvers import (
    resolve_create_piece,
    resolve_delete_past_state,
    resolve_transition_piece,
    resolve_update_current_state,
    resolve_update_past_state,
    resolve_update_piece,
)

from .context import get_request_user
from .types import (
    JSON,
    CreatePieceInput,
    ImageCropInput,
    PieceDetailType,
    TransitionPieceInput,
    UpdatePieceInput,
    UpdateStateInput,
    UploadImageFromRefsInput,
    UploadImageInput,
)


def _require_auth(info: strawberry.Info):
    """Return authenticated user or raise StrawberryGraphQLError."""
    user = get_request_user(info.context.request)
    if user is None or not user.is_authenticated:
        raise StrawberryGraphQLError("Authentication required.")
    return user


def _map_error(exc: Exception) -> StrawberryGraphQLError:
    if isinstance(exc, Http404):
        return StrawberryGraphQLError("Not found.")
    if isinstance(exc, PermissionDenied):
        return StrawberryGraphQLError(str(exc) or "Permission denied.")
    if isinstance(exc, ValidationError):
        detail = exc.detail
        if isinstance(detail, dict):
            msgs = [f"{k}: {v}" for k, v in detail.items()]
            return StrawberryGraphQLError("; ".join(str(m) for m in msgs))
        return StrawberryGraphQLError(str(detail))
    raise exc


@strawberry.type
class Mutation:
    @strawberry.mutation(description="Create a new piece in the entry state.")
    def create_piece(
        self, info: strawberry.Info, input: CreatePieceInput
    ) -> PieceDetailType:
        _require_auth(info)
        try:
            data = resolve_create_piece(input.name, input.notes, info.context.request)
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Update piece metadata.")
    def update_piece(
        self, info: strawberry.Info, id: strawberry.ID, input: UpdatePieceInput
    ) -> PieceDetailType:
        _require_auth(info)
        payload: dict = {}
        if input.name is not None:
            payload["name"] = input.name
        if input.shared is not None:
            payload["shared"] = input.shared
        if input.tags is not None:
            payload["tags"] = input.tags
        try:
            data = resolve_update_piece(str(id), payload, info.context.request)
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Transition piece to a new workflow state.")
    def transition_piece(
        self, info: strawberry.Info, id: strawberry.ID, input: TransitionPieceInput
    ) -> PieceDetailType:
        _require_auth(info)
        try:
            data = resolve_transition_piece(
                str(id), input.target_state, input.custom_fields, info.context.request
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Update the current (unsealed) state's fields.")
    def update_current_state(
        self, info: strawberry.Info, id: strawberry.ID, input: UpdateStateInput
    ) -> PieceDetailType:
        _require_auth(info)
        payload: dict = {}
        if input.notes is not None:
            payload["notes"] = input.notes
        if input.custom_fields is not None:
            payload["custom_fields"] = input.custom_fields
        if input.images is not None:
            payload["images"] = input.images
        if input.created is not None:
            payload["created"] = input.created
        try:
            data = resolve_update_current_state(str(id), payload, info.context.request)
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Update a past (sealed) state.")
    def update_past_state(
        self,
        info: strawberry.Info,
        id: strawberry.ID,
        state_id: strawberry.ID,
        input: UpdateStateInput,
    ) -> PieceDetailType:
        _require_auth(info)
        payload: dict = {}
        if input.notes is not None:
            payload["notes"] = input.notes
        if input.custom_fields is not None:
            payload["custom_fields"] = input.custom_fields
        if input.images is not None:
            payload["images"] = input.images
        if input.created is not None:
            payload["created"] = input.created
        try:
            data = resolve_update_past_state(
                str(id), str(state_id), payload, info.context.request
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Delete a past (sealed) state.")
    def delete_past_state(
        self, info: strawberry.Info, id: strawberry.ID, state_id: strawberry.ID
    ) -> PieceDetailType:
        _require_auth(info)
        try:
            data = resolve_delete_past_state(
                str(id), str(state_id), info.context.request
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Upload image from URL to piece's current state.")
    def upload_image(
        self, info: strawberry.Info, piece_id: strawberry.ID, input: UploadImageInput
    ) -> PieceDetailType:
        _require_auth(info)
        try:
            data = resolve_upload_image(
                str(piece_id), input.url, input.caption, info.context.request
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Update crop bounds for an image.")
    def crop_image(
        self, info: strawberry.Info, image_id: strawberry.ID, crop: ImageCropInput
    ) -> PieceDetailType:
        _require_auth(info)
        try:
            data = resolve_crop_image(
                str(image_id),
                crop.x,
                crop.y,
                crop.width,
                crop.height,
                info.context.request,
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(description="Move an image to a different piece state.")
    def move_image(
        self,
        info: strawberry.Info,
        image_id: strawberry.ID,
        target_state_id: strawberry.ID,
    ) -> PieceDetailType:
        user = _require_auth(info)
        info.context.request.user = user
        try:
            data = resolve_move_image(
                str(image_id), str(target_state_id), info.context.request
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(
        description="Upload an image by URL to a specific (past) piece state."
    )
    def upload_image_to_past_state(
        self,
        info: strawberry.Info,
        piece_id: strawberry.ID,
        state_id: strawberry.ID,
        input: UploadImageInput,
    ) -> PieceDetailType:
        user = _require_auth(info)
        info.context.request.user = user
        try:
            data = resolve_upload_image_to_past_state(
                str(piece_id),
                str(state_id),
                input.url,
                input.caption,
                info.context.request,
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(
        description="Upload images by R2 key to the piece's current state."
    )
    def upload_image_from_refs(
        self,
        info: strawberry.Info,
        piece_id: strawberry.ID,
        input: UploadImageFromRefsInput,
    ) -> PieceDetailType:
        user = _require_auth(info)
        info.context.request.user = user
        try:
            data = resolve_upload_image_from_refs(
                str(piece_id), input.r2_keys, input.captions, info.context.request
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(
        description="Upload images by R2 key to a specific (past) piece state."
    )
    def upload_image_from_refs_to_past_state(
        self,
        info: strawberry.Info,
        piece_id: strawberry.ID,
        state_id: strawberry.ID,
        input: UploadImageFromRefsInput,
    ) -> PieceDetailType:
        user = _require_auth(info)
        info.context.request.user = user
        try:
            data = resolve_upload_image_from_refs_to_past_state(
                str(piece_id),
                str(state_id),
                input.r2_keys,
                input.captions,
                info.context.request,
            )
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
        return PieceDetailType.from_detail(data)

    @strawberry.mutation(
        description="Create a private global entry (clay body, glaze type, tag, etc.)."
    )
    def create_global(
        self, info: strawberry.Info, global_name: str, input: JSON
    ) -> JSON:
        user = _require_auth(info)
        info.context.request.user = user
        from api.global_entries.resolvers import resolve_create_global

        try:
            return resolve_create_global(global_name, input, info.context.request)
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)

    @strawberry.mutation(description="Add a global entry to the user's favorites.")
    def add_favorite(
        self, info: strawberry.Info, global_name: str, pk: strawberry.ID
    ) -> bool:
        user = _require_auth(info)
        info.context.request.user = user
        from api.global_entries.resolvers import resolve_add_favorite

        try:
            return resolve_add_favorite(global_name, str(pk), info.context.request)
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)

    @strawberry.mutation(description="Remove a global entry from the user's favorites.")
    def remove_favorite(
        self, info: strawberry.Info, global_name: str, pk: strawberry.ID
    ) -> bool:
        user = _require_auth(info)
        info.context.request.user = user
        from api.global_entries.resolvers import resolve_remove_favorite

        try:
            return resolve_remove_favorite(global_name, str(pk), info.context.request)
        except (Http404, PermissionDenied, ValidationError) as exc:
            raise _map_error(exc)
