import uuid

from django.conf import settings
from django.db import migrations, models
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime


def _normalize_payload(value):
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return {"url": value, "cloudinary_public_id": None, "cloud_name": None}
    if isinstance(value, dict):
        url = (value.get("url") or "").strip()
        if not url:
            return None
        return {
            "url": url,
            "cloudinary_public_id": value.get("cloudinary_public_id") or None,
            "cloud_name": value.get("cloud_name") or None,
        }
    return None


def _get_or_create_image(Image, value, user_id=None):
    payload = _normalize_payload(value)
    if payload is None:
        return None
    cloud_name = payload["cloud_name"]
    public_id = payload["cloudinary_public_id"]
    defaults = {"url": payload["url"], "user_id": user_id}
    if cloud_name and public_id:
        image, _ = Image.objects.update_or_create(
            cloud_name=cloud_name,
            cloudinary_public_id=public_id,
            defaults=defaults,
        )
        return image
    image, _ = Image.objects.get_or_create(
        url=payload["url"],
        cloudinary_public_id=public_id,
        defaults={"cloud_name": cloud_name, "user_id": user_id},
    )
    return image


def _coerce_datetime(value):
    if value is None:
        return timezone.now()
    if hasattr(value, "isoformat"):
        return value
    if isinstance(value, str):
        parsed = parse_datetime(value)
        if parsed is not None:
            return parsed
    return timezone.now()


def forwards(apps, schema_editor):
    Image = apps.get_model("api", "Image")
    Piece = apps.get_model("api", "Piece")
    PieceState = apps.get_model("api", "PieceState")
    PieceStateImage = apps.get_model("api", "PieceStateImage")
    GlazeType = apps.get_model("api", "GlazeType")
    GlazeCombination = apps.get_model("api", "GlazeCombination")

    for piece in Piece.objects.exclude(thumbnail_legacy__isnull=True).iterator():
        image = _get_or_create_image(
            Image, piece.thumbnail_legacy, user_id=piece.user_id
        )
        if image is not None:
            Piece.objects.filter(pk=piece.pk).update(thumbnail=image)

    for model_cls in (GlazeType, GlazeCombination):
        for obj in model_cls.objects.exclude(
            test_tile_image_legacy__isnull=True
        ).iterator():
            image = _get_or_create_image(
                Image,
                obj.test_tile_image_legacy,
                user_id=obj.user_id,
            )
            if image is not None:
                model_cls.objects.filter(pk=obj.pk).update(test_tile_image=image)

    for state in PieceState.objects.exclude(images_legacy=[]).iterator():
        images = state.images_legacy or []
        for order, payload in enumerate(images):
            image = _get_or_create_image(Image, payload, user_id=state.user_id)
            if image is None:
                continue
            PieceStateImage.objects.create(
                piece_state=state,
                image=image,
                caption=(payload.get("caption") or "")
                if isinstance(payload, dict)
                else "",
                created=_coerce_datetime(
                    payload.get("created") if isinstance(payload, dict) else None
                ),
                order=order,
            )


def backwards(apps, schema_editor):
    Image = apps.get_model("api", "Image")
    Piece = apps.get_model("api", "Piece")
    PieceState = apps.get_model("api", "PieceState")
    PieceStateImage = apps.get_model("api", "PieceStateImage")
    GlazeType = apps.get_model("api", "GlazeType")
    GlazeCombination = apps.get_model("api", "GlazeCombination")

    def image_payload(image_id):
        if not image_id:
            return None
        image = Image.objects.get(pk=image_id)
        return {
            "url": image.url,
            "cloudinary_public_id": image.cloudinary_public_id,
            "cloud_name": image.cloud_name,
        }

    for piece in Piece.objects.exclude(thumbnail__isnull=True).iterator():
        Piece.objects.filter(pk=piece.pk).update(
            thumbnail_legacy=image_payload(piece.thumbnail_id)
        )

    for model_cls in (GlazeType, GlazeCombination):
        for obj in model_cls.objects.exclude(test_tile_image__isnull=True).iterator():
            model_cls.objects.filter(pk=obj.pk).update(
                test_tile_image_legacy=image_payload(obj.test_tile_image_id)
            )

    for state in PieceState.objects.iterator():
        images = []
        for link in PieceStateImage.objects.filter(piece_state=state).order_by(
            "order", "pk"
        ):
            payload = image_payload(link.image_id)
            if payload is None:
                continue
            images.append(
                {
                    **payload,
                    "caption": link.caption,
                    "created": link.created.isoformat(),
                }
            )
        if images:
            PieceState.objects.filter(pk=state.pk).update(images_legacy=images)


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0003_rename_custom_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Image",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("url", models.CharField(max_length=2048)),
                (
                    "cloudinary_public_id",
                    models.CharField(blank=True, max_length=1024, null=True),
                ),
                ("cloud_name", models.CharField(blank=True, max_length=255, null=True)),
                ("created", models.DateTimeField(auto_now_add=True)),
                ("last_modified", models.DateTimeField(auto_now=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.CASCADE,
                        related_name="images",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "constraints": [
                    models.UniqueConstraint(
                        condition=Q(
                            cloud_name__isnull=False, cloudinary_public_id__isnull=False
                        ),
                        fields=("cloud_name", "cloudinary_public_id"),
                        name="uniq_image_cloudinary_identity",
                    ),
                    models.UniqueConstraint(
                        condition=Q(cloudinary_public_id__isnull=True),
                        fields=("url",),
                        name="uniq_image_url_without_cloudinary_id",
                    ),
                ],
            },
        ),
        migrations.RenameField("piece", "thumbnail", "thumbnail_legacy"),
        migrations.RenameField("piecestate", "images", "images_legacy"),
        migrations.RenameField(
            "glazetype", "test_tile_image", "test_tile_image_legacy"
        ),
        migrations.RenameField(
            "glazecombination", "test_tile_image", "test_tile_image_legacy"
        ),
        migrations.AddField(
            model_name="piece",
            name="thumbnail",
            field=models.ForeignKey(
                blank=True,
                default=None,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="thumbnail_for_pieces",
                to="api.image",
            ),
        ),
        migrations.AddField(
            model_name="glazetype",
            name="test_tile_image",
            field=models.ForeignKey(
                blank=True,
                default=None,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="+",
                to="api.image",
            ),
        ),
        migrations.AddField(
            model_name="glazecombination",
            name="test_tile_image",
            field=models.ForeignKey(
                blank=True,
                default=None,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="+",
                to="api.image",
            ),
        ),
        migrations.CreateModel(
            name="PieceStateImage",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("caption", models.CharField(blank=True, default="", max_length=1024)),
                ("created", models.DateTimeField(default=timezone.now)),
                ("order", models.PositiveSmallIntegerField()),
                (
                    "image",
                    models.ForeignKey(
                        on_delete=models.deletion.PROTECT,
                        related_name="piece_state_links",
                        to="api.image",
                    ),
                ),
                (
                    "piece_state",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="image_links",
                        to="api.piecestate",
                    ),
                ),
            ],
            options={
                "ordering": ["order", "pk"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("piece_state", "order"),
                        name="uniq_piece_state_image_order",
                    )
                ],
            },
        ),
        migrations.RunPython(forwards, backwards),
        migrations.RemoveField("piece", "thumbnail_legacy"),
        migrations.RemoveField("piecestate", "images_legacy"),
        migrations.RemoveField("glazetype", "test_tile_image_legacy"),
        migrations.RemoveField("glazecombination", "test_tile_image_legacy"),
    ]
