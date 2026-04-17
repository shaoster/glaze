"""Management command: dump_public_library

Exports all public library objects (user=NULL) from every global declared
``public: true`` in workflow.yml to a JSON fixture file.  The output file
can be committed to git and loaded in other environments with the companion
``load_public_library`` command.
"""
import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from api.workflow import get_public_global_models

_DEFAULT_FIXTURE = Path(settings.BASE_DIR) / 'fixtures' / 'public_library.json'


class Command(BaseCommand):
    help = (
        'Export all public library objects (user=NULL) to a JSON fixture file '
        'that can be committed to git and loaded with load_public_library.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--output',
            default=str(_DEFAULT_FIXTURE),
            help=(
                f'Path to write the fixture file '
                f'(default: {_DEFAULT_FIXTURE}). '
                'Use "-" to write to stdout.'
            ),
        )

    def handle(self, *args, **options):
        output = options['output']
        records = []

        for model_cls in get_public_global_models():
            app_label = model_cls._meta.app_label
            model_name = model_cls._meta.model_name
            public_qs = model_cls.objects.filter(user__isnull=True).order_by('name')

            for obj in public_qs:
                fields: dict = {}
                for field in model_cls._meta.fields:
                    if field.name in ('id', 'user'):
                        continue
                    fields[field.name] = getattr(obj, field.attname)

                # For GlazeCombination: replace the computed name field with an
                # explicit ordered layers list so the fixture is self-describing
                # and does not depend on the separator convention.
                if model_name == 'glazecombination':
                    fields['layers'] = list(
                        obj.layers.order_by('order').values_list('glaze_type__name', flat=True)
                    )

                records.append({
                    'model': f'{app_label}.{model_name}',
                    'fields': fields,
                })

        payload = json.dumps(records, indent=2, default=str)

        if output == '-':
            self.stdout.write(payload)
        else:
            out_path = Path(output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(payload)
            self.stdout.write(
                self.style.SUCCESS(
                    f'Exported {len(records)} public library record(s) to {out_path}'
                )
            )
