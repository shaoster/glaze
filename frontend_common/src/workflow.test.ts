import { describe, it, expect, vi } from 'vitest'

// Snapshot-style fixture based on the current workflow.yml shape and names.
// It is still local to this test, so the suite remains decoupled from file edits.
vi.mock('../../workflow.yml', () => ({
    default: {
        version: '0.0.2',
        globals: {
            location: {
                model: 'Location',
                fields: {
                    name: { type: 'string' },
                },
            },
            clay_body: {
                model: 'ClayBody',
                fields: {
                    name: { type: 'string' },
                    short_description: { type: 'string' },
                },
            },
            // Synthetic extra global to keep fallback-path coverage.
            firing_profile: {
                model: 'FiringProfile',
                fields: {
                    code: { type: 'string' },
                },
            },
            glaze_type: {
                model: 'GlazeType',
                fields: {
                    name: { type: 'string' },
                },
            },
            glaze_combination: {
                model: 'GlazeCombination',
                compose_from: {
                    glaze_types: { global: 'glaze_type' },
                },
                fields: {
                    name: { type: 'string' },
                },
            },
        },
        states: [
            {
                id: 'designed',
                visible: true,
                successors: ['wheel_thrown', 'handbuilt'],
            },
            {
                id: 'wheel_thrown',
                visible: true,
                successors: ['trimmed', 'recycled'],
                additional_fields: {
                    clay_weight_grams: {
                        type: 'number',
                        description: 'Weight of clay before trimming',
                    },
                    clay_body: {
                        $ref: '@clay_body.name',
                        can_create: true,
                    },
                },
            },
            {
                id: 'submitted_to_bisque_fire',
                visible: true,
                successors: ['bisque_fired', 'recycled'],
                additional_fields: {
                    kiln_location: {
                        $ref: '@location.name',
                        can_create: true,
                    },
                },
            },
            {
                id: 'trimmed',
                visible: true,
                successors: ['submitted_to_bisque_fire', 'recycled'],
                additional_fields: {
                    trimmed_weight_grams: {
                        type: 'number',
                    },
                    pre_trim_weight_grams: {
                        $ref: 'wheel_thrown.clay_weight_grams',
                        description: 'Weight after trimming',
                    },
                },
            },
            {
                id: 'bisque_fired',
                visible: true,
                successors: ['glazed', 'recycled'],
                additional_fields: {
                    kiln_temperature_c: {
                        type: 'integer',
                    },
                    cone: {
                        type: 'string',
                        enum: ['04', '03', '02', '01'],
                    },
                },
            },
            {
                id: 'glaze_fired',
                visible: true,
                successors: ['completed', 'recycled'],
                additional_fields: {
                    kiln_temperature_c: {
                        $ref: 'bisque_fired.kiln_temperature_c',
                    },
                    cone: {
                        $ref: 'bisque_fired.cone',
                    },
                },
            },
            {
                id: 'recycled',
                visible: true,
                terminal: true,
            },
        ],
    },
}))

import {
    formatWorkflowFieldLabel,
    getAdditionalFieldDefinitions,
    getGlobalComposeFrom,
    getGlobalDisplayField,
} from './workflow'

describe('formatWorkflowFieldLabel', () => {
    it('converts a single snake_case word to Title Case', () => {
        expect(formatWorkflowFieldLabel('name')).toBe('Name')
    })

    it('converts a multi-word snake_case name to Title Case', () => {
        expect(formatWorkflowFieldLabel('clay_weight_grams')).toBe('Clay Weight Grams')
    })
})

describe('getGlobalDisplayField', () => {
    it("returns 'name' when the global declares a name field", () => {
        expect(getGlobalDisplayField('location')).toBe('name')
    })

    it('returns the first declared field when there is no name field', () => {
        expect(getGlobalDisplayField('firing_profile')).toBe('code')
    })

    it("falls back to 'name' for an unknown global", () => {
        expect(getGlobalDisplayField('nonexistent')).toBe('name')
    })
})

describe('getGlobalComposeFrom', () => {
    it('returns the compose_from map for a global that declares it', () => {
        expect(getGlobalComposeFrom('glaze_combination')).toEqual({
            glaze_types: { global: 'glaze_type' },
        })
    })

    it('returns undefined for a global without compose_from', () => {
        expect(getGlobalComposeFrom('location')).toBeUndefined()
    })

    it('returns undefined for an unknown global', () => {
        expect(getGlobalComposeFrom('nonexistent')).toBeUndefined()
    })
})

describe('getAdditionalFieldDefinitions', () => {
    it('returns an empty array for a state with no additional fields', () => {
        expect(getAdditionalFieldDefinitions('designed')).toEqual([])
    })

    it('returns an empty array for an unknown state', () => {
        expect(getAdditionalFieldDefinitions('nonexistent')).toEqual([])
    })

    describe('inline fields', () => {
        it('resolves type, description, and required flag', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            const f = fields.find((f) => f.name === 'clay_weight_grams')!
            expect(f.type).toBe('number')
            expect(f.description).toBe('Weight of clay before trimming')
            expect(f.required).toBe(false)
            expect(f.isGlobalRef).toBe(false)
        })

        it('defaults required to false when not declared', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            const f = fields.find((f) => f.name === 'clay_weight_grams')!
            expect(f.required).toBe(false)
        })
    })

    describe('global ref fields', () => {
        it('sets isGlobalRef, globalName, and globalField', () => {
            const fields = getAdditionalFieldDefinitions('submitted_to_bisque_fire')
            const f = fields.find((f) => f.name === 'kiln_location')!
            expect(f.isGlobalRef).toBe(true)
            expect(f.globalName).toBe('location')
            expect(f.globalField).toBe('name')
        })

        it('sets canCreate true when declared', () => {
            const fields = getAdditionalFieldDefinitions('submitted_to_bisque_fire')
            expect(fields.find((f) => f.name === 'kiln_location')!.canCreate).toBe(true)
        })

        it('resolves the type from the referenced global field', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            expect(fields.find((f) => f.name === 'clay_body')!.type).toBe('string')
        })
    })

    describe('state ref fields', () => {
        it('resolves the type from the referenced state field', () => {
            const fields = getAdditionalFieldDefinitions('trimmed')
            const f = fields.find((f) => f.name === 'pre_trim_weight_grams')!
            expect(f.type).toBe('number')
        })

        it('uses the overridden description from the ref field', () => {
            const fields = getAdditionalFieldDefinitions('trimmed')
            const f = fields.find((f) => f.name === 'pre_trim_weight_grams')!
            expect(f.description).toBe('Weight after trimming')
        })

        it('is not marked as a global ref', () => {
            const fields = getAdditionalFieldDefinitions('trimmed')
            expect(fields.find((f) => f.name === 'pre_trim_weight_grams')!.isGlobalRef).toBe(false)
        })

        it('is marked as a state ref', () => {
            const fields = getAdditionalFieldDefinitions('trimmed')
            expect(fields.find((f) => f.name === 'pre_trim_weight_grams')!.isStateRef).toBe(true)
        })

        it('carries enum values through transitive state refs', () => {
            const fields = getAdditionalFieldDefinitions('glaze_fired')
            expect(fields.find((f) => f.name === 'cone')!.enum).toEqual(['04', '03', '02', '01'])
        })
    })

    describe('inline fields are not state refs', () => {
        it('inline field has isStateRef false', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            expect(fields.find((f) => f.name === 'clay_weight_grams')!.isStateRef).toBe(false)
        })
    })

    describe('global ref fields are not state refs', () => {
        it('global ref field has isStateRef false', () => {
            const fields = getAdditionalFieldDefinitions('submitted_to_bisque_fire')
            expect(fields.find((f) => f.name === 'kiln_location')!.isStateRef).toBe(false)
        })
    })
})
