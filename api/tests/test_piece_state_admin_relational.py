import pytest
from django import forms
from django.contrib.admin.sites import AdminSite

from api.admin import PieceStateAdmin, _get_custom_form_fields
from api.models import GlazeCombination, Piece, PieceState


@pytest.mark.django_db
def test_piece_state_admin_form_has_relational_fields(user):
    # Create a piece and a state that has relational fields
    piece = Piece.objects.create(user=user, name="Test Piece")
    state = PieceState.objects.create(
        user=user,
        piece=piece,
        state="glazed",  # 'glazed' has 'glaze_combination' ref
    )

    admin = PieceStateAdmin(PieceState, AdminSite())
    form_class = admin.get_form(None, obj=state, change=True)
    form = form_class(instance=state)

    # Check if 'custom_glaze_combination' is in the form fields
    assert "custom_glaze_combination" in form.fields
    assert isinstance(form.fields["custom_glaze_combination"], forms.ModelChoiceField)
    assert form.fields["custom_glaze_combination"].queryset.model == GlazeCombination


@pytest.mark.django_db
def test_get_custom_form_fields_includes_relational_fields():
    # 'glazed' state has 'glaze_combination' which is a global ref
    fields = _get_custom_form_fields("glazed")

    assert "custom_glaze_combination" in fields
    assert isinstance(fields["custom_glaze_combination"], forms.ModelChoiceField)
    assert fields["custom_glaze_combination"].queryset.model == GlazeCombination


@pytest.mark.django_db
def test_piece_state_admin_save_relational_fields(user):
    from api.models import PieceStateGlazeCombinationRef

    piece = Piece.objects.create(user=user, name="Test Piece")
    state = PieceState.objects.create(user=user, piece=piece, state="glazed")
    gc = GlazeCombination.objects.create(user=user, name="Test Glaze")

    admin = PieceStateAdmin(PieceState, AdminSite())
    form_class = admin.get_form(None, obj=state, change=True)

    # Simulate saving the form
    form_data = {
        "user": user.id,
        "piece": piece.id,
        "state": "glazed",
        "custom_fields": "{}",
        "custom_glaze_combination": gc.id,
        "allow_sealed_edit": True,
    }
    form = form_class(data=form_data, instance=state)
    assert form.is_valid(), form.errors

    admin.save_model(None, state, form, True)

    # Verify junction row exists
    ref = PieceStateGlazeCombinationRef.objects.get(
        piece_state=state, field_name="glaze_combination"
    )
    assert ref.glaze_combination == gc


@pytest.mark.django_db
def test_piece_state_admin_load_relational_fields(user):
    from api.models import PieceStateGlazeCombinationRef

    piece = Piece.objects.create(user=user, name="Test Piece")
    state = PieceState.objects.create(user=user, piece=piece, state="glazed")
    gc = GlazeCombination.objects.create(user=user, name="Test Glaze")
    PieceStateGlazeCombinationRef.objects.create(
        piece_state=state, field_name="glaze_combination", glaze_combination=gc
    )

    admin = PieceStateAdmin(PieceState, AdminSite())
    form_class = admin.get_form(None, obj=state, change=True)
    form = form_class(instance=state)

    assert form.initial["custom_glaze_combination"] == gc.id
