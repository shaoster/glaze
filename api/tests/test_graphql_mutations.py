"""Tests for GraphQL mutations (create, update, transition, image ops).

Mutations require authentication and CSRF for session-based requests, but
must remain CSRF-exempt for Bearer-token callers (MCP / Expo).
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from api.models import ENTRY_STATE, Piece, PieceState, Tag
from api.workflow import SUCCESSORS

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def gql_client(user):
    c = APIClient()
    c.force_login(user)
    return c


def _run(client, query: str, variables: dict | None = None):
    response = client.post(
        "/api/graphql/",
        {"query": query, "variables": variables or {}},
        format="json",
    )
    assert response.status_code == 200, response.content
    return response.json()


def _make_piece(user, name, *, final_state=None):
    piece = Piece.objects.create(user=user, name=name)
    PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=1)
    if final_state is not None:
        PieceState.objects.create(piece=piece, state=final_state, order=2)
    return piece


# ---------------------------------------------------------------------------
# createPiece
# ---------------------------------------------------------------------------

CREATE_PIECE_MUTATION = """
mutation CreatePiece($input: CreatePieceInput!) {
  createPiece(input: $input) {
    id
    name
    currentState { state }
  }
}
"""


@pytest.mark.django_db
class TestCreatePieceMutation:
    def test_creates_piece_in_entry_state(self, gql_client, user):
        body = _run(gql_client, CREATE_PIECE_MUTATION, {"input": {"name": "New Mug"}})
        assert not body.get("errors"), body
        result = body["data"]["createPiece"]
        assert result["name"] == "New Mug"
        assert result["currentState"]["state"] == ENTRY_STATE
        assert Piece.objects.filter(user=user, name="New Mug").exists()

    def test_requires_auth(self, db):
        anon = APIClient()
        body = _run(anon, CREATE_PIECE_MUTATION, {"input": {"name": "Anon Mug"}})
        assert body.get("errors")
        assert not Piece.objects.filter(name="Anon Mug").exists()

    def test_bearer_token_without_csrf_is_accepted(self, user):
        """Bearer-token callers (MCP) must not be blocked by CSRF."""
        token = str(AccessToken.for_user(user))
        csrf_client = APIClient(enforce_csrf_checks=True)
        csrf_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = csrf_client.post(
            "/api/graphql/",
            {
                "query": CREATE_PIECE_MUTATION,
                "variables": {"input": {"name": "Bearer Mug"}},
            },
            format="json",
        )
        assert response.status_code == 200, response.content
        body = response.json()
        assert not body.get("errors"), body
        assert body["data"]["createPiece"]["name"] == "Bearer Mug"


# ---------------------------------------------------------------------------
# updatePiece
# ---------------------------------------------------------------------------

UPDATE_PIECE_MUTATION = """
mutation UpdatePiece($id: ID!, $input: UpdatePieceInput!) {
  updatePiece(id: $id, input: $input) {
    id
    name
    shared
    tags { id name }
  }
}
"""


@pytest.mark.django_db
class TestUpdatePieceMutation:
    def test_updates_name(self, gql_client, user):
        piece = _make_piece(user, "Old Name")
        body = _run(
            gql_client,
            UPDATE_PIECE_MUTATION,
            {"id": str(piece.id), "input": {"name": "New Name"}},
        )
        assert not body.get("errors"), body
        assert body["data"]["updatePiece"]["name"] == "New Name"

    def test_updates_shared_flag(self, gql_client, user):
        # Only terminal pieces can be shared; create piece with a terminal state.
        piece = _make_piece(user, "Bowl", final_state="completed")
        body = _run(
            gql_client,
            UPDATE_PIECE_MUTATION,
            {"id": str(piece.id), "input": {"shared": True}},
        )
        assert not body.get("errors"), body
        assert body["data"]["updatePiece"]["shared"] is True

    def test_other_users_piece_returns_not_found(self, gql_client, other_user):
        piece = _make_piece(other_user, "Theirs")
        body = _run(
            gql_client,
            UPDATE_PIECE_MUTATION,
            {"id": str(piece.id), "input": {"name": "Stolen"}},
        )
        assert body.get("errors")

    def test_adds_tag(self, gql_client, user):
        piece = _make_piece(user, "Mug")
        tag = Tag.objects.create(user=user, name="Gift")
        body = _run(
            gql_client,
            UPDATE_PIECE_MUTATION,
            {"id": str(piece.id), "input": {"tags": [tag.id]}},
        )
        assert not body.get("errors"), body
        tag_names = [t["name"] for t in body["data"]["updatePiece"]["tags"]]
        assert "Gift" in tag_names


# ---------------------------------------------------------------------------
# transitionPiece
# ---------------------------------------------------------------------------

TRANSITION_PIECE_MUTATION = """
mutation TransitionPiece($id: ID!, $input: TransitionPieceInput!) {
  transitionPiece(id: $id, input: $input) {
    id
    currentState { state }
  }
}
"""


@pytest.mark.django_db
class TestTransitionPieceMutation:
    def test_transitions_to_valid_state(self, gql_client, user):
        piece = _make_piece(user, "Bowl")
        next_state = SUCCESSORS[ENTRY_STATE][0]
        body = _run(
            gql_client,
            TRANSITION_PIECE_MUTATION,
            {"id": str(piece.id), "input": {"targetState": next_state}},
        )
        assert not body.get("errors"), body
        assert body["data"]["transitionPiece"]["currentState"]["state"] == next_state

    def test_invalid_state_returns_error(self, gql_client, user):
        piece = _make_piece(user, "Bowl")
        body = _run(
            gql_client,
            TRANSITION_PIECE_MUTATION,
            {"id": str(piece.id), "input": {"targetState": "nonexistent_state"}},
        )
        assert body.get("errors")

    def test_requires_auth(self, db, user):
        piece = _make_piece(user, "Bowl")
        anon = APIClient()
        body = _run(
            anon,
            TRANSITION_PIECE_MUTATION,
            {"id": str(piece.id), "input": {"targetState": SUCCESSORS[ENTRY_STATE][0]}},
        )
        assert body.get("errors")


# ---------------------------------------------------------------------------
# piece query
# ---------------------------------------------------------------------------

PIECE_QUERY = """
query Piece($id: ID!) {
  piece(id: $id) {
    id
    name
    currentState { state }
  }
}
"""


@pytest.mark.django_db
class TestPieceQuery:
    def test_returns_piece_for_owner(self, gql_client, user):
        piece = _make_piece(user, "My Mug")
        body = _run(gql_client, PIECE_QUERY, {"id": str(piece.id)})
        assert not body.get("errors"), body
        assert body["data"]["piece"]["name"] == "My Mug"

    def test_returns_null_for_missing_piece(self, gql_client, user):
        import uuid

        body = _run(gql_client, PIECE_QUERY, {"id": str(uuid.uuid4())})
        assert not body.get("errors"), body
        assert body["data"]["piece"] is None

    def test_other_users_piece_returns_null(self, gql_client, other_user):
        piece = _make_piece(other_user, "Theirs")
        body = _run(gql_client, PIECE_QUERY, {"id": str(piece.id)})
        assert not body.get("errors"), body
        assert body["data"]["piece"] is None


# ---------------------------------------------------------------------------
# updateCurrentState
# ---------------------------------------------------------------------------

UPDATE_CURRENT_STATE_MUTATION = """
mutation UpdateCurrentState($id: ID!, $input: UpdateStateInput!) {
  updateCurrentState(id: $id, input: $input) {
    id
    currentState { state }
  }
}
"""


@pytest.mark.django_db
class TestUpdateCurrentStateMutation:
    def test_updates_notes(self, gql_client, user):
        piece = _make_piece(user, "Bowl")
        body = _run(
            gql_client,
            UPDATE_CURRENT_STATE_MUTATION,
            {"id": str(piece.id), "input": {"notes": "Some notes"}},
        )
        assert not body.get("errors"), body
        current = piece.states.order_by("-order").first()
        current.refresh_from_db()
        assert current.notes == "Some notes"


# ---------------------------------------------------------------------------
# deletePastState
# ---------------------------------------------------------------------------

DELETE_PAST_STATE_MUTATION = """
mutation DeletePastState($id: ID!, $stateId: ID!) {
  deletePastState(id: $id, stateId: $stateId) {
    id
    currentState { state }
  }
}
"""


@pytest.mark.django_db
class TestDeletePastStateMutation:
    def test_delete_past_state_requires_auth(self, db, user):
        piece = _make_piece(user, "Bowl")
        anon = APIClient()
        body = _run(
            anon,
            DELETE_PAST_STATE_MUTATION,
            {"id": str(piece.id), "stateId": str(piece.states.first().id)},
        )
        assert body.get("errors")
