import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PieceList from '../PieceList'
import type { PieceSummary } from '@common/types'

function makePiece(overrides: Partial<PieceSummary> = {}): PieceSummary {
    return {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        name: 'Clay Bowl',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-02-20T12:00:00Z'),
        thumbnail: 'https://example.com/bowl.jpg',
        current_location: null,
        current_state: { state: 'designed' } as any,
        ...overrides,
    }
}

function renderPieceList(pieces: PieceSummary[]) {
    const router = createMemoryRouter(
        [{ path: '/', element: <PieceList pieces={pieces} /> }],
        { initialEntries: ['/'] }
    )
    return render(<RouterProvider router={router} />)
}

describe('PieceList', () => {
    describe('table headers', () => {
        it('renders all column headers', () => {
            renderPieceList([])
            expect(screen.getByText('Thumbnail')).toBeInTheDocument()
            expect(screen.getByText('Name')).toBeInTheDocument()
            expect(screen.getByText('State')).toBeInTheDocument()
            expect(screen.getByText('Created')).toBeInTheDocument()
            expect(screen.getByText('Last Modified')).toBeInTheDocument()
        })
    })

    describe('with no pieces', () => {
        it('renders an empty table body', () => {
            renderPieceList([])
            const tbody = document.querySelector('tbody')!
            expect(tbody).toBeInTheDocument()
            expect(tbody.children).toHaveLength(0)
        })
    })

    describe('with one piece', () => {
        it('renders the piece name', () => {
            renderPieceList([makePiece()])
            expect(screen.getByText('Clay Bowl')).toBeInTheDocument()
        })

        it('renders the current state', () => {
            renderPieceList([makePiece({ current_state: { state: 'bisque_fired' } })])
            expect(screen.getByText('bisque_fired')).toBeInTheDocument()
        })

        it('renders the thumbnail image with correct src', () => {
            renderPieceList([makePiece()])
            const img = screen.getByRole('img')
            expect(img).toHaveAttribute('src', 'https://example.com/bowl.jpg')
        })

        it('renders formatted created date', () => {
            const piece = makePiece({ created: new Date('2024-01-15T10:00:00Z') })
            renderPieceList([piece])
            expect(screen.getByText(piece.created.toLocaleDateString())).toBeInTheDocument()
        })

        it('renders formatted last_modified date', () => {
            const piece = makePiece({ last_modified: new Date('2024-02-20T12:00:00Z') })
            renderPieceList([piece])
            expect(screen.getByText(piece.last_modified.toLocaleDateString())).toBeInTheDocument()
        })

        it('name cell links to piece detail page', () => {
            renderPieceList([makePiece()])
            const link = screen.getByRole('link', { name: 'Clay Bowl' })
            expect(link).toHaveAttribute('href', '/pieces/aaaaaaaa-0000-0000-0000-000000000001')
        })
    })

    describe('with multiple pieces', () => {
        it('renders a row for each piece', () => {
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl' }),
                makePiece({ id: 'id-2', name: 'Mug' }),
                makePiece({ id: 'id-3', name: 'Vase' }),
            ]
            renderPieceList(pieces)
            expect(screen.getByText('Bowl')).toBeInTheDocument()
            expect(screen.getByText('Mug')).toBeInTheDocument()
            expect(screen.getByText('Vase')).toBeInTheDocument()
        })

        it('renders each piece in its own table row', () => {
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'glazed' } }),
            ]
            renderPieceList(pieces)
            const rows = screen.getAllByRole('row')
            // rows[0] is the header row
            expect(within(rows[1]).getByText('Bowl')).toBeInTheDocument()
            expect(within(rows[1]).getByText('designed')).toBeInTheDocument()
            expect(within(rows[2]).getByText('Mug')).toBeInTheDocument()
            expect(within(rows[2]).getByText('glazed')).toBeInTheDocument()
        })
    })

    describe('filter dropdown', () => {
        it('renders the filter dropdown', () => {
            renderPieceList([])
            expect(screen.getByLabelText('Filter')).toBeInTheDocument()
        })

        it('shows all pieces when no filter is selected', () => {
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } as any }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'completed' } as any }),
                makePiece({ id: 'id-3', name: 'Vase', current_state: { state: 'recycled' } as any }),
            ]
            renderPieceList(pieces)
            expect(screen.getByText('Bowl')).toBeInTheDocument()
            expect(screen.getByText('Mug')).toBeInTheDocument()
            expect(screen.getByText('Vase')).toBeInTheDocument()
        })

        it('filters to work in progress pieces only', async () => {
            const user = userEvent.setup()
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } as any }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'completed' } as any }),
                makePiece({ id: 'id-3', name: 'Vase', current_state: { state: 'recycled' } as any }),
            ]
            renderPieceList(pieces)

            await user.click(screen.getByRole('combobox'))
            await user.click(screen.getByRole('option', { name: 'Work in Progress' }))
            await user.keyboard('{Escape}')

            expect(screen.getByText('Bowl')).toBeInTheDocument()
            expect(screen.queryByText('Mug')).not.toBeInTheDocument()
            expect(screen.queryByText('Vase')).not.toBeInTheDocument()
        })

        it('filters to completed pieces only', async () => {
            const user = userEvent.setup()
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } as any }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'completed' } as any }),
                makePiece({ id: 'id-3', name: 'Vase', current_state: { state: 'recycled' } as any }),
            ]
            renderPieceList(pieces)

            await user.click(screen.getByRole('combobox'))
            await user.click(screen.getByRole('option', { name: 'Completed' }))
            await user.keyboard('{Escape}')

            expect(screen.queryByText('Bowl')).not.toBeInTheDocument()
            expect(screen.getByText('Mug')).toBeInTheDocument()
            expect(screen.queryByText('Vase')).not.toBeInTheDocument()
        })

        it('filters to discarded pieces only', async () => {
            const user = userEvent.setup()
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } as any }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'completed' } as any }),
                makePiece({ id: 'id-3', name: 'Vase', current_state: { state: 'recycled' } as any }),
            ]
            renderPieceList(pieces)

            await user.click(screen.getByRole('combobox'))
            await user.click(screen.getByRole('option', { name: 'Discarded' }))
            await user.keyboard('{Escape}')

            expect(screen.queryByText('Bowl')).not.toBeInTheDocument()
            expect(screen.queryByText('Mug')).not.toBeInTheDocument()
            expect(screen.getByText('Vase')).toBeInTheDocument()
        })

        it('supports combining multiple filters', async () => {
            const user = userEvent.setup()
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } as any }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'completed' } as any }),
                makePiece({ id: 'id-3', name: 'Vase', current_state: { state: 'recycled' } as any }),
            ]
            renderPieceList(pieces)

            await user.click(screen.getByRole('combobox'))
            await user.click(screen.getByRole('option', { name: 'Completed' }))
            await user.click(screen.getByRole('option', { name: 'Discarded' }))
            await user.keyboard('{Escape}')

            expect(screen.queryByText('Bowl')).not.toBeInTheDocument()
            expect(screen.getByText('Mug')).toBeInTheDocument()
            expect(screen.getByText('Vase')).toBeInTheDocument()
        })

        it('shows all pieces again when filter is cleared', async () => {
            const user = userEvent.setup()
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } as any }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'completed' } as any }),
            ]
            renderPieceList(pieces)

            // Apply filter
            await user.click(screen.getByRole('combobox'))
            await user.click(screen.getByRole('option', { name: 'Completed' }))
            await user.keyboard('{Escape}')
            expect(screen.queryByText('Bowl')).not.toBeInTheDocument()

            // Remove filter by clicking the same option again
            await user.click(screen.getByRole('combobox'))
            await user.click(screen.getByRole('option', { name: 'Completed' }))
            await user.keyboard('{Escape}')
            expect(screen.getByText('Bowl')).toBeInTheDocument()
            expect(screen.getByText('Mug')).toBeInTheDocument()
        })
    })
})
