from django.conf import settings
from django.db import migrations, models

LEGACY_USER_USERNAME = 'legacy'
LEGACY_USER_EMAIL = 'legacy@glaze.local'


def _assign_legacy_user(apps, schema_editor):
    app_label, model_name = settings.AUTH_USER_MODEL.split('.')
    user_model = apps.get_model(app_label, model_name)
    legacy_user, _ = user_model.objects.get_or_create(
        username=LEGACY_USER_USERNAME,
        defaults={
            'email': LEGACY_USER_EMAIL,
            'is_active': False,
        },
    )

    for model_name in ['Location', 'ClayBody', 'GlazeType', 'GlazeMethod', 'Piece']:
        model = apps.get_model('api', model_name)
        model.objects.filter(user__isnull=True).update(user=legacy_user)

    piece_state_model = apps.get_model('api', 'PieceState')
    for state in piece_state_model.objects.filter(user__isnull=True).select_related('piece'):
        state.user_id = state.piece.user_id
        state.save(update_fields=['user'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_piece_current_location'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='UserProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('openid_subject', models.CharField(blank=True, default='', max_length=255)),
                ('profile_image_url', models.URLField(blank=True, default='')),
                ('user', models.OneToOneField(on_delete=models.deletion.CASCADE, related_name='profile', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddField(
            model_name='claybody',
            name='user',
            field=models.ForeignKey(null=True, on_delete=models.deletion.CASCADE, related_name='clay_bodies', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='glazemethod',
            name='user',
            field=models.ForeignKey(null=True, on_delete=models.deletion.CASCADE, related_name='glaze_methods', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='glazetype',
            name='user',
            field=models.ForeignKey(null=True, on_delete=models.deletion.CASCADE, related_name='glaze_types', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='location',
            name='user',
            field=models.ForeignKey(null=True, on_delete=models.deletion.CASCADE, related_name='locations', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='piece',
            name='user',
            field=models.ForeignKey(null=True, on_delete=models.deletion.CASCADE, related_name='pieces', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='piecestate',
            name='user',
            field=models.ForeignKey(null=True, on_delete=models.deletion.CASCADE, related_name='piece_states', to=settings.AUTH_USER_MODEL),
        ),
        migrations.RunPython(_assign_legacy_user, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='claybody',
            name='name',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='claybody',
            name='user',
            field=models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='clay_bodies', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='glazemethod',
            name='name',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='glazemethod',
            name='user',
            field=models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='glaze_methods', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='glazetype',
            name='name',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='glazetype',
            name='user',
            field=models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='glaze_types', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='location',
            name='name',
            field=models.CharField(max_length=255),
        ),
        migrations.AlterField(
            model_name='location',
            name='user',
            field=models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='locations', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='piece',
            name='user',
            field=models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='pieces', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='piecestate',
            name='user',
            field=models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='piece_states', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name='location',
            constraint=models.UniqueConstraint(fields=('user', 'name'), name='uniq_location_name_per_user'),
        ),
        migrations.AddConstraint(
            model_name='claybody',
            constraint=models.UniqueConstraint(fields=('user', 'name'), name='uniq_clay_body_name_per_user'),
        ),
        migrations.AddConstraint(
            model_name='glazetype',
            constraint=models.UniqueConstraint(fields=('user', 'name'), name='uniq_glaze_type_name_per_user'),
        ),
        migrations.AddConstraint(
            model_name='glazemethod',
            constraint=models.UniqueConstraint(fields=('user', 'name'), name='uniq_glaze_method_name_per_user'),
        ),
    ]
