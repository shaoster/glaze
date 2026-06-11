"""Contract tests for the GraphQL ``pieces`` query.

These encode the same filter semantics the REST tests once did, now expressed as
GraphQL queries against ``/api/graphql/``. This is the canonical filtering
contract going forward (REST keeps only ``tag_ids``).

The GraphQL endpoint is a plain Django view, so tests authenticate with a real
session via ``force_login`` rather than DRF's ``force_authenticate``.
"""

import pytest
from rest_framework.test import APIClient

from api.models import ENTRY_STATE, Piece, PieceState, Tag

PIECES_QUERY = """
query Pieces($filter: PieceFilter, $ordering: PieceOrdering, $limit: Int, $offset: Int) {
  pieces(filter: $filter, ordering: $ordering, limit: $limit, offset: $offset) {
    count
    results {
      id
      name
      shared
      currentState { state }
      tags { id name }
    }
  }
}
"""


@pytest.fixture
def gql_client(user):
    c = APIClient()
    c.force_login(user)
    return c


def _run(client, variables=None):
    response = client.post(
        "/api/graphql/",
        {"query": PIECES_QUERY, "variables": variables or {}},
        format="json",
    )
    assert response.status_code == 200, response.content
    return response.json()


def _make_piece(user, name, *, final_state=None, shared=False):
    piece = Piece.objects.create(user=user, name=name, shared=shared)
    PieceState.objects.create(piece=piece, state=ENTRY_STATE, order=1)
    if final_state is not None:
        PieceState.objects.create(piece=piece, state=final_state, order=2)
    return piece


@pytest.mark.django_db
class TestGraphQLPieces:
    def test_state_filter_returns_only_matching_pieces(self, gql_client, user):
        _make_piece(user, "Active Mug")
        done = _make_piece(user, "Done Vase", final_state="completed")

        body = _run(gql_client, {"filter": {"state": ["completed"]}})
        page = body["data"]["pieces"]
        assert page["count"] == 1
        assert page["results"][0]["id"] == str(done.id)
        assert page["results"][0]["currentState"]["state"] == "completed"

    def test_state_filter_or_combines_multiple_states(self, gql_client, user):
        done = _make_piece(user, "Done Vase", final_state="completed")
        recycled = _make_piece(user, "Recycled Bowl", final_state="recycled")
        _make_piece(user, "Active Mug")

        body = _run(gql_client, {"filter": {"state": ["completed", "recycled"]}})
        page = body["data"]["pieces"]
        assert page["count"] == 2
        assert {r["id"] for r in page["results"]} == {str(done.id), str(recycled.id)}

    def test_state_filter_paginates_over_the_filtered_set(self, gql_client, user):
        """Regression for #885: a completed piece beyond the first page must be
        found because filtering happens server-side before pagination."""
        for i in range(18):
            _make_piece(user, f"Wip {i}")
        done = _make_piece(user, "Done Vase", final_state="completed")

        body = _run(
            gql_client, {"filter": {"state": ["completed"]}, "limit": 16, "offset": 0}
        )
        page = body["data"]["pieces"]
        assert page["count"] == 1
        assert page["results"][0]["id"] == str(done.id)

    def test_shared_filter_true(self, gql_client, user):
        _make_piece(user, "Private Mug", shared=False)
        public = _make_piece(user, "Public Bowl", final_state="completed", shared=True)

        page = _run(gql_client, {"filter": {"shared": True}})["data"]["pieces"]
        assert page["count"] == 1
        assert page["results"][0]["id"] == str(public.id)

    def test_shared_filter_false(self, gql_client, user):
        private = _make_piece(user, "Private Mug", shared=False)
        _make_piece(user, "Public Bowl", final_state="completed", shared=True)

        page = _run(gql_client, {"filter": {"shared": False}})["data"]["pieces"]
        assert page["count"] == 1
        assert page["results"][0]["id"] == str(private.id)

    def test_state_and_tags_are_and_combined(self, gql_client, user):
        tag = Tag.objects.create(user=user, name="Gift")
        completed_tagged = _make_piece(user, "Completed Tagged", final_state="completed")
        _make_piece(user, "Completed Untagged", final_state="completed")
        wip_tagged = _make_piece(user, "Wip Tagged")

        for piece in (completed_tagged, wip_tagged):
            gql_client.patch(
                f"/api/pieces/{piece.id}/",
                {"tags": [str(tag.id)]},
                format="json",
            )

        page = _run(
            gql_client,
            {"filter": {"state": ["completed"], "tagIds": [str(tag.id)]}},
        )["data"]["pieces"]
        assert page["count"] == 1
        assert page["results"][0]["id"] == str(completed_tagged.id)

    def test_search_filters_by_name(self, gql_client, user):
        match = _make_piece(user, "Blue Vase")
        _make_piece(user, "Red Mug")

        page = _run(gql_client, {"filter": {"search": "blue"}})["data"]["pieces"]
        assert page["count"] == 1
        assert page["results"][0]["id"] == str(match.id)

    def test_unknown_state_returns_empty(self, gql_client, user):
        _make_piece(user, "Bowl")
        page = _run(gql_client, {"filter": {"state": ["nonexistent"]}})["data"]["pieces"]
        assert page["count"] == 0
        assert page["results"] == []

    def test_only_returns_the_requesting_users_pieces(self, gql_client, user, other_user):
        _make_piece(other_user, "Someone Else's Bowl")
        mine = _make_piece(user, "My Bowl")

        page = _run(gql_client)["data"]["pieces"]
        assert page["count"] == 1
        assert page["results"][0]["id"] == str(mine.id)

    def test_anonymous_request_is_rejected(self, db):
        anon = APIClient()
        response = anon.post(
            "/api/graphql/",
            {"query": PIECES_QUERY, "variables": {}},
            format="json",
        )
        assert response.status_code == 200
        body = response.json()
        assert body.get("errors")
        assert body["data"] is None
