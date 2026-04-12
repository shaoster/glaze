from django import forms
from django.contrib import admin
from django.http import HttpRequest

from .models import Piece, PieceState, UserProfile
from .workflow import get_public_global_models


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'openid_subject')
    search_fields = ('user__username', 'user__email', 'openid_subject')


def _make_public_library_form(model_cls):
    """Return a ModelForm subclass for a public library model.

    Adds clean_name validation that rejects names already taken by any user's
    private objects, providing a descriptive error to the admin.  The admin can
    see all scopes, so listing conflicting users here is not a privacy concern.
    """

    def clean_name(form_self):
        name = form_self.cleaned_data.get('name')
        if not name:
            return name
        conflicts = (
            model_cls.objects
            .filter(user__isnull=False, name=name)
            .select_related('user')
        )
        if conflicts.exists():
            user_list = ', '.join(str(c.user) for c in conflicts[:5])
            extra = f' and {conflicts.count() - 5} more' if conflicts.count() > 5 else ''
            raise forms.ValidationError(
                f"Cannot save public {model_cls.__name__} named \"{name}\": "
                f"the following user(s) already have a private entry with this name: "
                f"{user_list}{extra}. "
                f"Ask those users to remove their private copies first, or choose a "
                f"different name for the public entry."
            )
        return name

    return type(
        f'{model_cls.__name__}PublicLibraryForm',
        (forms.ModelForm,),
        {
            'Meta': type('Meta', (), {'model': model_cls, 'fields': '__all__'}),
            'clean_name': clean_name,
        },
    )


class PublicLibraryAdmin(admin.ModelAdmin):
    """Base admin for global types that support a shared public library.

    The list view is filtered to show only public objects (user IS NULL) so
    that the admin has a clean interface for managing the public library without
    seeing individual users' private records.  Private objects remain accessible
    via the regular ORM / shell.

    On save, rejects names that already exist as private objects for any user,
    listing the conflicting owners so the admin can coordinate a resolution.
    """

    list_display = ('name', 'is_public_entry')
    search_fields = ('name',)

    @admin.display(boolean=True, description='Public')
    def is_public_entry(self, obj) -> bool:
        return obj.user_id is None

    def get_queryset(self, request: HttpRequest):
        return super().get_queryset(request).filter(user__isnull=True)

    def get_form(self, request: HttpRequest, obj=None, change: bool = False, **kwargs):
        kwargs.setdefault('form', _make_public_library_form(self.model))
        return super().get_form(request, obj, change=change, **kwargs)

    def save_model(self, request: HttpRequest, obj, form, change: bool) -> None:
        # Public library objects are always unowned.
        obj.user = None
        super().save_model(request, obj, form, change)


# Dynamically register PublicLibraryAdmin for every global declared public: true
# in workflow.yml.  This means adding public: true to a new global in workflow.yml
# is sufficient — no manual admin.py change required.
for _model_cls in get_public_global_models():
    admin.site.register(_model_cls, PublicLibraryAdmin)


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
