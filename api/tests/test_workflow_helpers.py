from unittest.mock import Mock

import api.workflow as workflow_module
from api.models import Piece

# Snapshot-style fixture that mirrors the current workflow.yml shape and naming.
_MOCK_STATE_MAP = {
    'designed': {
        'id': 'designed',
        'visible': True,
        'successors': ['wheel_thrown', 'handbuilt'],
    },
    'wheel_thrown': {
        'id': 'wheel_thrown',
        'visible': True,
        'successors': ['recycled', 'trimmed'],
        'fields': {
            'clay_weight_lbs': {
                'type': 'number',
                'description': 'Weight of clay on the scale before throwing, in grams.',
            },
            'clay_body': {
                '$ref': '@clay_body.name',
                'description': 'Clay body used for this wheel-thrown piece.',
                'can_create': True,
            },
        },
    },
    'trimmed': {
        'id': 'trimmed',
        'visible': True,
        'successors': ['recycled', 'submitted_to_bisque_fire'],
        'fields': {
            'trimmed_weight_lbs': {
                'type': 'number',
            },
            'pre_trim_weight_lbs': {
                '$ref': 'wheel_thrown.clay_weight_lbs',
                'description': 'Carried-forward pre-trim weight.',
            },
        },
    },
    'submitted_to_bisque_fire': {
        'id': 'submitted_to_bisque_fire',
        'visible': True,
        'successors': ['recycled', 'bisque_fired'],
        'fields': {
            'kiln_location': {
                '$ref': '@location.name',
                'can_create': True,
            },
        },
    },
    'bisque_fired': {
        'id': 'bisque_fired',
        'visible': True,
        'successors': ['recycled', 'glazed'],
        'fields': {
            'kiln_temperature_c': {'type': 'integer'},
            'cone': {'type': 'string', 'enum': ['04', '03', '02', '01']},
        },
    },
    'glaze_fired': {
        'id': 'glaze_fired',
        'visible': True,
        'successors': ['recycled', 'completed'],
        'fields': {
            'kiln_temperature_c': {
                '$ref': 'bisque_fired.kiln_temperature_c',
            },
            'cone': {
                '$ref': 'bisque_fired.cone',
            },
        },
    },
    'completed': {
        'id': 'completed',
        'visible': True,
        'terminal': True,
        'summary': {
            'sections': [
                {
                    'title': 'Making',
                    'fields': [
                        {'label': 'Starting weight', 'value': 'wheel_thrown.clay_weight_lbs'},
                    ],
                },
            ],
        },
    },
    'recycled': {
        'id': 'recycled',
        'visible': True,
        'terminal': True,
    },
}

_MOCK_GLOBALS_MAP = {
    'location': {
        'model': 'Location',
        'public': False,
        'private': True,
        'fields': {
            'name': {'type': 'string'},
        },
    },
    'clay_body': {
        'model': 'ClayBody',
        'public': True,
        'private': True,
        'fields': {
            'name': {'type': 'string'},
            'short_description': {'type': 'string'},
            'tile_image': {'type': 'image'},
        },
    },
    'firing_profile': {
        'model': 'FiringProfile',
        'fields': {
            'code': {'type': 'string'},
            'max_temp_c': {'type': 'integer'},
        },
    },
    'admin_only_type': {
        'model': 'AdminOnly',
        'public': True,
        'private': False,
        'fields': {
            'name': {'type': 'string'},
        },
    },
    'glaze_combination': {
        'model': 'GlazeCombination',
        'public': True,
        'private': True,
        'favoritable': True,
        'compose_from': {
            'glaze_types': {
                'global': 'glaze_type',
                'ordered': True,
                'filter_label': 'Contains glaze types (all must match)',
            },
        },
        'fields': {
            'name': {'type': 'string'},
            'is_food_safe': {'type': 'boolean', 'filterable': True, 'label': 'Food safe'},
            'runs': {'type': 'boolean', 'filterable': True, 'label': 'Runs'},
            'test_tile_image': {'type': 'image'},
            'firing_profile': {'$ref': '@firing_profile.code', 'filterable': True},
        },
    },
    'piece': {
        'model': 'Piece',
        'factory': False,
        'taggable': True,
        'fields': {
            'name': {'type': 'string'},
        },
    },
    'glaze_type': {
        'model': 'GlazeType',
        'public': True,
        'private': True,
        'fields': {
            'name': {'type': 'string'},
        },
    },
}

def test_get_name_for_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.get_name_for_global(Piece) == 'piece'


def test_get_state_ref_fields_returns_state_refs_only(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.get_state_ref_fields('trimmed') == {
        'pre_trim_weight_lbs': ('wheel_thrown', 'clay_weight_lbs'),
    }


def test_get_state_ref_fields_ignores_global_refs(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.get_state_ref_fields('submitted_to_bisque_fire') == {}


def test_get_state_ref_fields_unknown_state_returns_empty(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.get_state_ref_fields('unknown_state') == {}


def test_get_state_summary_returns_declared_summary(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)

    assert workflow_module.get_state_summary('completed') == _MOCK_STATE_MAP['completed']['summary']


def test_get_state_summary_unknown_state_returns_empty(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)

    assert workflow_module.get_state_summary('unknown_state') == {}


def test_get_global_model_and_field_prefers_name(monkeypatch):
    get_model = Mock(return_value='LocationModel')
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    monkeypatch.setattr(workflow_module.apps, 'get_model', get_model)

    model_cls, fields, display_field = workflow_module.get_global_model_and_field('location')

    get_model.assert_called_once_with('api', 'Location')
    assert model_cls == 'LocationModel'
    assert fields == _MOCK_GLOBALS_MAP['location']['fields']
    assert display_field == 'name'


def test_get_global_model_and_field_falls_back_to_first_field(monkeypatch):
    get_model = Mock(return_value='FiringProfileModel')
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    monkeypatch.setattr(workflow_module.apps, 'get_model', get_model)

    model_cls, fields, display_field = workflow_module.get_global_model_and_field('firing_profile')

    get_model.assert_called_once_with('api', 'FiringProfile')
    assert model_cls == 'FiringProfileModel'
    assert fields == _MOCK_GLOBALS_MAP['firing_profile']['fields']
    assert display_field == 'code'


def test_is_public_global_returns_true_when_flag_set(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_public_global('clay_body') is True


def test_is_public_global_returns_false_when_flag_false(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_public_global('location') is False


def test_is_public_global_returns_false_when_flag_absent(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_public_global('firing_profile') is False


def test_is_public_global_returns_false_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_public_global('does_not_exist') is False


def test_is_private_global_returns_false_when_flag_false(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_private_global('admin_only_type') is False


def test_is_private_global_returns_true_when_flag_true(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_private_global('clay_body') is True


def test_is_private_global_defaults_to_true_when_flag_absent(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    # firing_profile has no 'private' key — should default to True
    assert workflow_module.is_private_global('firing_profile') is True


def test_is_private_global_defaults_to_true_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_private_global('does_not_exist') is True


def test_get_public_global_models_returns_models_for_public_globals(monkeypatch):
    clay_model = Mock(name='ClayBodyModel')
    glaze_combination_model = Mock(name='GlazeCombinationModel')
    glaze_type_model = Mock(name='GlazeTypeModel')
    admin_only_model = Mock(name='AdminOnlyModel')

    def _get_model(app, name):
        return {
            'ClayBody': clay_model,
            'GlazeCombination': glaze_combination_model,
            'GlazeType': glaze_type_model,
        }.get(name, admin_only_model)

    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    monkeypatch.setattr(workflow_module.apps, 'get_model', _get_model)

    result = workflow_module.get_public_global_models()

    # clay_body, admin_only_type, glaze_combination, and glaze_type all have public: true.
    assert clay_model in result
    assert glaze_combination_model in result
    assert glaze_type_model in result
    assert admin_only_model in result
    assert len(result) == 4


def test_get_image_fields_for_global_model_returns_image_fields(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    ClayBodyModel = type('ClayBody', (), {})
    result = workflow_module.get_image_fields_for_global_model(ClayBodyModel)
    assert result == ['tile_image']


def test_get_image_fields_for_global_model_returns_empty_for_no_image_fields(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    LocationModel = type('Location', (), {})
    assert workflow_module.get_image_fields_for_global_model(LocationModel) == []


def test_get_image_fields_for_global_model_returns_empty_for_unknown_model(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    UnknownModel = type('UnknownModel', (), {})
    assert workflow_module.get_image_fields_for_global_model(UnknownModel) == []


def test_resolve_image_type_maps_to_object_schema(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', {
        **_MOCK_STATE_MAP,
        'photo_state': {
            'id': 'photo_state',
            'visible': True,
            'terminal': True,
            'fields': {
                'thumbnail': {'type': 'image'},
            },
        },
    })
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    schema = workflow_module.build_custom_fields_schema('photo_state')
    image_schema = schema['properties']['thumbnail']
    assert image_schema['type'] == 'object'
    assert 'url' in image_schema['properties']
    assert 'cloudinary_public_id' in image_schema['properties']
    assert image_schema['required'] == ['url']


def test_build_custom_fields_schema_unknown_state_is_empty_object(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.build_custom_fields_schema('unknown_state') == {
        'type': 'object',
        'properties': {},
        'additionalProperties': False,
    }


def test_build_custom_fields_schema_resolves_global_refs(monkeypatch):
    # Global ref fields are stored in junction tables — they are excluded from
    # the inline JSON schema entirely.
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    schema = workflow_module.build_custom_fields_schema('submitted_to_bisque_fire')
    assert schema == {
        'type': 'object',
        'properties': {},
        'additionalProperties': False,
    }


def test_build_custom_fields_schema_resolves_state_refs_recursively(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    schema = workflow_module.build_custom_fields_schema('glaze_fired')
    assert schema == {
        'type': 'object',
        'properties': {
            'kiln_temperature_c': {'type': 'integer'},
            'cone': {'type': 'string', 'enum': ['04', '03', '02', '01']},
        },
        'additionalProperties': False,
    }


# ---------------------------------------------------------------------------
# get_filterable_fields
# ---------------------------------------------------------------------------

def test_get_filterable_fields_returns_filterable_fields(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    result = workflow_module.get_filterable_fields('glaze_combination')
    assert set(result.keys()) == {'is_food_safe', 'runs'}
    assert result['is_food_safe'] == {'type': 'boolean', 'label': 'Food safe'}
    assert result['runs'] == {'type': 'boolean', 'label': 'Runs'}


def test_get_filterable_fields_returns_empty_when_no_filterable_fields(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_filterable_fields('location') == {}


def test_get_filterable_fields_returns_empty_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_filterable_fields('does_not_exist') == {}


# ---------------------------------------------------------------------------
# is_favoritable_global
# ---------------------------------------------------------------------------

def test_is_favoritable_global_returns_true_when_flag_set(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_favoritable_global('glaze_combination') is True


def test_is_favoritable_global_returns_false_when_flag_absent(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_favoritable_global('location') is False


def test_is_favoritable_global_returns_false_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_favoritable_global('does_not_exist') is False


# ---------------------------------------------------------------------------
# is_taggable_global / get_taggable_globals
# ---------------------------------------------------------------------------

def test_is_taggable_global_returns_true_when_flag_set(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_taggable_global('piece') is True


def test_is_taggable_global_returns_false_when_flag_absent(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_taggable_global('location') is False


def test_is_taggable_global_returns_false_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.is_taggable_global('does_not_exist') is False


def test_get_taggable_globals_returns_declared_globals(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    monkeypatch.setattr(workflow_module, 'get_global_names', lambda: list(_MOCK_GLOBALS_MAP.keys()))
    assert workflow_module.get_taggable_globals() == {'piece'}


# ---------------------------------------------------------------------------
# get_compose_from
# ---------------------------------------------------------------------------

def test_get_compose_from_returns_declaration_when_present(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    result = workflow_module.get_compose_from('glaze_combination')
    assert result == {
        'glaze_types': {
            'global': 'glaze_type',
            'ordered': True,
            'filter_label': 'Contains glaze types (all must match)',
        },
    }


def test_get_compose_from_returns_none_when_absent(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_compose_from('location') is None


def test_get_compose_from_returns_none_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_compose_from('does_not_exist') is None


# ---------------------------------------------------------------------------
# get_filterable_ref_fields
# ---------------------------------------------------------------------------

def test_get_filterable_ref_fields_returns_fk_id_entries(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    result = workflow_module.get_filterable_ref_fields('glaze_combination')
    assert result == {
        'firing_profile_id': {'type': 'fk_id', 'param': 'firing_profile_id'},
    }


def test_get_filterable_ref_fields_ignores_inline_filterable_fields(monkeypatch):
    """Boolean inline fields with filterable: true must not appear in ref filter output."""
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    result = workflow_module.get_filterable_ref_fields('glaze_combination')
    assert 'is_food_safe_id' not in result
    assert 'runs_id' not in result


def test_get_filterable_ref_fields_returns_empty_when_no_filterable_refs(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_filterable_ref_fields('location') == {}


def test_get_filterable_ref_fields_returns_empty_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_filterable_ref_fields('does_not_exist') == {}


# ---------------------------------------------------------------------------
# get_filterable_compose_fields
# ---------------------------------------------------------------------------

def test_get_filterable_compose_fields_returns_m2m_id_entry(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    result = workflow_module.get_filterable_compose_fields('glaze_combination')
    assert result == {
        'layers__glaze_type_id': {'type': 'm2m_id', 'param': 'glaze_type_ids'},
    }


def test_get_filterable_compose_fields_omits_entries_without_filter_label(monkeypatch):
    """compose_from entries with no filter_label must not appear in output."""
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', {
        'combo': {
            'model': 'Combo',
            'public': True,
            'private': True,
            'compose_from': {
                'parts': {'global': 'part', 'ordered': True},  # no filter_label
            },
            'fields': {'name': {'type': 'string'}},
        },
    })
    assert workflow_module.get_filterable_compose_fields('combo') == {}


def test_get_filterable_compose_fields_returns_empty_when_no_compose_from(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_filterable_compose_fields('location') == {}


def test_get_filterable_compose_fields_returns_empty_for_unknown_global(monkeypatch):
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)
    assert workflow_module.get_filterable_compose_fields('does_not_exist') == {}
