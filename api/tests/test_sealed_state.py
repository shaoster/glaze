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
        initial_state.notes = 'Retroactive edit'
        with pytest.raises(ValueError, match='sealed'):
            initial_state.save()

    def test_can_modify_current_state(self, piece):
        current = piece.current_state
        current.notes = 'Updated'
        current.save()  # should not raise
        current.refresh_from_db()
        assert current.notes == 'Updated'

    def test_bypass_with_allow_sealed_edit(self, piece):
        initial_state = piece.current_state
        PieceState.objects.create(piece=piece, state=SUCCESSORS[ENTRY_STATE][0])
        initial_state.refresh_from_db()
        initial_state.notes = 'Admin override'
        initial_state.save(allow_sealed_edit=True)  # should not raise
        initial_state.refresh_from_db()
        assert initial_state.notes == 'Admin override'
