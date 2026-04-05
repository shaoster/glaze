import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import PieceList from '../PieceList'
import type { PieceSummary } from '../../types'

function makePiece(overrides: Partial<PieceSummary> = {}): PieceSummary {
    return {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        name: 'Clay Bowl',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-02-20T12:00:00Z'),
        thumbnail: 'https://example.com/bowl.jpg',
        current_state: { state: 'designed' },
        ...overrides,
    }
}

describe('PieceList', () => {
    describe('table headers', () => {
        it('renders all column headers', () => {
            render(<PieceList pieces={[]} />)
            expect(screen.getByText('Thumbnail')).toBeInTheDocument()
            expect(screen.getByText('Name')).toBeInTheDocument()
            expect(screen.getByText('State')).toBeInTheDocument()
            expect(screen.getByText('Created')).toBeInTheDocument()
            expect(screen.getByText('Last Modified')).toBeInTheDocument()
        })
    })

    describe('with no pieces', () => {
        it('renders an empty table body', () => {
            render(<PieceList pieces={[]} />)
            const tbody = document.querySelector('tbody')!
            expect(tbody).toBeInTheDocument()
            expect(tbody.children).toHaveLength(0)
        })
    })

    describe('with one piece', () => {
        it('renders the piece name', () => {
            render(<PieceList pieces={[makePiece()]} />)
            expect(screen.getByText('Clay Bowl')).toBeInTheDocument()
        })

        it('renders the current state', () => {
            render(<PieceList pieces={[makePiece({ current_state: { state: 'bisque_fired' } })]} />)
            expect(screen.getByText('bisque_fired')).toBeInTheDocument()
        })

        it('renders the thumbnail image with correct src', () => {
            render(<PieceList pieces={[makePiece()]} />)
            const img = screen.getByRole('img')
            expect(img).toHaveAttribute('src', 'https://example.com/bowl.jpg')
        })

        it('renders formatted created date', () => {
            const piece = makePiece({ created: new Date('2024-01-15T10:00:00Z') })
            render(<PieceList pieces={[piece]} />)
            expect(screen.getByText(piece.created.toLocaleDateString())).toBeInTheDocument()
        })

        it('renders formatted last_modified date', () => {
            const piece = makePiece({ last_modified: new Date('2024-02-20T12:00:00Z') })
            render(<PieceList pieces={[piece]} />)
            expect(screen.getByText(piece.last_modified.toLocaleDateString())).toBeInTheDocument()
        })
    })

    describe('with multiple pieces', () => {
        it('renders a row for each piece', () => {
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl' }),
                makePiece({ id: 'id-2', name: 'Mug' }),
                makePiece({ id: 'id-3', name: 'Vase' }),
            ]
            render(<PieceList pieces={pieces} />)
            expect(screen.getByText('Bowl')).toBeInTheDocument()
            expect(screen.getByText('Mug')).toBeInTheDocument()
            expect(screen.getByText('Vase')).toBeInTheDocument()
        })

        it('renders each piece in its own table row', () => {
            const pieces = [
                makePiece({ id: 'id-1', name: 'Bowl', current_state: { state: 'designed' } }),
                makePiece({ id: 'id-2', name: 'Mug', current_state: { state: 'glazed' } }),
            ]
            render(<PieceList pieces={pieces} />)
            const rows = screen.getAllByRole('row')
            // rows[0] is the header row
            expect(within(rows[1]).getByText('Bowl')).toBeInTheDocument()
            expect(within(rows[1]).getByText('designed')).toBeInTheDocument()
            expect(within(rows[2]).getByText('Mug')).toBeInTheDocument()
            expect(within(rows[2]).getByText('glazed')).toBeInTheDocument()
        })
    })
})
