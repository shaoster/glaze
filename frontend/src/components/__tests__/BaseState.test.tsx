import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BaseState from '../BaseState'
import type { PieceState, PieceDetail } from '../../types'
import * as api from '../../api'

// Mock the api module
vi.mock('../../api', () => ({
    fetchLocations: vi.fn().mockResolvedValue([]),
    updateCurrentState: vi.fn(),
    createLocation: vi.fn(),
}))

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

function makePieceDetail(overrides: Partial<PieceDetail> = {}): PieceDetail {
    const state = makeState()
    return {
        id: 'test-piece-id',
        name: 'Test Bowl',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-01-15T10:00:00Z'),
        thumbnail: '',
        current_state: state,
        history: [state],
        ...overrides,
    }
}

const defaultProps = {
    pieceState: makeState(),
    pieceId: 'test-piece-id',
    onSaved: vi.fn(),
    onDirtyChange: vi.fn(),
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchLocations).mockResolvedValue([])
})

describe('BaseState', () => {
    it('renders without crashing', () => {
        const { container } = render(<BaseState {...defaultProps} />)
        expect(container).toBeInTheDocument()
    })

    it('renders a Notes field', () => {
        render(<BaseState {...defaultProps} />)
        expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    })

    it('renders a Location field', () => {
        render(<BaseState {...defaultProps} />)
        expect(screen.getByLabelText('Location')).toBeInTheDocument()
    })

    it('renders a Save button', () => {
        render(<BaseState {...defaultProps} />)
        expect(screen.getByTestId('save-button')).toBeInTheDocument()
    })

    it('Save button is disabled when no changes', () => {
        render(<BaseState {...defaultProps} />)
        expect(screen.getByTestId('save-button')).toBeDisabled()
    })

    it('shows notes from pieceState', () => {
        render(<BaseState {...defaultProps} pieceState={makeState({ notes: 'Some notes' })} />)
        expect(screen.getByLabelText('Notes')).toHaveValue('Some notes')
    })

    it('Save button enabled after editing notes', () => {
        render(<BaseState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New notes' } })
        expect(screen.getByTestId('save-button')).not.toBeDisabled()
    })

    it('shows unsaved indicator after editing', () => {
        render(<BaseState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Changed' } })
        expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
    })

    it('no unsaved indicator when not dirty', () => {
        render(<BaseState {...defaultProps} />)
        expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument()
    })

    it('calls onSaved after successful save', async () => {
        const updated = makePieceDetail()
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        const onSaved = vi.fn()
        render(<BaseState {...defaultProps} onSaved={onSaved} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New notes' } })
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    })

    it('shows error message on save failure', async () => {
        vi.mocked(api.updateCurrentState).mockRejectedValue(new Error('Network error'))
        render(<BaseState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New notes' } })
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() => expect(screen.getByText('Failed to save. Please try again.')).toBeInTheDocument())
    })

    it('calls onDirtyChange with true when dirty', () => {
        const onDirtyChange = vi.fn()
        render(<BaseState {...defaultProps} onDirtyChange={onDirtyChange} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Changed' } })
        expect(onDirtyChange).toHaveBeenCalledWith(true)
    })

    it('calls onDirtyChange with false when reverted', () => {
        const onDirtyChange = vi.fn()
        render(<BaseState {...defaultProps} pieceState={makeState({ notes: 'original' })} onDirtyChange={onDirtyChange} />)
        // Change and revert
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'changed' } })
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'original' } })
        expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('adds an image entry', () => {
        render(<BaseState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'http://example.com/img.jpg' } })
        fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'A test image' } })
        fireEvent.click(screen.getByText('+ Add Image'))
        expect(screen.getByText('A test image')).toBeInTheDocument()
    })

    it('accepts any valid workflow state', () => {
        const states: PieceState['state'][] = ['designed', 'glazed', 'completed', 'recycled']
        for (const state of states) {
            expect(() => render(<BaseState {...defaultProps} pieceState={makeState({ state })} />)).not.toThrow()
        }
    })
})
