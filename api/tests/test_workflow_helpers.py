from unittest.mock import Mock

import api.workflow as workflow_module


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
        'additional_fields': {
            'clay_weight_grams': {
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
        'additional_fields': {
            'trimmed_weight_grams': {
                'type': 'number',
            },
            'pre_trim_weight_grams': {
                '$ref': 'wheel_thrown.clay_weight_grams',
                'description': 'Carried-forward pre-trim weight.',
            },
        },
    },
    'submitted_to_bisque_fire': {
        'id': 'submitted_to_bisque_fire',
        'visible': True,
        'successors': ['recycled', 'bisque_fired'],
        'additional_fields': {
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
        'additional_fields': {
            'kiln_temperature_c': {'type': 'integer'},
            'cone': {'type': 'string', 'enum': ['04', '03', '02', '01']},
        },
    },
    'glaze_fired': {
        'id': 'glaze_fired',
        'visible': True,
        'successors': ['recycled', 'completed'],
        'additional_fields': {
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
        'fields': {
            'name': {'type': 'string'},
        },
    },
    'clay_body': {
        'model': 'ClayBody',
        'fields': {
            'name': {'type': 'string'},
            'short_description': {'type': 'string'},
        },
    },
    'firing_profile': {
        'model': 'FiringProfile',
        'fields': {
            'code': {'type': 'string'},
            'max_temp_c': {'type': 'integer'},
        },
    },
}


def test_get_state_ref_fields_returns_state_refs_only(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.get_state_ref_fields('trimmed') == {
        'pre_trim_weight_grams': ('wheel_thrown', 'clay_weight_grams'),
    }


def test_get_state_ref_fields_ignores_global_refs(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.get_state_ref_fields('submitted_to_bisque_fire') == {}


def test_get_state_ref_fields_unknown_state_returns_empty(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.get_state_ref_fields('unknown_state') == {}


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


def test_build_additional_fields_schema_unknown_state_is_empty_object(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    assert workflow_module.build_additional_fields_schema('unknown_state') == {
        'type': 'object',
        'properties': {},
        'additionalProperties': False,
    }


def test_build_additional_fields_schema_resolves_global_refs(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    schema = workflow_module.build_additional_fields_schema('submitted_to_bisque_fire')
    assert schema == {
        'type': 'object',
        'properties': {
            'kiln_location': {'type': 'string'},
        },
        'additionalProperties': False,
    }


def test_build_additional_fields_schema_resolves_state_refs_recursively(monkeypatch):
    monkeypatch.setattr(workflow_module, '_STATE_MAP', _MOCK_STATE_MAP)
    monkeypatch.setattr(workflow_module, '_GLOBALS_MAP', _MOCK_GLOBALS_MAP)

    schema = workflow_module.build_additional_fields_schema('glaze_fired')
    assert schema == {
        'type': 'object',
        'properties': {
            'kiln_temperature_c': {'type': 'integer'},
            'cone': {'type': 'string', 'enum': ['04', '03', '02', '01']},
        },
        'additionalProperties': False,
    }
