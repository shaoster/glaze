import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import GlobalFieldPicker, { type GlobalFieldPickerProps, stripPublicSuffix } from '../GlobalFieldPicker'
import * as api from '@common/api'
import type { GlobalEntry } from '@common/api'

vi.mock('@common/api', () => ({
    fetchGlobalEntries: vi.fn().mockResolvedValue([]),
    createGlobalEntry: vi.fn(),
    toggleGlobalEntryFavorite: vi.fn().mockResolvedValue(undefined),
}))

// Only glaze_combination is favoritable in workflow.yml
vi.mock('@common/workflow', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@common/workflow')>()
    return {
        ...actual,
        isFavoritableGlobal: (name: string) => name === 'glaze_combination',
    }
})

const defaultProps = {
    globalName: 'location',
    label: 'Location',
    value: '',
    onChange: vi.fn(),
}

function entry(name: string, isPublic = false, isFavorite?: boolean): GlobalEntry {
    return { id: `id-${name}`, name, isPublic, isFavorite }
}

// Stateful wrapper so controlled `value` actually updates when the user types.
// Tests that involve typing must use this instead of rendering GlobalFieldPicker directly.
function Controlled(props: Partial<GlobalFieldPickerProps>) {
    const [value, setValue] = useState('')
    return <GlobalFieldPicker {...defaultProps} value={value} onChange={setValue} {...props} />
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.fetchGlobalEntries).mockResolvedValue([])
})

describe('GlobalFieldPicker', () => {
    describe('rendering', () => {
        it('renders the label', async () => {
            await act(async () => {
                render(<GlobalFieldPicker {...defaultProps} />)
            })
            expect(screen.getByLabelText('Location')).toBeInTheDocument()
        })

        it('shows helperText when provided and there is no error', async () => {
            await act(async () => {
                render(<GlobalFieldPicker {...defaultProps} helperText="Where is this piece stored?" />)
            })
            expect(screen.getByText('Where is this piece stored?')).toBeInTheDocument()
        })

        it('marks the field as required when required prop is set', async () => {
            await act(async () => {
                render(<GlobalFieldPicker {...defaultProps} required />)
            })
            expect(screen.getByLabelText(/Location\s*\*/)).toBeInTheDocument()
        })
    })

    describe('options — internal fetch', () => {
        it('fetches options for globalName on mount', async () => {
            await act(async () => {
                render(<GlobalFieldPicker {...defaultProps} />)
            })
            expect(api.fetchGlobalEntries).toHaveBeenCalledWith('location')
        })

        it('does not fetch when options prop is provided', () => {
            render(<GlobalFieldPicker {...defaultProps} options={[{ id: '', name: 'Studio A', isPublic: false }]} />)
            expect(api.fetchGlobalEntries).not.toHaveBeenCalled()
        })

        it('shows an error message when fetchGlobalEntries fails', async () => {
            vi.mocked(api.fetchGlobalEntries).mockRejectedValue(new Error('Network error'))
            render(<GlobalFieldPicker {...defaultProps} />)
            await waitFor(() =>
                expect(
                    screen.getByText('Failed to load location options. Please refresh.')
                ).toBeInTheDocument()
            )
        })

        it('marks the field as errored when fetchGlobalEntries fails', async () => {
            vi.mocked(api.fetchGlobalEntries).mockRejectedValue(new Error('Network error'))
            await act(async () => {
                render(<GlobalFieldPicker {...defaultProps} />)
            })
            await waitFor(() =>
                expect(screen.getByLabelText('Location')).toBeInTheDocument()
            )
            // helperText containing the error should be rendered
            await waitFor(() =>
                expect(
                    screen.getByText('Failed to load location options. Please refresh.')
                ).toBeInTheDocument()
            )
        })

        it('does not show fetch error when options prop is provided even if fetch would fail', async () => {
            vi.mocked(api.fetchGlobalEntries).mockRejectedValue(new Error('Network error'))
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...defaultProps}
                        options={[{ id: '', name: 'Studio A', isPublic: false }]}
                    />
                )
            })
            expect(
                screen.queryByText(/Failed to load/)
            ).not.toBeInTheDocument()
        })

        it('shows fetched options in the dropdown', async () => {
            vi.mocked(api.fetchGlobalEntries).mockResolvedValue([entry('Studio A'), entry('Studio B')])
            render(<GlobalFieldPicker {...defaultProps} />)
            await userEvent.click(screen.getByLabelText('Location'))
            await waitFor(() => {
                expect(screen.getByRole('option', { name: 'Studio A' })).toBeInTheDocument()
                expect(screen.getByRole('option', { name: 'Studio B' })).toBeInTheDocument()
            })
        })

        it('shows provided options in the dropdown', async () => {
            render(<GlobalFieldPicker {...defaultProps} options={[entry('Shelf 1'), entry('Shelf 2')]} />)
            await userEvent.click(screen.getByLabelText('Location'))
            expect(screen.getByRole('option', { name: 'Shelf 1' })).toBeInTheDocument()
            expect(screen.getByRole('option', { name: 'Shelf 2' })).toBeInTheDocument()
        })
    })

    describe('create sentinel', () => {
        it('shows "Create" option when user types a value not in the list', async () => {
            render(<Controlled canCreate />)
            await userEvent.type(screen.getByLabelText('Location'), 'New Studio')
            await waitFor(() =>
                expect(screen.getByRole('option', { name: 'Create "New Studio"' })).toBeInTheDocument()
            )
        })

        it('does not show "Create" option when canCreate is false', async () => {
            render(<Controlled canCreate={false} />)
            await userEvent.type(screen.getByLabelText('Location'), 'New Studio')
            await waitFor(() =>
                expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument()
            )
        })

        it('does not show "Create" option when typed value matches an existing option', async () => {
            render(<Controlled canCreate options={[entry('Studio A')]} />)
            await userEvent.type(screen.getByLabelText('Location'), 'Studio A')
            await waitFor(() =>
                expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument()
            )
        })
    })

    describe('creating a new entry', () => {
        it('calls createGlobalEntry with globalName, fieldName, and the typed value', async () => {
            vi.mocked(api.createGlobalEntry).mockResolvedValue({ id: 'new-id', name: 'New Studio', isPublic: false })
            render(<Controlled canCreate />)
            await userEvent.type(screen.getByLabelText('Location'), 'New Studio')
            await waitFor(() =>
                expect(screen.getByRole('option', { name: 'Create "New Studio"' })).toBeInTheDocument()
            )
            fireEvent.click(screen.getByRole('option', { name: 'Create "New Studio"' }))
            await waitFor(() =>
                expect(api.createGlobalEntry).toHaveBeenCalledWith('location', 'name', 'New Studio')
            )
        })

        it('calls onChange with the created name on success', async () => {
            vi.mocked(api.createGlobalEntry).mockResolvedValue({ id: 'new-id', name: 'New Studio', isPublic: false })
            render(<Controlled canCreate />)
            await userEvent.type(screen.getByLabelText('Location'), 'New Studio')
            await waitFor(() =>
                expect(screen.getByRole('option', { name: 'Create "New Studio"' })).toBeInTheDocument()
            )
            fireEvent.click(screen.getByRole('option', { name: 'Create "New Studio"' }))
            await waitFor(() =>
                expect(screen.getByLabelText('Location')).toHaveValue('New Studio')
            )
        })

        it('shows an error message when createGlobalEntry fails', async () => {
            vi.mocked(api.createGlobalEntry).mockRejectedValue(new Error('Network error'))
            render(<Controlled canCreate />)
            await userEvent.type(screen.getByLabelText('Location'), 'Bad Studio')
            await waitFor(() =>
                expect(screen.getByRole('option', { name: 'Create "Bad Studio"' })).toBeInTheDocument()
            )
            fireEvent.click(screen.getByRole('option', { name: 'Create "Bad Studio"' }))
            await waitFor(() =>
                expect(screen.getByText('Failed to create location. Please try again.')).toBeInTheDocument()
            )
        })

        it('hides helperText and shows error when creation fails', async () => {
            vi.mocked(api.createGlobalEntry).mockRejectedValue(new Error())
            render(<Controlled canCreate helperText="Descriptive hint" />)
            await userEvent.type(screen.getByLabelText('Location'), 'X')
            await waitFor(() =>
                expect(screen.getByRole('option', { name: 'Create "X"' })).toBeInTheDocument()
            )
            fireEvent.click(screen.getByRole('option', { name: 'Create "X"' }))
            await waitFor(() =>
                expect(screen.queryByText('Descriptive hint')).not.toBeInTheDocument()
            )
            expect(screen.getByText('Failed to create location. Please try again.')).toBeInTheDocument()
        })
    })

    describe('selecting an existing entry', () => {
        it('calls onChange with the selected value', async () => {
            const onChange = vi.fn()
            render(<GlobalFieldPicker {...defaultProps} options={[entry('Studio A')]} onChange={onChange} />)
            await userEvent.click(screen.getByLabelText('Location'))
            fireEvent.click(screen.getByRole('option', { name: 'Studio A' }))
            expect(onChange).toHaveBeenCalledWith('Studio A')
        })
    })

    describe('uncommitted text', () => {
        it('does not call onChange while the user is typing', async () => {
            const onChange = vi.fn()
            render(<GlobalFieldPicker {...defaultProps} onChange={onChange} canCreate />)
            await userEvent.type(screen.getByLabelText('Location'), 'New Studio')
            expect(onChange).not.toHaveBeenCalled()
        })

        it('resets the input to the committed value on blur when nothing was selected', async () => {
            render(<Controlled canCreate options={[entry('Studio A')]} />)
            const input = screen.getByLabelText('Location')
            await userEvent.type(input, 'something partial')
            fireEvent.blur(input)
            await waitFor(() => expect(input).toHaveValue(''))
        })

        it('preserves the input after a successful create', async () => {
            vi.mocked(api.createGlobalEntry).mockResolvedValue({ id: 'new-id', name: 'New Studio', isPublic: false })
            render(<Controlled canCreate />)
            await userEvent.type(screen.getByLabelText('Location'), 'New Studio')
            await waitFor(() =>
                expect(screen.getByRole('option', { name: 'Create "New Studio"' })).toBeInTheDocument()
            )
            fireEvent.click(screen.getByRole('option', { name: 'Create "New Studio"' }))
            await waitFor(() => expect(screen.getByLabelText('Location')).toHaveValue('New Studio'))
        })
    })

    describe('public/private disambiguation', () => {
        it('appends (public) suffix to a public entry that shares a name with a private entry', async () => {
            render(
                <GlobalFieldPicker
                    {...defaultProps}
                    options={[entry('Stoneware', false), entry('Stoneware', true)]}
                />
            )
            await userEvent.click(screen.getByLabelText('Location'))
            expect(screen.getByRole('option', { name: 'Stoneware' })).toBeInTheDocument()
            expect(screen.getByRole('option', { name: 'Stoneware (public)' })).toBeInTheDocument()
        })

        it('does not append (public) suffix when there is no name conflict', async () => {
            render(
                <GlobalFieldPicker
                    {...defaultProps}
                    options={[entry('Porcelain', false), entry('Stoneware', true)]}
                />
            )
            await userEvent.click(screen.getByLabelText('Location'))
            expect(screen.getByRole('option', { name: 'Stoneware' })).toBeInTheDocument()
            expect(screen.queryByRole('option', { name: 'Stoneware (public)' })).not.toBeInTheDocument()
        })

        it('emits the raw name (without suffix) when a (public) option is selected', async () => {
            const onChange = vi.fn()
            render(
                <GlobalFieldPicker
                    {...defaultProps}
                    options={[entry('Stoneware', false), entry('Stoneware', true)]}
                    onChange={onChange}
                />
            )
            await userEvent.click(screen.getByLabelText('Location'))
            fireEvent.click(screen.getByRole('option', { name: 'Stoneware (public)' }))
            expect(onChange).toHaveBeenCalledWith('Stoneware')
        })

        it('stripPublicSuffix removes the suffix', () => {
            expect(stripPublicSuffix('Stoneware (public)')).toBe('Stoneware')
            expect(stripPublicSuffix('Stoneware')).toBe('Stoneware')
        })

        it('does not show Create option when typed name matches a public entry with same name as private', async () => {
            render(<Controlled canCreate options={[entry('Stoneware', false), entry('Stoneware', true)]} />)
            await userEvent.type(screen.getByLabelText('Location'), 'Stoneware')
            await waitFor(() =>
                expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument()
            )
        })
    })

    describe('favorites (favoritable globals)', () => {
        const favoritableProps = {
            globalName: 'glaze_combination',
            label: 'Glaze Combination',
            value: '',
            onChange: vi.fn(),
        }

        it('does not show star icon for non-favoritable globals', async () => {
            // location is not favoritable
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...defaultProps}
                        value="Studio A"
                        options={[entry('Studio A')]}
                    />
                )
            })
            expect(screen.queryByLabelText('Add to favorites')).not.toBeInTheDocument()
            expect(screen.queryByLabelText('Remove from favorites')).not.toBeInTheDocument()
        })

        it('does not show star icon when field is empty', async () => {
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...favoritableProps}
                        value=""
                        options={[entry('Iron Red', false, false)]}
                    />
                )
            })
            expect(screen.queryByLabelText('Add to favorites')).not.toBeInTheDocument()
        })

        it('does not show star icon when value does not match any entry', async () => {
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...favoritableProps}
                        value="Unknown Glaze"
                        options={[entry('Iron Red', false, false)]}
                    />
                )
            })
            expect(screen.queryByLabelText('Add to favorites')).not.toBeInTheDocument()
        })

        it('shows unfavorited star when value matches an existing non-favorite entry', async () => {
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...favoritableProps}
                        value="Iron Red"
                        options={[entry('Iron Red', false, false)]}
                    />
                )
            })
            expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument()
        })

        it('shows filled star when value matches an existing favorited entry', async () => {
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...favoritableProps}
                        value="Iron Red"
                        options={[entry('Iron Red', false, true)]}
                    />
                )
            })
            expect(screen.getByLabelText('Remove from favorites')).toBeInTheDocument()
        })

        it('calls toggleGlobalEntryFavorite with correct args when favoriting', async () => {
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...favoritableProps}
                        value="Iron Red"
                        options={[entry('Iron Red', false, false)]}
                    />
                )
            })
            await userEvent.click(screen.getByLabelText('Add to favorites'))
            await waitFor(() =>
                expect(api.toggleGlobalEntryFavorite).toHaveBeenCalledWith('glaze_combination', 'id-Iron Red', true)
            )
        })

        it('calls toggleGlobalEntryFavorite with false when unfavoriting', async () => {
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...favoritableProps}
                        value="Iron Red"
                        options={[entry('Iron Red', false, true)]}
                    />
                )
            })
            await userEvent.click(screen.getByLabelText('Remove from favorites'))
            await waitFor(() =>
                expect(api.toggleGlobalEntryFavorite).toHaveBeenCalledWith('glaze_combination', 'id-Iron Red', false)
            )
        })

        it('updates star icon optimistically after toggling', async () => {
            await act(async () => {
                render(
                    <GlobalFieldPicker
                        {...favoritableProps}
                        value="Iron Red"
                        options={[entry('Iron Red', false, false)]}
                    />
                )
            })
            expect(screen.getByLabelText('Add to favorites')).toBeInTheDocument()
            await userEvent.click(screen.getByLabelText('Add to favorites'))
            await waitFor(() =>
                expect(screen.getByLabelText('Remove from favorites')).toBeInTheDocument()
            )
        })

        it('favorites appear first in the options list', async () => {
            render(
                <GlobalFieldPicker
                    {...favoritableProps}
                    options={[
                        entry('Celadon', false, false),
                        entry('Iron Red', false, true),
                        entry('Shino', false, false),
                    ]}
                />
            )
            await userEvent.click(screen.getByLabelText('Glaze Combination'))
            await waitFor(() => {
                const options = screen.getAllByRole('option')
                // Iron Red (favorited) must come before non-favorites
                const ironRedIdx = options.findIndex((o) => o.textContent === 'Iron Red')
                const celadonIdx = options.findIndex((o) => o.textContent === 'Celadon')
                const shinoIdx = options.findIndex((o) => o.textContent === 'Shino')
                expect(ironRedIdx).toBeLessThan(celadonIdx)
                expect(ironRedIdx).toBeLessThan(shinoIdx)
            })
        })

        it('newly created entries are not auto-favorited', async () => {
            vi.mocked(api.createGlobalEntry).mockResolvedValue({
                id: 'new-id',
                name: 'New Glaze',
                isPublic: false,
            })
            render(<Controlled globalName="glaze_combination" label="Glaze Combination" canCreate />)
            await userEvent.type(screen.getByLabelText('Glaze Combination'), 'New Glaze')
            await waitFor(() =>
                expect(screen.getByRole('option', { name: 'Create "New Glaze"' })).toBeInTheDocument()
            )
            fireEvent.click(screen.getByRole('option', { name: 'Create "New Glaze"' }))
            await waitFor(() => expect(screen.getByLabelText('Glaze Combination')).toHaveValue('New Glaze'))
            expect(api.toggleGlobalEntryFavorite).not.toHaveBeenCalled()
        })
    })
})
