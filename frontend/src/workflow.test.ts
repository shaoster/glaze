import { describe, it, expect, vi } from 'vitest'

// Minimal fixture — independent of the real workflow.yml so these tests
// don't break when states or globals are added/changed.
vi.mock('../../workflow.yml', () => ({
    default: {
        version: '1.0.0',
        globals: {
            // 'location' has a 'name' field — getGlobalDisplayField should return 'name'
            location: {
                model: 'Location',
                fields: {
                    name: { type: 'string' },
                },
            },
            // 'kiln' has no 'name' field — getGlobalDisplayField should return the first field
            kiln: {
                model: 'Kiln',
                fields: {
                    code: { type: 'string' },
                    capacity: { type: 'integer' },
                },
            },
        },
        states: [
            {
                id: 'designed',
                visible: true,
                successors: ['wheel_thrown', 'recycled'],
                // no additional_fields — getAdditionalFieldDefinitions should return []
            },
            {
                id: 'wheel_thrown',
                visible: true,
                successors: ['trimmed', 'recycled'],
                additional_fields: {
                    clay_weight_grams: {
                        type: 'number',
                        required: true,
                        description: 'Weight of clay before trimming',
                    },
                    clay_type: {
                        type: 'string',
                        enum: ['stoneware', 'earthenware'],
                    },
                    kiln_ref: {
                        $ref: '@kiln.code',
                        can_create: true,
                    },
                    location_ref: {
                        $ref: '@location.name',
                        can_create: false,
                    },
                },
            },
            {
                id: 'trimmed',
                visible: true,
                successors: ['recycled'],
                additional_fields: {
                    // state ref — should resolve to the type of wheel_thrown.clay_weight_grams
                    trimmed_weight_grams: {
                        $ref: 'wheel_thrown.clay_weight_grams',
                        description: 'Weight after trimming',
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
        expect(getGlobalDisplayField('kiln')).toBe('code')
    })

    it("falls back to 'name' for an unknown global", () => {
        expect(getGlobalDisplayField('nonexistent')).toBe('name')
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
            expect(f.required).toBe(true)
            expect(f.isGlobalRef).toBe(false)
        })

        it('defaults required to false when not declared', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            const f = fields.find((f) => f.name === 'clay_type')!
            expect(f.required).toBe(false)
        })

        it('carries enum values through', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            const f = fields.find((f) => f.name === 'clay_type')!
            expect(f.enum).toEqual(['stoneware', 'earthenware'])
        })
    })

    describe('global ref fields', () => {
        it('sets isGlobalRef, globalName, and globalField', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            const f = fields.find((f) => f.name === 'kiln_ref')!
            expect(f.isGlobalRef).toBe(true)
            expect(f.globalName).toBe('kiln')
            expect(f.globalField).toBe('code')
        })

        it('sets canCreate true when declared', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            expect(fields.find((f) => f.name === 'kiln_ref')!.canCreate).toBe(true)
        })

        it('sets canCreate false when not declared', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            expect(fields.find((f) => f.name === 'location_ref')!.canCreate).toBe(false)
        })

        it('resolves the type from the referenced global field', () => {
            const fields = getAdditionalFieldDefinitions('wheel_thrown')
            expect(fields.find((f) => f.name === 'kiln_ref')!.type).toBe('string')
        })
    })

    describe('state ref fields', () => {
        it('resolves the type from the referenced state field', () => {
            const fields = getAdditionalFieldDefinitions('trimmed')
            const f = fields.find((f) => f.name === 'trimmed_weight_grams')!
            expect(f.type).toBe('number')
        })

        it('uses the overridden description from the ref field', () => {
            const fields = getAdditionalFieldDefinitions('trimmed')
            const f = fields.find((f) => f.name === 'trimmed_weight_grams')!
            expect(f.description).toBe('Weight after trimming')
        })

        it('is not marked as a global ref', () => {
            const fields = getAdditionalFieldDefinitions('trimmed')
            expect(fields.find((f) => f.name === 'trimmed_weight_grams')!.isGlobalRef).toBe(false)
        })
    })
})
