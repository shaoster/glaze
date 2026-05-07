import json
import os
import re
from typing import ClassVar

import cloudinary
from adminsortable2.admin import SortableAdminBase, SortableInlineAdminMixin
from cloudinary import CloudinaryImage
from django import forms
from django.contrib import admin
from django.forms import widgets
from django.http import HttpRequest
from django.utils.html import format_html
from import_export import fields, resources
from import_export.admin import ExportMixin

from .models import (
    FiringTemperature,
    GlazeCombination,
    GlazeCombinationLayer,
    GlazeMethod,
    GlazeType,
    Piece,
    PieceState,
    UserProfile,
)
from .serializers import PieceStateSerializer
from .utils import (
    image_to_dict,
    normalize_image_payload,
    sync_glaze_type_singleton_combination,
)
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
            if app["app_label"] == "api":
                remaining = [
                    m
                    for m in app["models"]
                    if m["object_name"] not in public_model_names
                ]
                public_models.extend(
                    m for m in app["models"] if m["object_name"] in public_model_names
                )
                app["models"] = remaining

        # Drop any app section that has become empty after the extraction.
        app_list = [app for app in app_list if app["models"]]

        if public_models:
            public_models.sort(key=lambda m: m["name"])
            app_list.append(
                {
                    "name": "Public Libraries",
                    "app_label": "public_libraries",
                    "app_url": "",
                    "has_module_perms": True,
                    "models": public_models,
                }
            )

        return app_list


# Swap the default admin site's class so all existing @admin.register and
# admin.site.register() calls automatically use the custom get_app_list
# without any changes to registration code or urls.py.
admin.site.__class__ = GlazeAdminSite


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "openid_subject")
    search_fields = ("user__username", "user__email", "openid_subject")


def _make_public_library_form(model_cls):
    """Return a ModelForm subclass for a public library model."""
    return type(
        f"{model_cls.__name__}PublicLibraryForm",
        (forms.ModelForm,),
        {"Meta": type("Meta", (), {"model": model_cls, "fields": "__all__"})},
    )


def _cloudinary_public_id(url: str) -> str | None:
    """Extract the Cloudinary public_id from a delivery URL.

    Handles URLs with or without a version segment (v1234567890/).
    Returns None for non-Cloudinary or malformed URLs.
    """
    match = re.search(r"/image/upload/(?:v\d+/)?(.+?)(?:\.[^./]+)?$", url)
    return match.group(1) if match else None


def _image_url(value: dict | str | None) -> str:
    """Extract a plain URL string from an image field value.

    Accepts the new dict format ``{"url": "...", "cloudinary_public_id": "..."}``
    as well as legacy plain URL strings (for robustness during any transition).
    Returns an empty string for missing/None values.
    """
    if not value:
        return ""
    image_payload = image_to_dict(value)
    if image_payload:
        return image_payload.get("url", "")
    if isinstance(value, dict):
        return value.get("url", "")
    return value  # legacy string


def _image_cloud_name(value: dict | str | None) -> str:
    image_payload = image_to_dict(value)
    if image_payload:
        return image_payload.get("cloud_name") or os.environ.get(
            "CLOUDINARY_CLOUD_NAME", ""
        )
    if isinstance(value, dict):
        return value.get("cloud_name") or os.environ.get("CLOUDINARY_CLOUD_NAME", "")
    return os.environ.get("CLOUDINARY_CLOUD_NAME", "")


def _cloudinary_preview_url(value: dict | str | None) -> str:
    """Return a JPG thumbnail URL (200×200 fill) for a Cloudinary delivery URL."""
    url = _image_url(value)
    cloud_name = _image_cloud_name(value)
    if not url or not cloud_name:
        return url
    image_payload = image_to_dict(value)
    public_id = (
        (value.get("cloudinary_public_id") if isinstance(value, dict) else None)
        or (image_payload or {}).get("cloudinary_public_id")
        or _cloudinary_public_id(url)
    )
    if not public_id:
        return url
    cloudinary.config(cloud_name=cloud_name)
    return CloudinaryImage(public_id).build_url(
        width=200, height=200, crop="fill", format="jpg", secure=True
    )


def _cloudinary_lightbox_url(value: dict | str | None) -> str:
    """Return a full-size JPG URL suitable for a lightbox modal."""
    url = _image_url(value)
    cloud_name = _image_cloud_name(value)
    if not url or not cloud_name:
        return url
    image_payload = image_to_dict(value)
    if isinstance(value, dict) and "cloudinary_public_id" not in value:
        raise AssertionError("image values must include cloudinary_public_id")
    public_id = (
        (value.get("cloudinary_public_id") if isinstance(value, dict) else None)
        or (image_payload or {}).get("cloudinary_public_id")
        or _cloudinary_public_id(url)
    )
    if not public_id:
        return url
    cloudinary.config(cloud_name=cloud_name)
    return CloudinaryImage(public_id).build_url(format="jpg", secure=True)


def _admin_image_preview(value: dict | str | None) -> str:
    if not value:
        return "—"
    preview_src = _cloudinary_preview_url(value)
    lightbox_src = _cloudinary_lightbox_url(value)
    if not preview_src:
        return "—"
    return format_html(
        '<img src="{}" data-full-url="{}" class="cloudinary-preview"'
        ' style="display:block;max-height:48px;max-width:64px;object-fit:cover;'
        'cursor:pointer;border-radius:4px;" alt="preview">',
        preview_src,
        lightbox_src,
    )


class CloudinaryImageWidget(widgets.TextInput):
    """Text input that adds a Cloudinary Upload Widget button when configured.

    The field value is a JSON object ``{"url": "...", "cloudinary_public_id": "..."}``.
    The text input stores the JSON string representation; the JS upload handler
    writes new uploads in that format and the preview reads the url from it.

    If CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY are not set the button is
    omitted and only the plain text input is shown.
    """

    class Media:
        js = (
            "https://upload-widget.cloudinary.com/global/all.js",
            "admin/js/cloudinary_image_widget.js",
        )

    def format_value(self, value):
        """Encode a dict value to a JSON string for display in the text input."""
        if isinstance(value, str):
            return value
        image_payload = image_to_dict(value)
        if image_payload:
            return json.dumps(image_payload)
        if isinstance(value, dict):
            return json.dumps(value)
        return value  # None or already a string

    def render(self, name, value, attrs=None, renderer=None):
        cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
        api_key = os.environ.get("CLOUDINARY_API_KEY", "")

        folder = os.environ.get("CLOUDINARY_PUBLIC_UPLOAD_FOLDER", "").strip()

        final_attrs = dict(attrs or {})
        if cloud_name and api_key:
            final_attrs["data-cloudinary-cloud-name"] = cloud_name
            final_attrs["data-cloudinary-api-key"] = api_key
            if folder:
                final_attrs["data-cloudinary-folder"] = folder

        text_html = super().render(name, value, final_attrs, renderer)

        if not cloud_name or not api_key:
            return text_html

        if not folder:
            return format_html(
                "{}"
                "<br>"
                '<button type="button" disabled'
                ' title="Set CLOUDINARY_PUBLIC_UPLOAD_FOLDER to enable uploads"'
                ' style="margin-top:4px;cursor:not-allowed;">Upload Image</button>'
                '<span style="display:inline-flex;align-items:center;margin-left:8px;">'
                '<span style="background:#ba1a1a;color:#fff;font-size:0.8em;padding:2px 8px;border-radius:3px;">'
                "CLOUDINARY_PUBLIC_UPLOAD_FOLDER must be set to upload public library images from Django Admin"
                "</span></span>",
                text_html,
            )

        input_id = final_attrs.get("id", f"id_{name}")
        preview_id = f"preview-{input_id}"

        preview_src = _cloudinary_preview_url(value) if value else ""
        lightbox_src = _cloudinary_lightbox_url(value) if value else ""

        return format_html(
            '<div style="display:flex;flex-direction:column;align-items:flex-start;gap:4px;">'
            "{}"
            '<img id="{}" src="{}" data-full-url="{}"'
            ' class="cloudinary-preview"'
            ' style="display:{};max-height:80px;cursor:pointer;border-radius:4px;" alt="preview">'
            '<div style="display:flex;gap:4px;">'
            '<button type="button" class="cloudinary-upload-btn"'
            ' data-input-id="{}" data-preview-id="{}">Upload Image</button>'
            '<button type="button" class="cloudinary-clear-btn"'
            ' data-input-id="{}" data-preview-id="{}"'
            ' style="display:{};">Remove Image</button>'
            "</div>"
            "</div>",
            text_html,
            preview_id,
            preview_src,
            lightbox_src,
            "block" if value else "none",
            input_id,
            preview_id,
            input_id,
            preview_id,
            "inline-block" if value else "none",
        )


class CloudinaryImageFormField(forms.Field):
    widget = CloudinaryImageWidget

    def prepare_value(self, value):
        import uuid

        if isinstance(value, uuid.UUID):
            from api.models import Image

            try:
                value = Image.objects.get(pk=value)
            except Image.DoesNotExist:
                value = None
        image_payload = image_to_dict(value)
        if image_payload:
            return json.dumps(image_payload)
        return super().prepare_value(value)

    def clean(self, value):
        value = super().clean(value)
        if value in self.empty_values:
            return None
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                value = {"url": value}
        return normalize_image_payload(value)


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

    list_display: ClassVar[tuple[str, ...]] = ("name", "is_public_entry")  # type: ignore[misc]
    exclude: ClassVar[tuple[str, ...]] = ("user",)

    @admin.display(boolean=True, description="Public")
    def is_public_entry(self, obj) -> bool:
        return obj.user_id is None

    def get_queryset(self, request: HttpRequest):
        return super().get_queryset(request).filter(user__isnull=True)

    def get_form(self, request: HttpRequest, obj=None, change: bool = False, **kwargs):
        kwargs.setdefault("form", _make_public_library_form(self.model))
        form_class = super().get_form(request, obj, change=change, **kwargs)
        for field_name in get_image_fields_for_global_model(self.model):
            if field_name in form_class.base_fields:
                form_class.base_fields[field_name] = CloudinaryImageFormField(
                    required=False,
                    label=form_class.base_fields[field_name].label,
                    help_text=form_class.base_fields[field_name].help_text,
                )
        return form_class

    def save_model(self, request: HttpRequest, obj, form, change: bool) -> None:
        # Public library objects are always unowned.
        obj.user = None
        super().save_model(request, obj, form, change)


class GlazeTypeAdmin(PublicLibraryAdmin):
    """Admin for the public GlazeType library.

    In addition to the standard PublicLibraryAdmin behaviour, creating or
    updating a public GlazeType automatically keeps a matching single-layer
    public GlazeCombination in sync:

    - **Create**: a new GlazeCombination (user=None, name=glaze_type.name) with
      one GlazeCombinationLayer pointing at the new type is created, with all
      shared property fields copied over.
    - **Update**: the corresponding single-layer combination's properties are
      updated to match.  If the GlazeType name changed, the combination is
      renamed as well.
    """

    list_display: ClassVar[tuple[str, ...]] = (  # type: ignore[misc]
        "name",
        "test_tile_image_preview",
        "is_public_entry",
    )

    @admin.display(description="Test tile image")
    def test_tile_image_preview(self, obj: GlazeType) -> str:
        return _admin_image_preview(obj.test_tile_image)

    def save_model(
        self, request: HttpRequest, obj: GlazeType, form, change: bool
    ) -> None:
        # Capture the old name before super() persists any changes.
        old_name: str | None = None
        if change and obj.pk:
            old_name = (
                GlazeType.objects.filter(pk=obj.pk)
                .values_list("name", flat=True)
                .first()
            )

        super().save_model(request, obj, form, change)
        sync_glaze_type_singleton_combination(obj, old_name=old_name)


admin.site.register(GlazeType, GlazeTypeAdmin)


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
    fields = ("glaze_type", "glaze_method")

    class Media:
        css = {"all": ("admin/css/sortable_inline.css",)}
        js = ("admin/js/sortable_inline_notice.js",)

    def get_queryset(self, request: HttpRequest):
        return (
            super().get_queryset(request).select_related("glaze_type", "glaze_method")
        )

    def formfield_for_foreignkey(self, db_field, request: HttpRequest, **kwargs):
        if db_field.name == "glaze_type":
            # GlazeCombinationAdmin extends PublicLibraryAdmin, whose get_queryset
            # filters to user__isnull=True. Private combinations are 404 before
            # the form is built, so layers may only reference public glaze types.
            kwargs["queryset"] = GlazeType.objects.filter(user__isnull=True).order_by(
                "name"
            )
        elif db_field.name == "glaze_method":
            # GlazeMethod is private-only; public combination layers must leave it
            # null. Show all methods for informational purposes but the model save()
            # will reject a non-null method on a public combination.
            kwargs["queryset"] = GlazeMethod.objects.order_by("name")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def formfield_for_dbfield(self, db_field, request: HttpRequest, **kwargs):
        field = super().formfield_for_dbfield(db_field, request, **kwargs)
        # RelatedFieldWidgetWrapper is applied by formfield_for_dbfield after
        # formfield_for_foreignkey returns, so can_delete_related must be
        # suppressed here rather than in formfield_for_foreignkey.
        if db_field.name in ("glaze_type", "glaze_method") and hasattr(field, "widget"):
            if field is not None and hasattr(field, "widget"):
                setattr(field.widget, "can_delete_related", False)
        return field


class GlazeCombinationAdmin(SortableAdminBase, PublicLibraryAdmin):
    """Admin for the public GlazeCombination library.

    Layers are managed via the inline.  The computed ``name`` field is excluded
    from the edit form (it is stale until save and would be confusing); it is
    still visible in the list view via ``__str__``.
    """

    list_display: ClassVar[tuple[str, ...]] = (  # type: ignore[misc]
        "__str__",
        "test_tile_image_preview",
        "firing_temperature",
        "is_food_safe",
        "runs",
        "highlights_grooves",
        "is_different_on_white_and_brown_clay",
        "is_public_entry",
    )
    list_filter = (
        "firing_temperature",
        "is_food_safe",
        "runs",
        "highlights_grooves",
        "is_different_on_white_and_brown_clay",
    )
    search_fields = ("name",)
    exclude = ("user", "name")
    inlines = [GlazeCombinationLayerInline]

    @admin.display(description="Test tile image")
    def test_tile_image_preview(self, obj: GlazeCombination) -> str:
        return _admin_image_preview(obj.test_tile_image)

    def formfield_for_foreignkey(self, db_field, request: HttpRequest, **kwargs):
        if db_field.name == "firing_temperature":
            kwargs["queryset"] = FiringTemperature.objects.filter(
                user__isnull=True
            ).order_by("name")
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def save_model(self, request: HttpRequest, obj, form, change: bool) -> None:
        """Save the combination; name will be recomputed in save_related."""
        super().save_model(request, obj, form, change)

    def save_related(self, request: HttpRequest, form, formsets, change: bool) -> None:
        """After all inlines are saved, refresh the computed name from the current layers."""
        super().save_related(request, form, formsets, change)
        obj = form.instance
        layer_names = list(
            obj.layers.order_by("order").values_list("glaze_type__name", flat=True)
        )
        from .models import COMPOSITE_NAME_SEPARATOR

        obj.name = COMPOSITE_NAME_SEPARATOR.join(layer_names)
        obj.save(update_fields=["name"])


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
    readonly_fields = (
        "id",
        "state",
        "created",
        "last_modified",
        "notes",
        "image_list",
        "custom_fields",
    )
    # Past states are sealed — edits go through PieceStateAdmin with the override checkbox.
    can_delete = False
    can_change = False

    def has_change_permission(self, request: HttpRequest, obj: object = None) -> bool:
        return self.can_change

    @admin.display(description="Images")
    def image_list(self, obj: PieceState) -> str:
        return json.dumps(
            [
                {
                    **(image_to_dict(link.image) or {}),
                    "caption": link.caption,
                    "created": link.created.isoformat(),
                }
                for link in obj.image_links.select_related("image").order_by(
                    "order", "pk"
                )
            ],
            default=str,
        )


class PieceResource(resources.ModelResource):
    current_state = fields.Field(column_name="current_state")
    current_location = fields.Field(column_name="current_location")
    state_count = fields.Field(column_name="state_count")
    history = fields.Field(column_name="history")

    class Meta:
        model = Piece
        fields = (
            "id",
            "user__email",
            "user__username",
            "name",
            "current_state",
            "current_location",
            "state_count",
            "history",
            "created",
            "fields_last_modified",
            "thumbnail",
            "workflow_version",
        )
        export_order = (
            "id",
            "user__email",
            "user__username",
            "name",
            "current_state",
            "current_location",
            "state_count",
            "history",
            "created",
            "fields_last_modified",
            "thumbnail",
            "workflow_version",
        )

    def dehydrate_current_state(self, obj: Piece) -> str:
        current = obj.current_state
        return current.state if current else ""

    def dehydrate_current_location(self, obj: Piece) -> str:
        return (
            obj.current_location.name
            if obj.current_location_id and obj.current_location
            else ""
        )

    def dehydrate_state_count(self, obj: Piece) -> int:
        return obj.states.count()

    def dehydrate_history(self, obj: Piece) -> list[dict]:
        history = obj.states.order_by("created")
        # DRF returns ReturnList / ReturnDict wrappers here; convert them to
        # plain Python containers so tablib's JSON/YAML exporters can emit them.
        return json.loads(
            json.dumps(PieceStateSerializer(history, many=True).data, default=str)
        )

    def dehydrate_thumbnail(self, obj: Piece) -> dict | None:
        return image_to_dict(obj.thumbnail)


class PieceStateResource(resources.ModelResource):
    piece_id = fields.Field(column_name="piece_id")
    piece_name = fields.Field(column_name="piece_name")
    piece_workflow_version = fields.Field(column_name="piece_workflow_version")
    images = fields.Field(column_name="images")

    class Meta:
        model = PieceState
        fields = (
            "id",
            "piece_id",
            "piece_name",
            "piece_workflow_version",
            "user__email",
            "user__username",
            "state",
            "notes",
            "created",
            "last_modified",
            "images",
            "custom_fields",
        )
        export_order = (
            "id",
            "piece_id",
            "piece_name",
            "piece_workflow_version",
            "user__email",
            "user__username",
            "state",
            "notes",
            "created",
            "last_modified",
            "images",
            "custom_fields",
        )

    def dehydrate_piece_id(self, obj: PieceState) -> str:
        return str(obj.piece_id)

    def dehydrate_piece_name(self, obj: PieceState) -> str:
        return obj.piece.name

    def dehydrate_piece_workflow_version(self, obj: PieceState) -> str:
        return obj.piece.workflow_version

    def dehydrate_images(self, obj: PieceState) -> list[dict]:
        return json.loads(
            json.dumps(PieceStateSerializer(obj).data["images"], default=str)
        )


@admin.register(Piece)
class PieceAdmin(ExportMixin, admin.ModelAdmin):
    resource_classes = [PieceResource]
    list_display = (
        "name",
        "user",
        "get_current_state",
        "created",
        "fields_last_modified",
    )
    readonly_fields = ("id", "created", "fields_last_modified")
    inlines = [PieceStateInline]

    @admin.display(description="Current state")
    def get_current_state(self, obj: Piece) -> str:
        cs = obj.current_state
        return cs.state if cs else "—"


class PieceStateAdminForm(forms.ModelForm):
    allow_sealed_edit = forms.BooleanField(
        required=False,
        label="Allow sealed edit",
        help_text=(
            "Check to allow saving this state even if it is not the current state of its piece. "
            "Use only for exceptional admin corrections — this bypasses the sealed-state invariant."
        ),
    )

    class Meta:
        model = PieceState
        fields = "__all__"


@admin.register(PieceState)
class PieceStateAdmin(ExportMixin, admin.ModelAdmin):
    resource_classes = [PieceStateResource]
    form = PieceStateAdminForm
    list_display = ("piece", "state", "created", "last_modified")
    readonly_fields = ("id", "piece", "created", "last_modified")
    list_select_related = ("piece",)

    def save_model(
        self,
        request: HttpRequest,
        obj: PieceState,
        form: PieceStateAdminForm,
        change: bool,
    ) -> None:
        allow_sealed = form.cleaned_data.get("allow_sealed_edit", False)
        obj.save(allow_sealed_edit=bool(allow_sealed))
