from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_remove_piecestate_location'),
    ]

    operations = [
        migrations.AddField(
            model_name='piece',
            name='current_location',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name='pieces',
                to='api.location',
            ),
        ),
    ]
