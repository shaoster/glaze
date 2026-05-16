from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("api", "0012_seed_allowedemail_from_users"),
    ]

    operations = [
        migrations.AlterField(
            model_name="allowedemail",
            name="email",
            field=models.EmailField(max_length=254, unique=True),
        ),
    ]
