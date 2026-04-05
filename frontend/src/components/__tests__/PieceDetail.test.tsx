import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PieceDetail from '../PieceDetail'
import type { PieceDetail as PieceDetailType, PieceState } from '../../types'
import * as api from '../../api'

vi.mock('../../api', () => ({
    fetchLocations: vi.fn().mockResolvedValue([]),
    updateCurrentState: vi.fn(),
    addPieceState: vi.fn(),
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

function makePiece(overrides: Partial<PieceDetailType> = {}): PieceDetailType {
    const state = makeState()
    return {
        id: 'piece-id-1',
        name: 'Test Bowl',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-01-15T10:00:00Z'),
        thumbnail: '/thumbnails/bowl.svg',
        current_state: state,
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
    vi.mocked(api.fetchLocations).mockResolvedValue([])
})

describe('PieceDetail', () => {
    it('renders piece name', () => {
        renderPieceDetail()
        expect(screen.getByText('Test Bowl')).toBeInTheDocument()
    })

    it('renders current state label', () => {
        renderPieceDetail()
        expect(screen.getAllByText('designed').length).toBeGreaterThan(0)
    })

    it('renders thumbnail image', () => {
        renderPieceDetail()
        const imgs = screen.getAllByRole('img')
        expect(imgs.some((img) => img.getAttribute('src') === '/thumbnails/bowl.svg')).toBe(true)
    })

    it('renders successor state buttons for non-terminal state', () => {
        renderPieceDetail()
        // 'designed' has successors: wheel_thrown, handbuilt
        expect(screen.getByRole('button', { name: 'wheel_thrown' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'handbuilt' })).toBeInTheDocument()
    })

    it('shows terminal state alert for terminal states', () => {
        const piece = makePiece({ current_state: makeState({ state: 'completed' }), history: [makeState({ state: 'completed' })] })
        renderPieceDetail(piece)
        expect(screen.getByText(/terminal state/i)).toBeInTheDocument()
    })

    it('shows no transition buttons for terminal states', () => {
        const piece = makePiece({ current_state: makeState({ state: 'completed' }), history: [makeState({ state: 'completed' })] })
        renderPieceDetail(piece)
        expect(screen.queryByRole('button', { name: 'wheel_thrown' })).not.toBeInTheDocument()
    })

    it('transition buttons disabled when there are unsaved changes', async () => {
        renderPieceDetail()
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Dirty notes' } })
        const transitionBtn = screen.getByRole('button', { name: 'wheel_thrown' })
        expect(transitionBtn).toBeDisabled()
    })

    it('clicking transition button opens confirmation dialog', () => {
        renderPieceDetail()
        fireEvent.click(screen.getByRole('button', { name: 'wheel_thrown' }))
        expect(screen.getByText(/Confirm State Transition/i)).toBeInTheDocument()
    })

    it('confirmation dialog shows from/to states', () => {
        renderPieceDetail()
        fireEvent.click(screen.getByRole('button', { name: 'wheel_thrown' }))
        // The dialog body contains both state names
        expect(screen.getAllByText(/designed/).length).toBeGreaterThan(0)
        expect(screen.getAllByText(/wheel_thrown/).length).toBeGreaterThan(0)
    })

    it('cancelling confirmation closes dialog', async () => {
        renderPieceDetail()
        fireEvent.click(screen.getByRole('button', { name: 'wheel_thrown' }))
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
        fireEvent.click(screen.getByRole('button', { name: 'wheel_thrown' }))
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
        expect(screen.getByText('designed')).toBeInTheDocument()
    })

    it('no history panel when piece has only one state', () => {
        renderPieceDetail()
        expect(screen.queryByRole('button', { name: /show history/i })).not.toBeInTheDocument()
    })
})
