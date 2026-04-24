import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import PieceDetailPage from '../PieceDetailPage'
import * as api from '@common/api'
import type { PieceDetail } from '@common/types'

vi.mock('@common/api', async (importOriginal) => {
    const actual = await importOriginal<typeof api>()
    return {
        ...actual,
        fetchPiece: vi.fn(),
    }
})

vi.mock('../../components/PieceDetail', () => ({
    default: () => <div data-testid="piece-detail-component" />,
}))

const MOCK_PIECE: PieceDetail = {
    id: 'piece-1',
    name: 'Tall Mug',
    created: new Date('2024-01-01T00:00:00Z'),
    last_modified: new Date('2024-01-02T00:00:00Z'),
    thumbnail: '/thumbnails/question-mark.svg',
    current_state: {
        state: 'designed',
        notes: '',
        created: new Date('2024-01-01T00:00:00Z'),
        last_modified: new Date('2024-01-01T00:00:00Z'),
        images: [],
        additional_fields: {},
        previous_state: null,
        next_state: null,
    },
    history: [],
} as unknown as PieceDetail

function renderPage(fromGallery = false) {
    const router = createMemoryRouter(
        [
            { path: '/pieces/:id', element: <PieceDetailPage /> },
            { path: '/', element: <div data-testid="pieces-page" /> },
            { path: '/analyze', element: <div data-testid="analyze-page" /> },
        ],
        {
            initialEntries: [
                {
                    pathname: '/pieces/piece-1',
                    state: fromGallery ? { fromGallery: true } : null,
                },
            ],
        }
    )
    return render(<RouterProvider router={router} />)
}

describe('PieceDetailPage', () => {
    beforeEach(() => {
        vi.mocked(api.fetchPiece).mockResolvedValue(MOCK_PIECE)
    })

    it('shows Back to Pieces button by default', async () => {
        renderPage()
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Back to Pieces/i })).toBeInTheDocument()
        )
    })

    it('shows Back to Gallery button when navigated from gallery', async () => {
        renderPage(true)
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Back to Gallery/i })).toBeInTheDocument()
        )
    })
})
