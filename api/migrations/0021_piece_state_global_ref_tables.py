"""
Migration: add PieceState*Ref junction tables for DB-level FK integrity on global refs.

Schema changes:
  - Create PieceStateClayBodyRef
  - Create PieceStateLocationRef
  - Create PieceStateGlazeCombinationRef

Data migration:
  Reads name-string global-ref values from PieceState.additional_fields, resolves
  each to the matching global object, creates a junction row, and removes the key
  from the JSON blob. Unresolvable names are silently dropped.
"""
import django.db.models.deletion
from django.db import migrations, models


# ---------------------------------------------------------------------------
# State → (field_name, global_model_name) snapshot at migration time.
# ---------------------------------------------------------------------------
_GLOBAL_REF_FIELDS = {
    'wheel_thrown': [('clay_body', 'ClayBody')],
    'handbuilt': [('clay_body', 'ClayBody')],
    'submitted_to_bisque_fire': [('kiln_location', 'Location')],
    'glazed': [('glaze_combination', 'GlazeCombination')],
    'submitted_to_glaze_fire': [('kiln_location', 'Location')],
    'glaze_fired': [('glaze_combination', 'GlazeCombination')],
}

# global model name → (junction model name, FK field name on junction)
_JUNCTION = {
    'ClayBody': ('PieceStateClayBodyRef', 'clay_body'),
    'Location': ('PieceStateLocationRef', 'location'),
    'GlazeCombination': ('PieceStateGlazeCombinationRef', 'glaze_combination'),
}


def _migrate_forward(apps, schema_editor):
    PieceState = apps.get_model('api', 'PieceState')

    for piece_state in PieceState.objects.all():
        ref_fields = _GLOBAL_REF_FIELDS.get(piece_state.state, [])
        if not ref_fields:
            continue

        fields_blob = dict(piece_state.additional_fields or {})
        changed = False

        for field_name, model_name in ref_fields:
            name_value = fields_blob.get(field_name)
            if not name_value or not isinstance(name_value, str):
                continue

            GlobalModel = apps.get_model('api', model_name)
            junction_model_name, fk_field = _JUNCTION[model_name]
            JunctionModel = apps.get_model('api', junction_model_name)

            # Prefer user-private instance; fall back to public (user=NULL).
            obj = None
            if piece_state.user_id:
                obj = GlobalModel.objects.filter(
                    user_id=piece_state.user_id, name=name_value
                ).first()
            if obj is None:
                obj = GlobalModel.objects.filter(
                    user__isnull=True, name=name_value
                ).first()

            del fields_blob[field_name]
            changed = True

            if obj is not None:
                JunctionModel.objects.get_or_create(
                    piece_state=piece_state,
                    field_name=field_name,
                    defaults={fk_field: obj},
                )

        if changed:
            piece_state.additional_fields = fields_blob
            piece_state.save(update_fields=['additional_fields'])


def _migrate_backward(apps, schema_editor):
    for junction_model_name, fk_field in _JUNCTION.values():
        JunctionModel = apps.get_model('api', junction_model_name)
        for row in JunctionModel.objects.select_related('piece_state', fk_field).all():
            ps = row.piece_state
            global_obj = getattr(row, fk_field)
            blob = dict(ps.additional_fields or {})
            blob[row.field_name] = global_obj.name
            ps.additional_fields = blob
            ps.save(update_fields=['additional_fields'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0020_alter_glazecombination_firing_temperature_and_more'),
    ]

    operations = [
        # --- ClayBody junction ---
        migrations.CreateModel(
            name='PieceStateClayBodyRef',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_name', models.CharField(max_length=100)),
                ('clay_body', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='piece_state_refs',
                    to='api.claybody',
                )),
                ('piece_state', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='clay_bodies_refs',
                    to='api.piecestate',
                )),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(
                        fields=['piece_state', 'field_name'],
                        name='uniq_piece_state_clay_body_ref',
                    ),
                ],
            },
        ),

        # --- Location junction ---
        migrations.CreateModel(
            name='PieceStateLocationRef',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_name', models.CharField(max_length=100)),
                ('location', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='piece_state_refs',
                    to='api.location',
                )),
                ('piece_state', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='locations_refs',
                    to='api.piecestate',
                )),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(
                        fields=['piece_state', 'field_name'],
                        name='uniq_piece_state_location_ref',
                    ),
                ],
            },
        ),

        # --- GlazeCombination junction ---
        migrations.CreateModel(
            name='PieceStateGlazeCombinationRef',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('field_name', models.CharField(max_length=100)),
                ('glaze_combination', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='piece_state_refs',
                    to='api.glazecombination',
                )),
                ('piece_state', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='glaze_combinations_refs',
                    to='api.piecestate',
                )),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(
                        fields=['piece_state', 'field_name'],
                        name='uniq_piece_state_glaze_combination_ref',
                    ),
                ],
            },
        ),

        # --- Data migration ---
        migrations.RunPython(_migrate_forward, reverse_code=_migrate_backward),
    ]
