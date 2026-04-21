import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import GlazeCombinationGallery from '../GlazeCombinationGallery'
import * as api from '@common/api'
import type { GlazeCombinationImageEntry } from '@common/types'

// Stub out CloudinaryImage to avoid Cloudinary SDK internals in unit tests.
vi.mock('../CloudinaryImage', () => ({
    default: ({ url, alt }: { url: string; alt?: string }) => (
        <img src={url} alt={alt ?? ''} />
    ),
}))

vi.mock('@common/api', async (importOriginal) => {
    const actual = await importOriginal<typeof api>()
    return {
        ...actual,
        fetchGlazeCombinationImages: vi.fn(),
    }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_IMAGE = {
    url: 'https://example.com/mug.jpg',
    caption: 'Front view',
    created: new Date('2024-01-15T00:00:00Z'),
    cloudinary_public_id: null,
}

const MOCK_COMBO_ENTRY: GlazeCombinationImageEntry = {
    glaze_combination: {
        id: 'combo-1',
        name: 'Ash ! Shino',
        test_tile_image: null,
        is_food_safe: true,
        runs: false,
        highlights_grooves: false,
        is_different_on_white_and_brown_clay: false,
        firing_temperature: null,
        is_public: false,
        is_favorite: false,
        glaze_types: [
            { id: 'gt-1', name: 'Ash' },
            { id: 'gt-2', name: 'Shino' },
        ],
    } as any,
    pieces: [
        {
            id: 'piece-1',
            name: 'Tall Mug',
            state: 'glaze_fired',
            images: [MOCK_IMAGE],
        },
    ],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderGallery() {
    const router = createMemoryRouter(
        [{ path: '/', element: <GlazeCombinationGallery /> }],
        { initialEntries: ['/'] }
    )
    return render(<RouterProvider router={router} />)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GlazeCombinationGallery', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    describe('loading state', () => {
        it('shows a loading spinner while data is being fetched', () => {
            vi.mocked(api.fetchGlazeCombinationImages).mockReturnValue(
                new Promise(() => {}) // never resolves
            )
            renderGallery()
            expect(screen.getByRole('progressbar')).toBeInTheDocument()
        })
    })

    describe('empty state', () => {
        it('shows the empty state message when there are no entries', async () => {
            vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue([])
            renderGallery()
            await waitFor(() =>
                expect(screen.getByText(/No images yet/i)).toBeInTheDocument()
            )
        })
    })

    describe('with data', () => {
        beforeEach(() => {
            vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue([MOCK_COMBO_ENTRY])
        })

        it('renders the combination name in the card header', async () => {
            renderGallery()
            await waitFor(() =>
                expect(screen.getByText('Ash ! Shino')).toBeInTheDocument()
            )
        })

        it('renders a chip for each glaze type', async () => {
            renderGallery()
            await waitFor(() => {
                expect(screen.getByText('Ash')).toBeInTheDocument()
                expect(screen.getByText('Shino')).toBeInTheDocument()
            })
        })

        it('renders a thumbnail image for each piece image', async () => {
            renderGallery()
            await waitFor(() => {
                const img = screen.getByRole('img', { name: /Tall Mug/i })
                expect(img).toBeInTheDocument()
                expect(img).toHaveAttribute('src', 'https://example.com/mug.jpg')
            })
        })

        it('wraps each thumbnail in a link to the piece detail page', async () => {
            renderGallery()
            await waitFor(() => {
                const link = screen.getByRole('link', { name: /Tall Mug/i })
                expect(link).toHaveAttribute('href', '/pieces/piece-1')
            })
        })
    })

    describe('with a test tile image', () => {
        it('renders the test tile as the card avatar', async () => {
            const entryWithTile: GlazeCombinationImageEntry = {
                ...MOCK_COMBO_ENTRY,
                glaze_combination: {
                    ...MOCK_COMBO_ENTRY.glaze_combination,
                    test_tile_image: 'https://example.com/tile.jpg',
                } as any,
            }
            vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue([entryWithTile])
            renderGallery()
            await waitFor(() => {
                const tileImg = screen.getByRole('img', { name: 'Ash ! Shino' })
                expect(tileImg).toHaveAttribute('src', 'https://example.com/tile.jpg')
            })
        })
    })

    describe('with multiple pieces and images', () => {
        it('renders thumbnails for each image across all pieces', async () => {
            const multiEntry: GlazeCombinationImageEntry = {
                ...MOCK_COMBO_ENTRY,
                pieces: [
                    {
                        id: 'piece-1',
                        name: 'Mug',
                        state: 'glaze_fired',
                        images: [
                            { ...MOCK_IMAGE, url: 'https://example.com/mug.jpg' },
                            { ...MOCK_IMAGE, url: 'https://example.com/mug2.jpg' },
                        ],
                    },
                    {
                        id: 'piece-2',
                        name: 'Bowl',
                        state: 'completed',
                        images: [{ ...MOCK_IMAGE, url: 'https://example.com/bowl.jpg' }],
                    },
                ],
            }
            vi.mocked(api.fetchGlazeCombinationImages).mockResolvedValue([multiEntry])
            renderGallery()
            await waitFor(() => {
                expect(screen.getAllByRole('img').filter(img =>
                    img.getAttribute('src')?.includes('example.com')
                )).toHaveLength(3) // tile img absent, 2 mug + 1 bowl
            })
        })
    })

    describe('error state', () => {
        it('shows an error message when the fetch fails', async () => {
            vi.mocked(api.fetchGlazeCombinationImages).mockRejectedValue(new Error('Network error'))
            renderGallery()
            await waitFor(() =>
                expect(
                    screen.getByText(/Failed to load glaze combination gallery/i)
                ).toBeInTheDocument()
            )
        })
    })
})
