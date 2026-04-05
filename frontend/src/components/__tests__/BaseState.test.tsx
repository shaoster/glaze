import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import BaseState from '../BaseState'
import type { PieceState } from '../../types'

function makeState(overrides: Partial<PieceState> = {}): PieceState {
    return {
        state: 'designed',
        notes: '',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-01-15T10:00:00Z'),
        location: '',
        images: [],
        previous_state: null,
        next_state: null,
        ...overrides,
    }
}

describe('BaseState', () => {
    it('renders without crashing', () => {
        const { container } = render(<BaseState pieceState={makeState()} />)
        expect(container).toBeInTheDocument()
    })

    it('renders null (no visible output) by default', () => {
        const { container } = render(<BaseState pieceState={makeState()} />)
        expect(container.firstChild).toBeNull()
    })

    it('accepts any valid workflow state', () => {
        const states: PieceState['state'][] = ['designed', 'glazed', 'completed', 'recycled']
        for (const state of states) {
            expect(() => render(<BaseState pieceState={makeState({ state })} />)).not.toThrow()
        }
    })
})
