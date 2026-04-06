import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import GlobalFieldPicker, { type GlobalFieldPickerProps } from '../GlobalFieldPicker'
import * as api from '../../api'

vi.mock('../../api', () => ({
    fetchGlobalEntries: vi.fn().mockResolvedValue([]),
    createGlobalEntry: vi.fn(),
}))

const defaultProps = {
    globalName: 'location',
    label: 'Location',
    value: '',
    onChange: vi.fn(),
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
        it('renders the label', () => {
            render(<GlobalFieldPicker {...defaultProps} />)
            expect(screen.getByLabelText('Location')).toBeInTheDocument()
        })

        it('shows helperText when provided and there is no error', () => {
            render(<GlobalFieldPicker {...defaultProps} helperText="Where is this piece stored?" />)
            expect(screen.getByText('Where is this piece stored?')).toBeInTheDocument()
        })

        it('marks the field as required when required prop is set', () => {
            render(<GlobalFieldPicker {...defaultProps} required />)
            expect(screen.getByLabelText(/Location\s*\*/)).toBeInTheDocument()
        })
    })

    describe('options — internal fetch', () => {
        it('fetches options for globalName on mount', () => {
            render(<GlobalFieldPicker {...defaultProps} />)
            expect(api.fetchGlobalEntries).toHaveBeenCalledWith('location')
        })

        it('does not fetch when options prop is provided', () => {
            render(<GlobalFieldPicker {...defaultProps} options={['Studio A']} />)
            expect(api.fetchGlobalEntries).not.toHaveBeenCalled()
        })

        it('shows fetched options in the dropdown', async () => {
            vi.mocked(api.fetchGlobalEntries).mockResolvedValue(['Studio A', 'Studio B'])
            render(<GlobalFieldPicker {...defaultProps} />)
            await userEvent.click(screen.getByLabelText('Location'))
            await waitFor(() => {
                expect(screen.getByRole('option', { name: 'Studio A' })).toBeInTheDocument()
                expect(screen.getByRole('option', { name: 'Studio B' })).toBeInTheDocument()
            })
        })

        it('shows provided options in the dropdown', async () => {
            render(<GlobalFieldPicker {...defaultProps} options={['Shelf 1', 'Shelf 2']} />)
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
            render(<Controlled canCreate options={['Studio A']} />)
            await userEvent.type(screen.getByLabelText('Location'), 'Studio A')
            await waitFor(() =>
                expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument()
            )
        })
    })

    describe('creating a new entry', () => {
        it('calls createGlobalEntry with globalName, fieldName, and the typed value', async () => {
            vi.mocked(api.createGlobalEntry).mockResolvedValue('New Studio')
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
            vi.mocked(api.createGlobalEntry).mockResolvedValue('New Studio')
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
            render(<GlobalFieldPicker {...defaultProps} options={['Studio A']} onChange={onChange} />)
            await userEvent.click(screen.getByLabelText('Location'))
            fireEvent.click(screen.getByRole('option', { name: 'Studio A' }))
            expect(onChange).toHaveBeenCalledWith('Studio A')
        })
    })
})
