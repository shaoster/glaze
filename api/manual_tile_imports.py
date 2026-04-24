from __future__ import annotations

import os
import uuid
from collections import Counter

import cloudinary
import cloudinary.uploader
from django.db import transaction
from django.utils.text import slugify

from .models import GlazeCombination, GlazeCombinationLayer, GlazeType
from .workflow import sync_glaze_type_singleton_combination


def _configure_cloudinary() -> None:
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME', '').strip()
    api_key = os.environ.get('CLOUDINARY_API_KEY', '').strip()
    api_secret = os.environ.get('CLOUDINARY_API_SECRET', '').strip()
    if not cloud_name or not api_key or not api_secret:
        raise ValueError('CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are required.')
    cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True)


def _default_batch_folder() -> str:
    env_folder = os.environ.get('CLOUDINARY_UPLOAD_FOLDER', '').strip().strip('/')
    return '/'.join(part for part in [env_folder, 'manual-square-crop-imports'] if part)


def _upload_file(uploaded_file, *, kind: str, filename: str, folder: str) -> dict:
    stem = slugify(filename.rsplit('.', 1)[0]) or 'tile'
    public_id = f'{kind}-{stem}-{uuid.uuid4().hex[:8]}'
    return cloudinary.uploader.upload(
        uploaded_file,
        public_id=public_id,
        overwrite=False,
        resource_type='image',
        folder=folder,
    )


def _ensure_combination_layers(combo: GlazeCombination, glaze_types: list[GlazeType]) -> None:
    existing = list(combo.layers.select_related('glaze_type').order_by('order'))
    expected_ids = [glaze_type.id for glaze_type in glaze_types]
    existing_ids = [layer.glaze_type_id for layer in existing]
    if existing_ids == expected_ids and [layer.order for layer in existing] == list(range(len(glaze_types))):
        return
    combo.layers.all().delete()
    for order, glaze_type in enumerate(glaze_types):
        GlazeCombinationLayer.objects.create(combination=combo, glaze_type=glaze_type, order=order)


def _result_payload(record: dict, *, status: str, reason: str | None = None, object_id: str | None = None, image_url: str | None = None) -> dict:
    parsed = record.get('parsed_fields', {}) or {}
    return {
        'client_id': record.get('client_id', ''),
        'filename': record.get('filename', ''),
        'kind': parsed.get('kind', record.get('kind', '')),
        'name': parsed.get('name', ''),
        'status': status,
        'reason': reason,
        'object_id': object_id,
        'image_url': image_url,
    }


def import_manual_tile_records(records: list[dict], uploaded_files: dict[str, object], *, batch_folder: str | None = None) -> dict:
    _configure_cloudinary()
    folder = (batch_folder or _default_batch_folder()).strip().strip('/')
    results: list[dict] = []

    def import_glaze_type(record: dict) -> dict:
        parsed = record.get('parsed_fields', {}) or {}
        name = (parsed.get('name') or '').strip()
        client_id = record.get('client_id', '')
        uploaded = uploaded_files.get(client_id)
        if not name:
            return _result_payload(record, status='error', reason='Missing parsed glaze type name.')
        if uploaded is None:
            return _result_payload(record, status='error', reason='Missing cropped image upload.')
        existing = GlazeType.objects.filter(user=None, name=name).first()
        if existing:
            return _result_payload(record, status='skipped_duplicate', reason='Public glaze type already exists.', object_id=str(existing.pk), image_url=existing.test_tile_image)

        upload = _upload_file(
            uploaded,
            kind='glaze-type',
            filename=record.get('filename', name),
            folder=f'{folder}/final/glaze-types',
        )
        glaze_type = GlazeType.objects.create(
            user=None,
            name=name,
            test_tile_image=upload['secure_url'],
            runs=parsed.get('runs'),
            is_food_safe=parsed.get('is_food_safe'),
        )
        sync_glaze_type_singleton_combination(glaze_type)
        return _result_payload(record, status='created', object_id=str(glaze_type.pk), image_url=glaze_type.test_tile_image)

    def import_glaze_combination(record: dict) -> dict:
        parsed = record.get('parsed_fields', {}) or {}
        name = (parsed.get('name') or '').strip()
        first_name = (parsed.get('first_glaze') or '').strip()
        second_name = (parsed.get('second_glaze') or '').strip()
        client_id = record.get('client_id', '')
        uploaded = uploaded_files.get(client_id)
        if not name:
            if first_name and second_name:
                name = f'{first_name}!{second_name}'
            else:
                return _result_payload(record, status='error', reason='Missing parsed glaze combination name.')
        if not first_name or not second_name:
            return _result_payload(record, status='error', reason='Glaze combinations require first and second glaze names.')
        if uploaded is None:
            return _result_payload(record, status='error', reason='Missing cropped image upload.')
        existing = GlazeCombination.objects.filter(user=None, name=name).first()
        if existing:
            return _result_payload(record, status='skipped_duplicate', reason='Public glaze combination already exists.', object_id=str(existing.pk), image_url=existing.test_tile_image)

        first = GlazeType.objects.filter(user=None, name=first_name).first()
        second = GlazeType.objects.filter(user=None, name=second_name).first()
        if first is None or second is None:
            missing = first_name if first is None else second_name
            return _result_payload(record, status='error', reason=f'Missing referenced public glaze type: {missing}.')

        upload = _upload_file(
            uploaded,
            kind='glaze-combination',
            filename=record.get('filename', name),
            folder=f'{folder}/final/glaze-combinations',
        )
        combo = GlazeCombination.objects.create(
            user=None,
            name=name,
            test_tile_image=upload['secure_url'],
            runs=parsed.get('runs'),
            is_food_safe=parsed.get('is_food_safe'),
        )
        _ensure_combination_layers(combo, [first, second])
        return _result_payload(record, status='created', object_id=str(combo.pk), image_url=combo.test_tile_image)

    with transaction.atomic():
        for record in [r for r in records if (r.get('parsed_fields', {}) or {}).get('kind') == 'glaze_type']:
            results.append(import_glaze_type(record))
        for record in [r for r in records if (r.get('parsed_fields', {}) or {}).get('kind') == 'glaze_combination']:
            results.append(import_glaze_combination(record))

    counts = Counter(result['status'] for result in results)
    created_type_count = sum(1 for result in results if result['status'] == 'created' and result['kind'] == 'glaze_type')
    created_combo_count = sum(1 for result in results if result['status'] == 'created' and result['kind'] == 'glaze_combination')
    return {
        'results': results,
        'summary': {
            'created_glaze_types': created_type_count,
            'created_glaze_combinations': created_combo_count,
            'skipped_duplicates': counts.get('skipped_duplicate', 0),
            'errors': counts.get('error', 0),
        },
    }
