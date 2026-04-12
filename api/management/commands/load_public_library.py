"""Management command: load_public_library

Imports public library objects from a JSON fixture file produced by
``dump_public_library``.  Each record is matched against existing public
objects by model + name; existing records are updated in place and missing
records are inserted.  The command is safe to run multiple times (idempotent).
"""
import json
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

_DEFAULT_FIXTURE = Path(settings.BASE_DIR) / 'fixtures' / 'public_library.json'


class Command(BaseCommand):
    help = (
        'Import public library objects from a JSON fixture file created by '
        'dump_public_library.  Existing records are updated in place; new records '
        'are inserted.  Safe to run multiple times (idempotent).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--fixture',
            default=str(_DEFAULT_FIXTURE),
            help=(
                f'Path to the fixture file '
                f'(default: {_DEFAULT_FIXTURE}).'
            ),
        )

    def handle(self, *args, **options):
        fixture_path = Path(options['fixture'])

        if not fixture_path.exists():
            raise CommandError(f'Fixture file not found: {fixture_path}')

        try:
            records = json.loads(fixture_path.read_text())
        except json.JSONDecodeError as exc:
            raise CommandError(f'Invalid JSON in fixture file: {exc}') from exc

        if not isinstance(records, list):
            raise CommandError('Fixture must be a JSON array of records.')

        created_count = 0
        updated_count = 0

        for record in records:
            model_label = record.get('model', '')
            fields = record.get('fields', {})

            try:
                model_cls = apps.get_model(model_label)
            except (LookupError, ValueError) as exc:
                raise CommandError(f'Unknown model "{model_label}": {exc}') from exc

            name = fields.get('name')
            if not name:
                raise CommandError(
                    f'Record for model {model_label} is missing a "name" field: {record}'
                )

            defaults = {k: v for k, v in fields.items() if k != 'name'}
            _, was_created = model_cls.objects.update_or_create(
                user=None,
                name=name,
                defaults=defaults,
            )
            if was_created:
                created_count += 1
            else:
                updated_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Loaded {len(records)} record(s): '
                f'{created_count} created, {updated_count} updated.'
            )
        )
