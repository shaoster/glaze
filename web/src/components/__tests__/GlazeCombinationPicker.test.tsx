import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GlazeCombinationPicker from '../GlazeCombinationPicker'
import * as api from '@common/api'
import type { GlazeCombinationEntry } from '@common/api'

vi.mock('@common/api', () => ({
    fetchGlazeCombinations: vi.fn(),
    fetchGlobalEntries: vi.fn(),
    toggleFavoriteGlazeCombination: vi.fn(),
}))

vi.mock('../CloudinaryImage', () => ({
    default: ({ image }: { image: { url: string; caption: string } }) => (
        <img src={image.url} alt={image.caption} />
    ),
}))

function makeCombo(overrides: Partial<GlazeCombinationEntry> = {}): GlazeCombinationEntry {
    return {
        id: '1',
        name: 'Iron Red!Clear',
        test_tile_image: '',
        is_food_safe: true,
        runs: false,
        highlights_grooves: null,
        is_different_on_white_and_brown_clay: null,
        firing_temperature: null,
        is_public: true,
        is_favorite: false,
        glaze_types: [
            { id: 'gt1', name: 'Iron Red' },
            { id: 'gt2', name: 'Clear' },
        ],
        ...overrides,
    }
}

const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchGlazeCombinations).mockResolvedValue([makeCombo()])
    vi.mocked(api.fetchGlobalEntries).mockImplementation((globalName) => {
        if (globalName === 'glaze_type') {
            return Promise.resolve([
                { id: 'gt1', name: 'Iron Red', isPublic: true },
                { id: 'gt2', name: 'Clear', isPublic: true },
            ])
        }
        return Promise.resolve([])
    })
    vi.mocked(api.toggleFavoriteGlazeCombination).mockResolvedValue(undefined)
})

describe('GlazeCombinationPicker', () => {
    describe('rendering', () => {
        it('renders the dialog title when open', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            expect(screen.getByText('Browse Glaze Combinations')).toBeInTheDocument()
        })

        it('does not render when closed', () => {
            render(<GlazeCombinationPicker {...defaultProps} open={false} />)
            expect(screen.queryByText('Browse Glaze Combinations')).not.toBeInTheDocument()
        })

        it('shows combination name after load', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByText('Iron Red!Clear')).toBeInTheDocument())
        })

        it('shows glaze type chips', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => {
                expect(screen.getByText('Iron Red')).toBeInTheDocument()
                expect(screen.getByText('Clear')).toBeInTheDocument()
            })
        })

        it('shows "public" chip for public combinations', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByText('public')).toBeInTheDocument())
        })

        it('shows empty state when no combinations match', async () => {
            vi.mocked(api.fetchGlazeCombinations).mockResolvedValue([])
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() =>
                expect(screen.getByText(/No combinations match/)).toBeInTheDocument()
            )
        })
    })

    describe('selection', () => {
        it('calls onSelect with combination name when clicked', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByText('Iron Red!Clear')).toBeInTheDocument())
            await userEvent.click(screen.getByText('Iron Red!Clear'))
            expect(defaultProps.onSelect).toHaveBeenCalledWith('Iron Red!Clear')
        })

        it('calls onClose after selecting', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByText('Iron Red!Clear')).toBeInTheDocument())
            await userEvent.click(screen.getByText('Iron Red!Clear'))
            expect(defaultProps.onClose).toHaveBeenCalled()
        })
    })

    describe('favorites', () => {
        it('renders unfavorited star for non-favorites', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByText('Iron Red!Clear')).toBeInTheDocument())
            expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument()
        })

        it('renders filled star for favorites', async () => {
            vi.mocked(api.fetchGlazeCombinations).mockResolvedValue([makeCombo({ is_favorite: true })])
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByLabelText('Remove from favorites')).toBeInTheDocument())
        })

        it('calls toggleFavoriteGlazeCombination with correct args when favoriting', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument())
            await userEvent.click(screen.getByLabelText('Add to favorites'))
            await waitFor(() =>
                expect(api.toggleFavoriteGlazeCombination).toHaveBeenCalledWith('1', true)
            )
        })

        it('calls toggleFavoriteGlazeCombination with false when unfavoriting', async () => {
            vi.mocked(api.fetchGlazeCombinations).mockResolvedValue([makeCombo({ is_favorite: true })])
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByLabelText('Remove from favorites')).toBeInTheDocument())
            await userEvent.click(screen.getByLabelText('Remove from favorites'))
            await waitFor(() =>
                expect(api.toggleFavoriteGlazeCombination).toHaveBeenCalledWith('1', false)
            )
        })

        it('favorite button click does not trigger selection', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument())
            await userEvent.click(screen.getByLabelText('Add to favorites'))
            expect(defaultProps.onSelect).not.toHaveBeenCalled()
        })
    })

    describe('Only Favorites toggle', () => {
        it('shows only favorites when toggle is on', async () => {
            const fav = makeCombo({ id: '1', name: 'Fav Combo', is_favorite: true })
            const notFav = makeCombo({ id: '2', name: 'Other Combo', is_favorite: false })
            vi.mocked(api.fetchGlazeCombinations).mockResolvedValue([fav, notFav])

            render(<GlazeCombinationPicker {...defaultProps} />)
            await waitFor(() => expect(screen.getByText('Other Combo')).toBeInTheDocument())

            await userEvent.click(screen.getByLabelText('Only favorites'))

            await waitFor(() => expect(screen.getByText('Fav Combo')).toBeInTheDocument())
            expect(screen.queryByText('Other Combo')).not.toBeInTheDocument()
        })
    })

    describe('Cancel button', () => {
        it('calls onClose', async () => {
            render(<GlazeCombinationPicker {...defaultProps} />)
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
            expect(defaultProps.onClose).toHaveBeenCalled()
        })
    })
})
