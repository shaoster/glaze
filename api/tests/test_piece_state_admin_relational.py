import pytest
from django import forms
from django.contrib.admin.sites import AdminSite

from api.admin import PieceStateAdmin
from api.models import GlazeCombination, Piece, PieceState
from api.widgets import WorkflowStateWidget


@pytest.mark.django_db
def test_piece_state_admin_form_has_unified_fields(user):
    # Create a piece and a state that has relational fields
    piece = Piece.objects.create(user=user, name="Test Piece")
    state = PieceState.objects.create(
        user=user,
        piece=piece,
        state="wheel_thrown",  # 'wheel_thrown' has 'clay_body' ref
    )

    admin = PieceStateAdmin(PieceState, AdminSite())
    form_class = admin.get_form(None, obj=state, change=True)
    form = form_class(instance=state)

    # Check if 'unified_custom_fields' is in the form fields
    assert "unified_custom_fields" in form.fields
    assert isinstance(form.fields["unified_custom_fields"].widget, WorkflowStateWidget)


@pytest.mark.django_db
def test_piece_state_admin_save_unified_relational_fields(user):
    from django.apps import apps

    piece = Piece.objects.create(user=user, name="Test Piece")
    state = PieceState.objects.create(user=user, piece=piece, state="wheel_thrown")
    from api.models import ClayBody

    cb = ClayBody.objects.create(user=user, name="Test Clay")

    admin = PieceStateAdmin(PieceState, AdminSite())
    form_class = admin.get_form(None, obj=state, change=True)

    # Simulate saving the form with unified payload from React
    form_data = {
        "user": user.id,
        "piece": piece.id,
        "state": "wheel_thrown",
        "custom_fields": "{}",
        "unified_custom_fields": {
            "custom_fields": {"clay_weight_lbs": 2.5},
            "global_ref_pks": {"clay_body": str(cb.id)},
        },
        "allow_sealed_edit": True,
    }
    form = form_class(data=form_data, instance=state)
    assert form.is_valid(), form.errors

    admin.save_model(None, state, form, True)

    # Verify junction row exists
    ref_model_cls = apps.get_model("api", "PieceStateClayBodyRef")
    ref = ref_model_cls.objects.get(piece_state=state, field_name="clay_body")
    assert ref.clay_body == cb
    assert state.custom_fields == {"clay_weight_lbs": 2.5}


@pytest.mark.django_db
def test_piece_state_admin_load_unified_fields(user):
    from django.apps import apps

    piece = Piece.objects.create(user=user, name="Test Piece")
    # 'wheel_thrown' has 'clay_weight_lbs' inline field and 'clay_body' global ref
    state = PieceState.objects.create(
        user=user, piece=piece, state="wheel_thrown", custom_fields={"clay_weight_lbs": 1.5}
    )
    from api.models import ClayBody

    cb = ClayBody.objects.create(user=user, name="Test Clay")
    ref_model_cls = apps.get_model("api", "PieceStateClayBodyRef")
    ref_model_cls.objects.create(
        piece_state=state, field_name="clay_body", clay_body=cb
    )

    admin = PieceStateAdmin(PieceState, AdminSite())
    form_class = admin.get_form(None, obj=state, change=True)
    form = form_class(instance=state)

    initial_unified = form.initial["unified_custom_fields"]
    assert initial_unified["custom_fields"] == {"clay_weight_lbs": 1.5}
    assert initial_unified["global_ref_values"]["clay_body"]["id"] == str(cb.id)
