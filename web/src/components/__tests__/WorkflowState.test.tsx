import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WorkflowState from '../WorkflowState'
import type { PieceState, PieceDetail } from '@common/types'
import * as api from '@common/api'

// Mock the api module
vi.mock('@common/api', () => ({
    fetchGlobalEntries: vi.fn().mockResolvedValue([]),
    updateCurrentState: vi.fn(),
    updatePiece: vi.fn(),
    createGlobalEntry: vi.fn(),
}))

function makeState(overrides: Partial<PieceState> = {}): PieceState {
    return {
        state: 'designed',
        notes: '',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-01-15T10:00:00Z'),
        images: [],
        previous_state: null,
        next_state: null,
        additional_fields: {},
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
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([])
})

describe('WorkflowState', () => {
    it('renders without crashing', () => {
        const { container } = render(<WorkflowState {...defaultProps} />)
        expect(container).toBeInTheDocument()
    })

    it('renders a Notes field', () => {
        render(<WorkflowState {...defaultProps} />)
        expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    })

    it('renders state-specific fields when the state defines additional_fields', () => {
        const bisqueState = makeState({
            state: 'bisque_fired',
            additional_fields: { kiln_temperature_c: '1200', cone: '04' },
        })
        render(<WorkflowState {...defaultProps} pieceState={bisqueState} />)
        const tempInput = screen.getByLabelText('Kiln Temperature C')
        expect(tempInput).toBeInTheDocument()
        expect(tempInput).toHaveAttribute('type', 'number')
        expect(screen.getByLabelText('Cone')).toBeInTheDocument()
    })

    it('renders state-reference additional fields with their values', () => {
        const trimmedState = makeState({
            state: 'trimmed',
            additional_fields: { trimmed_weight_grams: 900, pre_trim_weight_grams: 1200 },
        })
        render(<WorkflowState {...defaultProps} pieceState={trimmedState} />)
        expect(screen.getByLabelText('Trimmed Weight Grams')).toHaveValue(900)
        expect(screen.getByLabelText('Pre Trim Weight Grams')).toHaveValue(1200)
    })

    it('renders state ref fields as disabled (read-only)', () => {
        const trimmedState = makeState({
            state: 'trimmed',
            additional_fields: { pre_trim_weight_grams: 1200 },
        })
        render(<WorkflowState {...defaultProps} pieceState={trimmedState} />)
        expect(screen.getByLabelText('Pre Trim Weight Grams')).toBeDisabled()
    })

    it('renders inline additional fields as editable', () => {
        const trimmedState = makeState({
            state: 'trimmed',
            additional_fields: { trimmed_weight_grams: 900 },
        })
        render(<WorkflowState {...defaultProps} pieceState={trimmedState} />)
        expect(screen.getByLabelText('Trimmed Weight Grams')).not.toBeDisabled()
    })

    it('lets you choose an existing global reference option', async () => {
        vi.mocked(api.fetchGlobalEntries).mockResolvedValue(['Kiln A'])
        const globalState = makeState({
            state: 'submitted_to_bisque_fire',
            additional_fields: { kiln_location: '' },
        })
        render(<WorkflowState {...defaultProps} pieceState={globalState} />)
        const input = screen.getByLabelText('Kiln Location')
        await userEvent.type(input, 'Kiln')
        await waitFor(() => expect(screen.getByRole('option', { name: 'Kiln A' })).toBeInTheDocument())
        await userEvent.click(screen.getByRole('option', { name: 'Kiln A' }))
        expect(input).toHaveValue('Kiln A')
    })

    it('allows creating a new global reference option', async () => {
        vi.mocked(api.fetchGlobalEntries).mockResolvedValue([])
        let resolveCreate!: (value: string) => void
        const createPromise = new Promise<string>((resolve) => {
            resolveCreate = resolve
        })
        vi.mocked(api.createGlobalEntry).mockReturnValue(createPromise)
        const globalState = makeState({
            state: 'submitted_to_bisque_fire',
            additional_fields: { kiln_location: '' },
        })
        render(<WorkflowState {...defaultProps} pieceState={globalState} />)
        const input = screen.getByLabelText('Kiln Location')
        await userEvent.type(input, 'New Kiln')
        await waitFor(() =>
            expect(screen.getByRole('option', { name: 'Create "New Kiln"' })).toBeInTheDocument()
        )
        fireEvent.click(screen.getByRole('option', { name: 'Create "New Kiln"' }))
        expect(input).not.toHaveValue('New Kiln')
        await waitFor(() =>
            expect(api.createGlobalEntry).toHaveBeenCalledWith('location', 'name', 'New Kiln')
        )
        await act(async () => resolveCreate('New Kiln'))
        await waitFor(() => expect(input).toHaveValue('New Kiln'))
    })

    it('fetches global entries for createable global refs', async () => {
        const withGlobalRef = makeState({
            state: 'submitted_to_bisque_fire',
            additional_fields: { kiln_location: '' },
        })
        render(<WorkflowState {...defaultProps} pieceState={withGlobalRef} />)
        await waitFor(() => expect(api.fetchGlobalEntries).toHaveBeenCalledWith('location'))
    })

    it('does not update current_location until save is pressed', async () => {
        const updated = makePieceDetail({
            current_state: makeState({ notes: 'new' }),
            current_location: 'Shelf B',
        })
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        vi.mocked(api.updatePiece).mockResolvedValue(updated)
        let resolveCreate!: (value: string) => void
        const createPromise = new Promise<string>((resolve) => {
            resolveCreate = resolve
        })
        vi.mocked(api.createGlobalEntry).mockReturnValue(createPromise)
        render(
            <WorkflowState
                {...defaultProps}
                onSaved={vi.fn()}
                pieceState={makeState({ notes: 'Original' })}
            />
        )
        const input = screen.getByLabelText('Current location')
        await userEvent.type(input, 'New Shelf')
        await waitFor(() =>
            expect(screen.getByRole('option', { name: 'Create "New Shelf"' })).toBeInTheDocument()
        )
        fireEvent.click(screen.getByRole('option', { name: 'Create "New Shelf"' }))
        expect(input).not.toHaveValue('New Shelf')
        await waitFor(() =>
            expect(api.createGlobalEntry).toHaveBeenCalledWith('location', 'name', 'New Shelf')
        )
        await act(async () => resolveCreate('New Shelf'))
        await waitFor(() => expect(input).toHaveValue('New Shelf'))
        expect(api.updatePiece).not.toHaveBeenCalled()
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() =>
            expect(api.updatePiece).toHaveBeenCalledWith('test-piece-id', { current_location: 'New Shelf' })
        )
    })

    it('renders a Save button', () => {
        render(<WorkflowState {...defaultProps} />)
        expect(screen.getByTestId('save-button')).toBeInTheDocument()
    })

    it('Save button is disabled when no changes', () => {
        render(<WorkflowState {...defaultProps} />)
        expect(screen.getByTestId('save-button')).toBeDisabled()
    })

    it('shows notes from pieceState', () => {
        render(<WorkflowState {...defaultProps} pieceState={makeState({ notes: 'Some notes' })} />)
        expect(screen.getByLabelText('Notes')).toHaveValue('Some notes')
    })

    it('Save button enabled after editing notes', () => {
        render(<WorkflowState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New notes' } })
        expect(screen.getByTestId('save-button')).not.toBeDisabled()
    })

    it('shows unsaved indicator after editing', () => {
        render(<WorkflowState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Changed' } })
        expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
    })

    it('no unsaved indicator when not dirty', () => {
        render(<WorkflowState {...defaultProps} />)
        expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument()
    })

    it('calls onSaved after successful save', async () => {
        const updated = makePieceDetail()
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        const onSaved = vi.fn()
        render(<WorkflowState {...defaultProps} onSaved={onSaved} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New notes' } })
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    })

    it('shows error message on save failure', async () => {
        vi.mocked(api.updateCurrentState).mockRejectedValue(new Error('Network error'))
        render(<WorkflowState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'New notes' } })
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() => expect(screen.getByText('Failed to save. Please try again.')).toBeInTheDocument())
    })

    it('remains dirty when current state API fails during save', async () => {
        vi.mocked(api.updateCurrentState).mockRejectedValue(new Error('Network error'))
        render(<WorkflowState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Dirty notes' } })
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() => expect(screen.getByText('Failed to save. Please try again.')).toBeInTheDocument())
        expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
        expect(screen.getByTestId('save-button')).not.toBeDisabled()
    })

    it('remains dirty when piece API fails during save', async () => {
        const updated = makePieceDetail()
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        vi.mocked(api.updatePiece).mockRejectedValue(new Error('Network error'))
        render(
            <WorkflowState
                {...defaultProps}
                currentLocation=""
            />
        )
        const input = screen.getByLabelText('Current location')
        await userEvent.type(input, 'Shelf Z')
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() => expect(screen.getByText('Failed to save. Please try again.')).toBeInTheDocument())
        expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument()
        expect(screen.getByTestId('save-button')).not.toBeDisabled()
        expect(api.updatePiece).toHaveBeenCalledWith('test-piece-id', { current_location: 'Shelf Z' })
    })

    it('calls onDirtyChange with true when dirty', () => {
        const onDirtyChange = vi.fn()
        render(<WorkflowState {...defaultProps} onDirtyChange={onDirtyChange} />)
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Changed' } })
        expect(onDirtyChange).toHaveBeenCalledWith(true)
    })

    it('calls onDirtyChange with false when reverted', () => {
        const onDirtyChange = vi.fn()
        render(<WorkflowState {...defaultProps} pieceState={makeState({ notes: 'original' })} onDirtyChange={onDirtyChange} />)
        // Change and revert
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'changed' } })
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'original' } })
        expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('adds an image entry', () => {
        render(<WorkflowState {...defaultProps} />)
        fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'http://example.com/img.jpg' } })
        fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'A test image' } })
        fireEvent.click(screen.getByText('+ Add Image'))
        expect(screen.getByText('A test image')).toBeInTheDocument()
    })

    it('accepts any valid workflow state', () => {
        const states: PieceState['state'][] = ['designed', 'glazed', 'completed', 'recycled']
        for (const state of states) {
            expect(() => render(<WorkflowState {...defaultProps} pieceState={makeState({ state })} />)).not.toThrow()
        }
    })
})
