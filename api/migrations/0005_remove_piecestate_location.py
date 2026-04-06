from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_claybody_glazemethod_glazetype'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='piecestate',
            name='location',
        ),
    ]
