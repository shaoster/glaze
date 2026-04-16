import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PieceDetail from '../PieceDetail'
import type { PieceDetail as PieceDetailType, PieceState } from '@common/types'
import * as api from '@common/api'

vi.mock('@common/api', () => ({
    fetchGlobalEntries: vi.fn().mockResolvedValue([]),
    updateCurrentState: vi.fn(),
    addPieceState: vi.fn(),
    updatePiece: vi.fn(),
    createGlobalEntry: vi.fn(),
    hasCloudinaryUploadConfig: vi.fn().mockReturnValue(false),
    uploadImageToCloudinary: vi.fn(),
}))

function makeState(overrides: Partial<PieceState> = {}): PieceState {
    return {
        state: 'designed',
        notes: '',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-01-15T10:00:00Z'),
        images: [],
        additional_fields: {},
        previous_state: null,
        next_state: null,
        ...overrides,
    }
}

function makePiece(overrides: Partial<PieceDetailType> = {}): PieceDetailType {
    const state = makeState()
    return {
        id: 'piece-id-1',
        name: 'Test Bowl',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-01-15T10:00:00Z'),
        thumbnail: '/thumbnails/bowl.svg',
        current_state: state,
        current_location: '',
        history: [state],
        ...overrides,
    }
}

function renderPieceDetail(piece = makePiece(), onPieceUpdated = vi.fn()) {
    // Use createMemoryRouter (data router) so useBlocker works in tests
    const router = createMemoryRouter(
        [{ path: '/pieces/:id', element: <PieceDetail piece={piece} onPieceUpdated={onPieceUpdated} /> }],
        { initialEntries: ['/pieces/piece-id-1'] }
    )
    return render(<RouterProvider router={router} />)
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([])
})

describe('PieceDetail', () => {
    it('renders piece name', () => {
        renderPieceDetail()
        expect(screen.getByText('Test Bowl')).toBeInTheDocument()
    })

    it('renders current state label', () => {
        renderPieceDetail()
        expect(screen.getAllByText('Designed').length).toBeGreaterThan(0)
    })

    it('renders thumbnail image', () => {
        renderPieceDetail()
        const imgs = screen.getAllByRole('img')
        expect(imgs.some((img) => img.getAttribute('src') === '/thumbnails/bowl.svg')).toBe(true)
    })

    it('renders current location input', () => {
        renderPieceDetail()
        expect(screen.getByLabelText('Current location')).toBeInTheDocument()
    })

    it('creates a new current location through the autocomplete', async () => {
        const updated = makePiece({ current_location: 'Studio K' })
        vi.mocked(api.fetchGlobalEntries).mockResolvedValue([])
        vi.mocked(api.createGlobalEntry).mockResolvedValue('Studio K')
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        vi.mocked(api.updatePiece).mockResolvedValue(updated)
        const onPieceUpdated = vi.fn()
        renderPieceDetail(undefined, onPieceUpdated)
        const input = screen.getByLabelText('Current location')
        await userEvent.type(input, 'Studio K')
        await waitFor(() =>
            expect(screen.getByRole('option', { name: 'Create "Studio K"' })).toBeInTheDocument()
        )
        fireEvent.click(screen.getByRole('option', { name: 'Create "Studio K"' }))
        await waitFor(() =>
            expect(api.createGlobalEntry).toHaveBeenCalledWith('location', 'name', 'Studio K')
        )
        await waitFor(() => expect(input).toHaveValue('Studio K'))
        fireEvent.click(screen.getByTestId('save-button'))
        await waitFor(() =>
            expect(api.updatePiece).toHaveBeenCalledWith('piece-id-1', { current_location: 'Studio K' })
        )
        await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated))
    })

    it('saves location updates when confirmed', async () => {
        const updated = makePiece({ current_location: 'Studio 7' })
        vi.mocked(api.updateCurrentState).mockResolvedValue(updated)
        vi.mocked(api.updatePiece).mockResolvedValue(updated)
        const onPieceUpdated = vi.fn()
        renderPieceDetail(undefined, onPieceUpdated)
        const input = screen.getByLabelText('Current location')
        await userEvent.type(input, 'Studio 7')
        await userEvent.click(screen.getByTestId('save-button'))
        await waitFor(() =>
            expect(api.updatePiece).toHaveBeenCalledWith('piece-id-1', { current_location: 'Studio 7' })
        )
        await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated))
    })

    it('renders successor state buttons for non-terminal state', () => {
        renderPieceDetail()
        // 'designed' has successors: wheel_thrown, handbuilt
        expect(screen.getByRole('button', { name: 'Wheel Thrown' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Handbuilt' })).toBeInTheDocument()
    })

    it('shows terminal state alert for terminal states', () => {
        const piece = makePiece({ current_state: makeState({ state: 'completed' }), history: [makeState({ state: 'completed' })] })
        renderPieceDetail(piece)
        expect(screen.getByText(/terminal state/i)).toBeInTheDocument()
    })

    it('shows no transition buttons for terminal states', () => {
        const piece = makePiece({ current_state: makeState({ state: 'completed' }), history: [makeState({ state: 'completed' })] })
        renderPieceDetail(piece)
        expect(screen.queryByRole('button', { name: 'Wheel Thrown' })).not.toBeInTheDocument()
    })

    it('transition buttons disabled when there are unsaved changes', async () => {
        renderPieceDetail()
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Dirty notes' } })
        const transitionBtn = screen.getByRole('button', { name: 'Wheel Thrown' })
        expect(transitionBtn).toBeDisabled()
    })

    it('clicking transition button opens confirmation dialog', () => {
        renderPieceDetail()
        fireEvent.click(screen.getByRole('button', { name: 'Wheel Thrown' }))
        expect(screen.getByText(/Confirm State Transition/i)).toBeInTheDocument()
    })

    it('confirmation dialog shows from/to states', () => {
        renderPieceDetail()
        fireEvent.click(screen.getByRole('button', { name: 'Wheel Thrown' }))
        // The dialog body contains both state names (human-readable)
        expect(screen.getAllByText(/Designed/).length).toBeGreaterThan(0)
        expect(screen.getAllByText(/Wheel Thrown/).length).toBeGreaterThan(0)
    })

    it('cancelling confirmation closes dialog', async () => {
        renderPieceDetail()
        fireEvent.click(screen.getByRole('button', { name: 'Wheel Thrown' }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() =>
            expect(screen.queryByText(/Confirm State Transition/i)).not.toBeInTheDocument()
        )
    })

    it('confirming transition calls addPieceState', async () => {
        const updated = makePiece({ current_state: makeState({ state: 'wheel_thrown' }) })
        vi.mocked(api.addPieceState).mockResolvedValue(updated)
        const onPieceUpdated = vi.fn()
        renderPieceDetail(makePiece(), onPieceUpdated)
        fireEvent.click(screen.getByRole('button', { name: 'Wheel Thrown' }))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
        await waitFor(() => expect(api.addPieceState).toHaveBeenCalledWith('piece-id-1', { state: 'wheel_thrown' }))
        await waitFor(() => expect(onPieceUpdated).toHaveBeenCalledWith(updated))
    })

    it('history panel hidden by default', () => {
        const piece = makePiece({
            history: [makeState({ state: 'designed' }), makeState({ state: 'wheel_thrown' })],
            current_state: makeState({ state: 'wheel_thrown' }),
        })
        renderPieceDetail(piece)
        expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument()
    })

    it('history panel toggles on click', () => {
        const piece = makePiece({
            history: [
                makeState({ state: 'designed', created: new Date('2024-01-14T10:00:00Z') }),
                makeState({ state: 'wheel_thrown', created: new Date('2024-01-15T10:00:00Z') }),
            ],
            current_state: makeState({ state: 'wheel_thrown', created: new Date('2024-01-15T10:00:00Z') }),
        })
        renderPieceDetail(piece)
        fireEvent.click(screen.getByRole('button', { name: /show history/i }))
        expect(screen.getByText('Designed')).toBeInTheDocument()
    })

    it('no history panel when piece has only one state', () => {
        renderPieceDetail()
        expect(screen.queryByRole('button', { name: /show history/i })).not.toBeInTheDocument()
    })
})
