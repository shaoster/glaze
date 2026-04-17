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
        parser.add_argument(
            '--skip-if-missing',
            action='store_true',
            default=False,
            help=(
                'If the fixture file does not exist, print a warning and exit '
                'successfully instead of raising an error.  Useful in deployment '
                'contexts where no fixture has been committed yet.'
            ),
        )

    def handle(self, *args, **options):
        fixture_path = Path(options['fixture'])

        if not fixture_path.exists():
            if options['skip_if_missing']:
                self.stdout.write(
                    self.style.WARNING(
                        f'No fixture file found at {fixture_path} — skipping public library load.'
                    )
                )
                return
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

            # GlazeCombination is handled specially: layers are stored as an
            # ordered list of GlazeType names and must be loaded via
            # get_or_create_with_layers rather than update_or_create.
            if model_cls._meta.model_name == 'glazecombination':
                from api.models import GlazeCombination, GlazeType
                layer_names = fields.get('layers', [])
                if not layer_names:
                    raise CommandError(
                        f'GlazeCombination record missing "layers" list: {record}'
                    )
                glaze_types = []
                for gt_name in layer_names:
                    try:
                        glaze_types.append(GlazeType.objects.get(user=None, name=gt_name))
                    except GlazeType.DoesNotExist:
                        raise CommandError(
                            f'GlazeType with name "{gt_name}" not found in public library.'
                        )
                combo, was_created = GlazeCombination.get_or_create_with_layers(
                    user=None, glaze_types=glaze_types
                )
                # Update non-layer fields on existing combos.
                update_fields = {
                    k: v for k, v in fields.items()
                    if k not in ('name', 'layers')
                }
                if update_fields:
                    for attr, val in update_fields.items():
                        setattr(combo, attr, val)
                    combo.save(update_fields=list(update_fields.keys()))
            else:
                defaults = {}
                for k, v in fields.items():
                    if k == 'name':
                        continue
                    # Resolve FK integer values to model instances.
                    try:
                        field_obj = model_cls._meta.get_field(k)
                        if field_obj.is_relation and isinstance(v, int):
                            v = field_obj.related_model.objects.get(pk=v)
                    except Exception:
                        pass
                    defaults[k] = v
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
