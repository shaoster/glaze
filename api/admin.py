import os

from adminsortable2.admin import SortableAdminBase, SortableInlineAdminMixin
from django import forms
from django.contrib import admin
from django.forms import widgets
from django.http import HttpRequest
from django.utils.html import format_html

from .models import GlazeCombination, GlazeCombinationLayer, GlazeType, Piece, PieceState, UserProfile
from .workflow import get_image_fields_for_global_model, get_public_global_models


class GlazeAdminSite(admin.AdminSite):
    """Custom admin site that surfaces a dedicated 'Public Libraries' section
    on the homepage for every model registered via PublicLibraryAdmin.

    The reorganisation only affects the main index (app_label=None); per-app
    sub-pages are left unchanged so model change-list URLs continue to work.
    """

    def get_app_list(self, request, app_label=None):
        app_list = super().get_app_list(request, app_label=app_label)
        if app_label is not None:
            # Leave app sub-pages (e.g. /admin/api/) intact.
            return app_list

        public_model_names = {m.__name__ for m in get_public_global_models()}
        public_models: list[dict] = []

        for app in app_list:
            if app['app_label'] == 'api':
                remaining = [m for m in app['models'] if m['object_name'] not in public_model_names]
                public_models.extend(m for m in app['models'] if m['object_name'] in public_model_names)
                app['models'] = remaining

        # Drop any app section that has become empty after the extraction.
        app_list = [app for app in app_list if app['models']]

        if public_models:
            public_models.sort(key=lambda m: m['name'])
            app_list.append({
                'name': 'Public Libraries',
                'app_label': 'public_libraries',
                'app_url': '',
                'has_module_perms': True,
                'models': public_models,
            })

        return app_list


# Swap the default admin site's class so all existing @admin.register and
# admin.site.register() calls automatically use the custom get_app_list
# without any changes to registration code or urls.py.
admin.site.__class__ = GlazeAdminSite


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'openid_subject')
    search_fields = ('user__username', 'user__email', 'openid_subject')


def _make_public_library_form(model_cls):
    """Return a ModelForm subclass for a public library model."""
    return type(
        f'{model_cls.__name__}PublicLibraryForm',
        (forms.ModelForm,),
        {'Meta': type('Meta', (), {'model': model_cls, 'fields': '__all__'})},
    )


class CloudinaryImageWidget(widgets.TextInput):
    """Text input that adds a Cloudinary Upload Widget button when configured.

    Renders a standard URL text input alongside an 'Upload Image' button and a
    live thumbnail preview.  The button opens the Cloudinary Upload Widget; on
    success the secure_url is written back into the text input and the preview
    is updated.

    If CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY are not set the button is
    omitted and only the plain text input is shown.
    """

    class Media:
        js = (
            'https://upload-widget.cloudinary.com/global/all.js',
            'admin/js/cloudinary_image_widget.js',
        )

    def render(self, name, value, attrs=None, renderer=None):
        cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
        api_key = os.environ.get('CLOUDINARY_API_KEY', '')

        folder = os.environ.get('CLOUDINARY_PUBLIC_UPLOAD_FOLDER', '').strip()

        final_attrs = dict(attrs or {})
        if cloud_name and api_key:
            final_attrs['data-cloudinary-cloud-name'] = cloud_name
            final_attrs['data-cloudinary-api-key'] = api_key
            if folder:
                final_attrs['data-cloudinary-folder'] = folder

        text_html = super().render(name, value, final_attrs, renderer)

        if not cloud_name or not api_key:
            return text_html

        if not folder:
            return format_html(
                '{}'
                '<br>'
                '<button type="button" disabled'
                ' title="Set CLOUDINARY_PUBLIC_UPLOAD_FOLDER to enable uploads"'
                ' style="margin-top:4px;cursor:not-allowed;">Upload Image</button>'
                '<span style="display:inline-flex;align-items:center;margin-left:8px;">'
                '<span style="background:#ba1a1a;color:#fff;font-size:0.8em;padding:2px 8px;border-radius:3px;">'
                'CLOUDINARY_PUBLIC_UPLOAD_FOLDER must be set to upload public library images from Django Admin'
                '</span></span>',
                text_html,
            )

        input_id = final_attrs.get('id', f'id_{name}')
        preview_id = f'preview-{input_id}'

        return format_html(
            '{}'
            '<br>'
            '<img id="{}" src="{}" style="display:{};max-height:80px;margin:4px 0;" alt="preview">'
            '<button type="button" class="cloudinary-upload-btn"'
            ' data-input-id="{}" data-preview-id="{}"'
            ' style="margin-top:4px;">Upload Image</button>',
            text_html,
            preview_id,
            value or '',
            'block' if value else 'none',
            input_id,
            preview_id,
        )


class PublicLibraryAdmin(admin.ModelAdmin):
    """Base admin for global types that support a shared public library.

    The list view is filtered to show only public objects (user IS NULL) so
    that the admin has a clean interface for managing the public library without
    seeing individual users' private records.  Private objects remain accessible
    via the regular ORM / shell.

    On save, rejects names that already exist as private objects for any user,
    listing the conflicting owners so the admin can coordinate a resolution.

    The `user` field is excluded from forms — public objects are always unowned
    and there is no meaningful value to show or edit.  Fields with type: image
    in workflow.yml automatically use CloudinaryImageWidget.
    """

    list_display = ('name', 'is_public_entry')
    search_fields = ('name',)
    exclude = ('user',)

    @admin.display(boolean=True, description='Public')
    def is_public_entry(self, obj) -> bool:
        return obj.user_id is None

    def get_queryset(self, request: HttpRequest):
        return super().get_queryset(request).filter(user__isnull=True)

    def get_form(self, request: HttpRequest, obj=None, change: bool = False, **kwargs):
        kwargs.setdefault('form', _make_public_library_form(self.model))
        form_class = super().get_form(request, obj, change=change, **kwargs)
        for field_name in get_image_fields_for_global_model(self.model):
            if field_name in form_class.base_fields:
                form_class.base_fields[field_name].widget = CloudinaryImageWidget()
        return form_class

    def save_model(self, request: HttpRequest, obj, form, change: bool) -> None:
        # Public library objects are always unowned.
        obj.user = None
        super().save_model(request, obj, form, change)


class GlazeCombinationLayerInline(SortableInlineAdminMixin, admin.TabularInline):
    """Inline editor for the ordered layers of a GlazeCombination.

    Rows can be dragged to reorder; the ``order`` field is managed automatically
    by adminsortable2 and is not shown as an editable column.

    The GlazeType queryset is restricted to public types when the parent
    combination is public (user=NULL), enforcing the public-only-references
    invariant at the form level as well as in model save().
    """

    model = GlazeCombinationLayer
    extra = 0
    fields = ('glaze_type',)

    class Media:
        css = {'all': ('admin/css/sortable_inline.css',)}
        js = ('admin/js/sortable_inline_notice.js',)

    def get_queryset(self, request: HttpRequest):
        return super().get_queryset(request).select_related('glaze_type')

    def formfield_for_foreignkey(self, db_field, request: HttpRequest, **kwargs):
        if db_field.name == 'glaze_type':
            # Detect whether the parent combination is public from the URL.
            # Fall back to public-only to be safe when context is unavailable.
            obj_id = request.resolver_match.kwargs.get('object_id')
            is_public = True
            if obj_id:
                try:
                    combo = GlazeCombination.objects.get(pk=obj_id)
                    is_public = combo.user_id is None
                except GlazeCombination.DoesNotExist:
                    pass
            if is_public:
                kwargs['queryset'] = GlazeType.objects.filter(user__isnull=True).order_by('name')
            else:
                kwargs['queryset'] = GlazeType.objects.order_by('name')
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_dbfield(self, db_field, request: HttpRequest, **kwargs):
        field = super().formfield_for_dbfield(db_field, request, **kwargs)
        # RelatedFieldWidgetWrapper is applied by formfield_for_dbfield after
        # formfield_for_foreignkey returns, so can_delete_related must be
        # suppressed here rather than in formfield_for_foreignkey.
        if db_field.name == 'glaze_type' and hasattr(field, 'widget'):
            field.widget.can_delete_related = False
        return field


class GlazeCombinationAdmin(SortableAdminBase, PublicLibraryAdmin):
    """Admin for the public GlazeCombination library.

    Layers are managed via the inline.  The computed ``name`` field is excluded
    from the edit form (it is stale until save and would be confusing); it is
    still visible in the list view via ``__str__``.
    """

    list_display = (
        '__str__',
        'is_food_safe',
        'runs',
        'highlights_grooves',
        'is_different_on_white_and_brown_clay',
        'is_public_entry',
    )
    list_filter = (
        'is_food_safe',
        'runs',
        'highlights_grooves',
        'is_different_on_white_and_brown_clay',
    )
    search_fields = ('name',)
    exclude = ('user', 'name')
    inlines = [GlazeCombinationLayerInline]

    def save_model(self, request: HttpRequest, obj, form, change: bool) -> None:
        """Save the combination; name will be recomputed in save_related."""
        super().save_model(request, obj, form, change)

    def save_related(self, request: HttpRequest, form, formsets, change: bool) -> None:
        """After all inlines are saved, refresh the computed name from the current layers."""
        super().save_related(request, form, formsets, change)
        obj = form.instance
        layer_names = list(
            obj.layers.order_by('order').values_list('glaze_type__name', flat=True)
        )
        from .models import GLAZE_COMBINATION_NAME_SEPARATOR
        obj.name = GLAZE_COMBINATION_NAME_SEPARATOR.join(layer_names)
        obj.save(update_fields=['name'])


admin.site.register(GlazeCombination, GlazeCombinationAdmin)

# Dynamically register PublicLibraryAdmin for every global declared public: true
# in workflow.yml.  Models that already have a custom admin class registered above
# are skipped so they keep their specialised configuration.
for _model_cls in get_public_global_models():
    if not admin.site.is_registered(_model_cls):
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
