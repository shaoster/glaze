import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewPieceDialog, { CURATED_THUMBNAILS } from '../NewPieceDialog'
import * as api from '../../api'
import type { PieceDetail } from '../../types'

vi.mock('../../api', () => ({
    createPiece: vi.fn(),
}))

function makePieceDetail(): PieceDetail {
    return {
        id: 'aaaaaaaa-0000-0000-0000-000000000001',
        name: 'Test Bowl',
        created: new Date('2024-01-15T10:00:00Z'),
        last_modified: new Date('2024-01-15T10:00:00Z'),
        thumbnail: '',
        current_state: {
            state: 'designed',
            notes: '',
            created: new Date('2024-01-15T10:00:00Z'),
            last_modified: new Date('2024-01-15T10:00:00Z'),
            location: '',
            images: [],
            previous_state: null,
            next_state: null,
        },
        history: [],
    }
}

const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onCreated: vi.fn(),
}

beforeEach(() => {
    vi.clearAllMocks()
})

describe('NewPieceDialog', () => {
    describe('rendering', () => {
        it('renders the dialog title', () => {
            render(<NewPieceDialog {...defaultProps} />)
            expect(screen.getByText('New Piece')).toBeInTheDocument()
        })

        it('renders the name field as required', () => {
            render(<NewPieceDialog {...defaultProps} />)
            expect(screen.getByTestId('name-input')).toBeInTheDocument()
        })

        it('renders the notes field', () => {
            render(<NewPieceDialog {...defaultProps} />)
            expect(screen.getByTestId('notes-input')).toBeInTheDocument()
        })

        it('shows curated thumbnail images by default', () => {
            render(<NewPieceDialog {...defaultProps} />)
            const images = screen.getAllByRole('img')
            expect(images.length).toBe(CURATED_THUMBNAILS.length)
        })
    })

    describe('save button', () => {
        it('is disabled when name is empty', () => {
            render(<NewPieceDialog {...defaultProps} />)
            expect(screen.getByTestId('save-button')).toBeDisabled()
        })

        it('is enabled when name has a value', async () => {
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), 'My Bowl')
            expect(screen.getByTestId('save-button')).not.toBeDisabled()
        })

        it('remains disabled if name is only whitespace', async () => {
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), '   ')
            expect(screen.getByTestId('save-button')).toBeDisabled()
        })
    })

    describe('notes field', () => {
        it('shows character count', () => {
            render(<NewPieceDialog {...defaultProps} />)
            expect(screen.getByText('0 / 300')).toBeInTheDocument()
        })
    })

    describe('cancel / close behaviour', () => {
        it('calls onClose immediately when no changes have been made', async () => {
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
            expect(defaultProps.onClose).toHaveBeenCalledOnce()
        })

        it('shows discard confirmation when dialog is dirty and closed', async () => {
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), 'Draft')
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
            expect(screen.getByText('Discard new piece?')).toBeInTheDocument()
            expect(defaultProps.onClose).not.toHaveBeenCalled()
        })

        it('keeps dialog open when user clicks Keep editing in confirmation', async () => {
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), 'Draft')
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
            await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
            expect(defaultProps.onClose).not.toHaveBeenCalled()
            expect(screen.getByText('New Piece')).toBeInTheDocument()
        })

        it('calls onClose after confirming discard', async () => {
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), 'Draft')
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
            await userEvent.click(screen.getByTestId('discard-button'))
            expect(defaultProps.onClose).toHaveBeenCalledOnce()
        })
    })

    describe('successful save', () => {
        it('calls createPiece with name and notes', async () => {
            const piece = makePieceDetail()
            vi.mocked(api.createPiece).mockResolvedValue(piece)

            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), 'My Mug')
            await userEvent.type(screen.getByTestId('notes-input'), 'Wide handle')
            await userEvent.click(screen.getByTestId('save-button'))

            await waitFor(() => {
                expect(api.createPiece).toHaveBeenCalledWith(
                    expect.objectContaining({ name: 'My Mug', notes: 'Wide handle' })
                )
            })
        })

        it('calls onCreated with the returned piece', async () => {
            const piece = makePieceDetail()
            vi.mocked(api.createPiece).mockResolvedValue(piece)

            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), 'Bowl')
            await userEvent.click(screen.getByTestId('save-button'))

            await waitFor(() => {
                expect(defaultProps.onCreated).toHaveBeenCalledWith(piece)
            })
        })

        it('trims the name before saving', async () => {
            vi.mocked(api.createPiece).mockResolvedValue(makePieceDetail())
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), '  Trimmed  ')
            await userEvent.click(screen.getByTestId('save-button'))
            await waitFor(() => {
                expect(api.createPiece).toHaveBeenCalledWith(
                    expect.objectContaining({ name: 'Trimmed' })
                )
            })
        })

        it('sends selected curated thumbnail', async () => {
            vi.mocked(api.createPiece).mockResolvedValue(makePieceDetail())
            render(<NewPieceDialog {...defaultProps} />)
            await userEvent.type(screen.getByTestId('name-input'), 'Bowl')
            const images = screen.getAllByRole('img')
            fireEvent.click(images[0])
            await userEvent.click(screen.getByTestId('save-button'))
            await waitFor(() => {
                expect(api.createPiece).toHaveBeenCalledWith(
                    expect.objectContaining({ thumbnail: CURATED_THUMBNAILS[0] })
                )
            })
        })
    })
})
