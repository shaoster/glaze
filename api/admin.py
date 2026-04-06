from django import forms
from django.contrib import admin
from django.http import HttpRequest

from .models import Piece, PieceState, UserProfile


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'openid_subject')
    search_fields = ('user__username', 'user__email', 'openid_subject')


class PieceStateInline(admin.TabularInline):
    model = PieceState
    extra = 0
    readonly_fields = ('id', 'state', 'created', 'last_modified', 'notes', 'images', 'additional_fields')
    # Past states are sealed — edits go through PieceStateAdmin with the override checkbox.
    can_delete = False

    def has_change_permission(self, request: HttpRequest, obj: object = None) -> bool:
        return False


@admin.register(Piece)
class PieceAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'get_current_state', 'created', 'fields_last_modified')
    readonly_fields = ('id', 'created', 'fields_last_modified')
    inlines = [PieceStateInline]

    @admin.display(description='Current state')
    def get_current_state(self, obj: Piece) -> str:
        cs = obj.current_state
        return cs.state if cs else '—'


class PieceStateAdminForm(forms.ModelForm):
    allow_sealed_edit = forms.BooleanField(
        required=False,
        label='Allow sealed edit',
        help_text=(
            'Check to allow saving this state even if it is not the current state of its piece. '
            'Use only for exceptional admin corrections — this bypasses the sealed-state invariant.'
        ),
    )

    class Meta:
        model = PieceState
        fields = '__all__'


@admin.register(PieceState)
class PieceStateAdmin(admin.ModelAdmin):
    form = PieceStateAdminForm
    list_display = ('piece', 'state', 'created', 'last_modified')
    readonly_fields = ('id', 'piece', 'created', 'last_modified')
    list_select_related = ('piece',)

    def save_model(
        self,
        request: HttpRequest,
        obj: PieceState,
        form: PieceStateAdminForm,
        change: bool,
    ) -> None:
        allow_sealed = form.cleaned_data.get('allow_sealed_edit', False)
        obj.save(allow_sealed_edit=bool(allow_sealed))
