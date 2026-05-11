import pytest

from api.models import ENTRY_STATE, SUCCESSORS, PieceState

# ---------------------------------------------------------------------------
# Model: PieceState sealed-state invariant
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestSealedState:
    def test_cannot_modify_past_state(self, piece):
        initial_state = piece.current_state
        PieceState.objects.create(piece=piece, state=SUCCESSORS[ENTRY_STATE][0])
        initial_state.refresh_from_db()
        initial_state.notes = "Retroactive edit"
        with pytest.raises(ValueError, match="sealed"):
            initial_state.save()

    def test_can_modify_current_state(self, piece):
        current = piece.current_state
        current.notes = "Updated"
        current.save()  # should not raise
        current.refresh_from_db()
        assert current.notes == "Updated"

    def test_bypass_with_allow_sealed_edit(self, piece):
        initial_state = piece.current_state
        PieceState.objects.create(piece=piece, state=SUCCESSORS[ENTRY_STATE][0])
        initial_state.refresh_from_db()
        initial_state.notes = "Admin override"
        initial_state.save(allow_sealed_edit=True)  # should not raise
        initial_state.refresh_from_db()
        assert initial_state.notes == "Admin override"

    def test_admin_form_rejects_sealed_state_without_override(self, piece):
        from django.contrib.admin.sites import AdminSite

        from api.admin import PieceStateAdmin

        initial_state = piece.current_state
        PieceState.objects.create(piece=piece, state=SUCCESSORS[ENTRY_STATE][0])
        initial_state.refresh_from_db()

        admin = PieceStateAdmin(PieceState, AdminSite())
        form_class = admin.get_form(None, obj=initial_state, change=True)
        form = form_class(
            instance=initial_state,
            data={
                "user": initial_state.user.id,
                "piece": piece.id,
                "state": initial_state.state,
                "notes": "Retroactive edit via form",
                "allow_sealed_edit": False,
            },
        )
        assert not form.is_valid()
        assert (
            "This state is sealed: only the current state of a piece may be modified."
            in form.errors["__all__"][0]
        )

    def test_admin_form_allows_sealed_state_with_override(self, piece):
        from django.contrib.admin.sites import AdminSite

        from api.admin import PieceStateAdmin

        initial_state = piece.current_state
        PieceState.objects.create(piece=piece, state=SUCCESSORS[ENTRY_STATE][0])
        initial_state.refresh_from_db()

        admin = PieceStateAdmin(PieceState, AdminSite())
        form_class = admin.get_form(None, obj=initial_state, change=True)
        form = form_class(
            instance=initial_state,
            data={
                "user": initial_state.user.id,
                "piece": piece.id,
                "state": initial_state.state,
                "notes": "Retroactive edit via form",
                "allow_sealed_edit": True,
            },
        )
        form.is_valid()
        if "__all__" in form.errors:
            assert "This state is sealed" not in str(form.errors["__all__"])
