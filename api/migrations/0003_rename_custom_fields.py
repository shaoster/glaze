from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_piece_shared'),
    ]

    operations = [
        migrations.RenameField(
            model_name='piecestate',
            old_name='additional_fields',
            new_name='custom_fields',
        ),
    ]
