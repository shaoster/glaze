"""Replace GlazeCombination's two FK layer fields with an ordered M2M through table.

Changes:
- Creates GlazeCombinationLayer (combination FK, glaze_type FK, order).
- Migrates existing GlazeCombination rows: first_layer → order=0, second_layer → order=1.
- Removes first_layer_glaze_type and second_layer_glaze_type FK columns.
- Widens name from max_length=511 to max_length=2047.
- Replaces the two-FK uniqueness constraints with name-based constraints.
"""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def migrate_layers_forward(apps, schema_editor):
    """Convert existing first/second FK columns into GlazeCombinationLayer rows.

    Use FK ID attributes directly to avoid select_related on historical models,
    which can fail when Django resolves relations through the current registry.
    """
    GlazeCombination = apps.get_model('api', 'GlazeCombination')
    GlazeCombinationLayer = apps.get_model('api', 'GlazeCombinationLayer')
    for combo in GlazeCombination.objects.all():
        GlazeCombinationLayer.objects.create(
            combination_id=combo.pk,
            glaze_type_id=combo.first_layer_glaze_type_id,
            order=0,
        )
        GlazeCombinationLayer.objects.create(
            combination_id=combo.pk,
            glaze_type_id=combo.second_layer_glaze_type_id,
            order=1,
        )


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0011_add_glaze_combination_name'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # 1. Create the through table.
        migrations.CreateModel(
            name='GlazeCombinationLayer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.PositiveSmallIntegerField()),
                ('combination', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='layers',
                    to='api.glazecombination',
                )),
                ('glaze_type', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='combination_layers',
                    to='api.glazetype',
                )),
            ],
            options={
                'ordering': ['order'],
                'constraints': [
                    models.UniqueConstraint(
                        fields=['combination', 'order'],
                        name='uniq_combination_layer_order',
                    ),
                ],
            },
        ),

        # 2. Migrate existing FK data into the through table.
        migrations.RunPython(migrate_layers_forward, migrations.RunPython.noop),

        # 3. Remove old FK-based uniqueness constraints (must happen before
        #    RemoveField since Django needs the fields to deconstruct them).
        migrations.RemoveConstraint(model_name='glazecombination', name='uniq_glaze_combination_public'),
        migrations.RemoveConstraint(model_name='glazecombination', name='uniq_glaze_combination_per_user'),

        # 4. Remove the old FK columns.
        migrations.RemoveField(model_name='glazecombination', name='first_layer_glaze_type'),
        migrations.RemoveField(model_name='glazecombination', name='second_layer_glaze_type'),
        migrations.AddConstraint(
            model_name='glazecombination',
            constraint=models.UniqueConstraint(
                fields=['name'],
                condition=models.Q(user__isnull=True),
                name='uniq_glaze_combination_name_public',
            ),
        ),
        migrations.AddConstraint(
            model_name='glazecombination',
            constraint=models.UniqueConstraint(
                fields=['user', 'name'],
                condition=models.Q(user__isnull=False),
                name='uniq_glaze_combination_name_per_user',
            ),
        ),

        # 5. Widen name field and make it editable (no longer editable=False).
        migrations.AlterField(
            model_name='glazecombination',
            name='name',
            field=models.CharField(blank=True, default='', max_length=2047),
        ),
    ]
