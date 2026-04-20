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
    fetchCloudinaryWidgetConfig: vi.fn().mockResolvedValue({ cloud_name: 'demo', api_key: '123456' }),
    signCloudinaryWidgetParams: vi.fn().mockResolvedValue('mock-signature'),
}))

// Render CloudinaryImage as a plain <img> so tests can assert on src/testid
vi.mock('../CloudinaryImage', () => ({
    default: ({ url, 'data-testid': testId, style, onLoad }: {
        url: string
        'data-testid'?: string
        style?: React.CSSProperties
        onLoad?: React.ReactEventHandler<HTMLImageElement>
    }) => <img src={url} data-testid={testId} style={style} onLoad={onLoad} />,
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
        current_location: '',
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

const noop = () => {}

// Helper to simulate a successful Cloudinary Upload Widget upload.
// The widget fires display-changed (shown) then success when open() is called.
function setupUploadWidget(overrides: { secure_url?: string; public_id?: string } = {}) {
    const secure_url = overrides.secure_url ?? 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
    const public_id = overrides.public_id ?? 'sample'
    window.cloudinary = {
        createUploadWidget: vi.fn((_options, callback) => ({
            open: vi.fn(() => {
                callback(null, { event: 'display-changed', info: { state: 'shown' } })
                callback(null, { event: 'success', info: { secure_url, public_id, resource_type: 'image' } })
            }),
            close: noop,
            destroy: noop,
        })),
        openUploadWidget: vi.fn(),
    }
}

// Helper that sets up a controllable widget — events are fired manually via the
// returned triggerEvent function, allowing assertions mid-flight.
function setupControllableWidget() {
    let savedCallback: ((error: unknown, result: unknown) => void) = noop
    window.cloudinary = {
        createUploadWidget: vi.fn((_options, callback) => {
            savedCallback = callback
            return { open: vi.fn(), close: noop, destroy: noop }
        }),
        openUploadWidget: vi.fn(),
    }
    return {
        triggerEvent: (event: string, info: unknown) =>
            savedCallback(null, { event, info }),
        triggerError: (err: Error) =>
            savedCallback(err, { event: 'error', info: { secure_url: '', public_id: '', resource_type: 'image' } }),
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([])
    // Reset window.cloudinary between tests
    window.cloudinary = undefined
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
        vi.mocked(api.fetchGlobalEntries).mockResolvedValue([{ id: 'loc1', name: 'Kiln A', isPublic: false }])
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
        vi.mocked(api.fetchGlobalEntries).mockResolvedValue([{ id: '1', name: 'Shelf Z', isPublic: false }])
        render(
            <WorkflowState
                {...defaultProps}
                currentLocation=""
            />
        )
        const input = screen.getByLabelText('Current location')
        await userEvent.type(input, 'Shelf Z')
        await waitFor(() =>
            expect(screen.getByRole('option', { name: 'Shelf Z' })).toBeInTheDocument()
        )
        fireEvent.click(screen.getByRole('option', { name: 'Shelf Z' }))
        await waitFor(() => expect(input).toHaveValue('Shelf Z'))
        await userEvent.click(screen.getByTestId('save-button'))
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

    it('upload button is always visible', () => {
        render(<WorkflowState {...defaultProps} />)
        expect(screen.getByRole('button', { name: 'Upload Image' })).toBeInTheDocument()
    })

    it('successful widget upload immediately saves the image to state', async () => {
        const updated = makePieceDetail()
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        setupUploadWidget({ secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', public_id: 'sample' })
        render(<WorkflowState {...defaultProps} />)
        fireEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        await waitFor(() => expect(api.updateCurrentState).toHaveBeenCalledWith(
            'test-piece-id',
            expect.objectContaining({
                images: expect.arrayContaining([
                    expect.objectContaining({ url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg', cloudinary_public_id: 'sample' }),
                ]),
            })
        ))
    })

    it('widget upload error shows error message', async () => {
        const { triggerError } = setupControllableWidget()
        render(<WorkflowState {...defaultProps} />)
        fireEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        // Wait for createUploadWidget to have been called (config fetch has resolved)
        await waitFor(() => expect(window.cloudinary!.createUploadWidget).toHaveBeenCalled())
        await act(async () => triggerError(new Error('Upload failed')))
        await waitFor(() => expect(screen.getByText('Upload failed. Please try again.')).toBeInTheDocument())
    })

    it('upload button shows spinner and is disabled while widget is loading', async () => {
        setupControllableWidget()
        render(<WorkflowState {...defaultProps} />)
        fireEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        // widgetLoading is set synchronously on click, before the async config fetch
        expect(screen.getByRole('button', { name: 'Upload Image' })).toBeDisabled()
        expect(screen.getByRole('progressbar', { hidden: true })).toBeInTheDocument()
    })

    it('upload button re-enables after display-changed shown', async () => {
        const { triggerEvent } = setupControllableWidget()
        render(<WorkflowState {...defaultProps} />)
        fireEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        await waitFor(() => expect(window.cloudinary!.createUploadWidget).toHaveBeenCalled())
        await act(async () => triggerEvent('display-changed', { state: 'shown' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Upload Image' })).not.toBeDisabled())
        expect(screen.queryByRole('progressbar', { hidden: true })).not.toBeInTheDocument()
    })

    it('upload button re-enables after widget error', async () => {
        const { triggerError } = setupControllableWidget()
        render(<WorkflowState {...defaultProps} />)
        fireEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        await waitFor(() => expect(window.cloudinary!.createUploadWidget).toHaveBeenCalled())
        await act(async () => triggerError(new Error('Upload failed')))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Upload Image' })).not.toBeDisabled())
        expect(screen.queryByRole('progressbar', { hidden: true })).not.toBeInTheDocument()
    })

    it('widget config fetch failure shows error message', async () => {
        vi.mocked(api.fetchCloudinaryWidgetConfig).mockRejectedValue(new Error('Network error'))
        render(<WorkflowState {...defaultProps} />)
        fireEvent.click(screen.getByRole('button', { name: 'Upload Image' }))
        await waitFor(() => expect(screen.getByText('Failed to load upload configuration. Please try again.')).toBeInTheDocument())
    })

    it('prompts for confirmation before removing an image and removes on confirm', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const updated = makePieceDetail({ current_state: makeState({ images: [] }) })
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        render(<WorkflowState {...defaultProps} pieceState={makeState({ images: [{ url: 'http://example.com/img.jpg', caption: 'To delete', created: new Date() }] })} />)
        fireEvent.click(screen.getByRole('button', { name: 'remove image' }))
        expect(window.confirm).toHaveBeenCalledWith('Remove this image?')
        await waitFor(() => expect(api.updateCurrentState).toHaveBeenCalled())
    })

    it('clicking the pencil icon makes the caption editable', () => {
        render(<WorkflowState {...defaultProps} pieceState={makeState({ images: [{ url: 'http://example.com/img.jpg', caption: 'My caption', created: new Date() }] })} />)
        fireEvent.click(screen.getByRole('button', { name: 'edit caption' }))
        expect(screen.getByRole('textbox', { name: 'Edit caption' })).toBeInTheDocument()
        expect(screen.queryByText('My caption')).not.toBeInTheDocument()
    })

    it('persists caption change on blur and exits edit mode', async () => {
        const updated = makePieceDetail()
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        render(<WorkflowState {...defaultProps} pieceState={makeState({ images: [{ url: 'http://example.com/img.jpg', caption: 'Old', created: new Date() }] })} />)
        fireEvent.click(screen.getByRole('button', { name: 'edit caption' }))
        const input = screen.getByRole('textbox', { name: 'Edit caption' })
        fireEvent.change(input, { target: { value: 'New caption' } })
        fireEvent.blur(input)
        await waitFor(() => expect(api.updateCurrentState).toHaveBeenCalledWith(
            'test-piece-id',
            expect.objectContaining({ images: expect.arrayContaining([expect.objectContaining({ caption: 'New caption' })]) })
        ))
        expect(screen.queryByRole('textbox', { name: 'Edit caption' })).not.toBeInTheDocument()
    })

    it('skips server call when caption is unchanged on blur', () => {
        render(<WorkflowState {...defaultProps} pieceState={makeState({ images: [{ url: 'http://example.com/img.jpg', caption: 'Same', created: new Date() }] })} />)
        fireEvent.click(screen.getByRole('button', { name: 'edit caption' }))
        const input = screen.getByRole('textbox', { name: 'Edit caption' })
        fireEvent.blur(input)
        expect(api.updateCurrentState).not.toHaveBeenCalled()
    })

    it('pressing Escape exits edit mode without saving', () => {
        render(<WorkflowState {...defaultProps} pieceState={makeState({ images: [{ url: 'http://example.com/img.jpg', caption: 'Keep', created: new Date() }] })} />)
        fireEvent.click(screen.getByRole('button', { name: 'edit caption' }))
        const input = screen.getByRole('textbox', { name: 'Edit caption' })
        fireEvent.change(input, { target: { value: 'Changed' } })
        fireEvent.keyDown(input, { key: 'Escape' })
        expect(api.updateCurrentState).not.toHaveBeenCalled()
        expect(screen.queryByRole('textbox', { name: 'Edit caption' })).not.toBeInTheDocument()
    })

    it('does not remove image when confirmation is cancelled', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(<WorkflowState {...defaultProps} pieceState={makeState({ images: [{ url: 'http://example.com/img.jpg', caption: 'Keep me', created: new Date() }] })} />)
        fireEvent.click(screen.getByRole('button', { name: 'remove image' }))
        expect(screen.getByText('Keep me')).toBeInTheDocument()
    })


    it('accepts any valid workflow state', () => {
        const states: PieceState['state'][] = ['designed', 'glazed', 'completed', 'recycled']
        for (const state of states) {
            expect(() => render(<WorkflowState {...defaultProps} pieceState={makeState({ state })} />)).not.toThrow()
        }
    })
})
