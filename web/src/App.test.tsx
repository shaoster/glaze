import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock the module before importing App
vi.mock('@common/api', () => ({
    fetchCurrentUser: vi.fn().mockResolvedValue(null),
    loginWithEmail: vi.fn(),
    logoutUser: vi.fn().mockResolvedValue(undefined),
    registerWithEmail: vi.fn(),
    fetchPieces: vi.fn().mockResolvedValue([]),
    fetchPiece: vi.fn(),
    ensureCsrfCookie: vi.fn().mockResolvedValue(undefined),
    createPiece: vi.fn(),
    addPieceState: vi.fn(),
    updateCurrentState: vi.fn(),
    updatePiece: vi.fn(),
    fetchGlobalEntries: vi.fn().mockResolvedValue([]),
    createGlobalEntry: vi.fn(),
    hasCloudinaryUploadConfig: vi.fn().mockReturnValue(false),
    uploadImageToCloudinary: vi.fn(),
}))

vi.mock('./components/NewPieceDialog', () => ({
    default: () => null,
}))

vi.mock('./components/PieceList', () => ({
    default: () => <div>Piece List Content</div>,
}))

vi.mock('./components/PieceDetail', () => ({
    default: () => <div>Piece Detail Content</div>,
}))

// Now import App and the mocked api
import { fetchCurrentUser, loginWithEmail } from '@common/api'
import App from './App'

const MOCK_USER = {
    id: 1,
    email: 'potter@example.com',
    first_name: 'Pat',
    last_name: 'Potter',
    openid_subject: '',
    profile_image_url: '',
}

describe('App auth flow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Reset fetchCurrentUser to return null by default
        vi.mocked(fetchCurrentUser).mockResolvedValue(null)
    })

    it('shows landing/login form when not authenticated', async () => {
        render(<App />)

        // Wait for the auth landing form to appear
        await waitFor(() => {
            expect(screen.getByText('Track every pottery piece through your workflow.')).toBeInTheDocument()
        })

        // Verify we can find an input field (email input)
        const inputs = screen.getAllByRole('textbox')
        expect(inputs.length).toBeGreaterThan(0)
        // Verify the submit button exists
        const buttons = screen.getAllByRole('button')
        const logInButton = buttons.find(btn => btn.textContent === 'Log In' && btn.closest('form'))
        expect(logInButton).toBeDefined()
    })

    it('logs in and shows piece list view with current user badge', async () => {
        // Mock loginWithEmail to return a user
        vi.mocked(loginWithEmail).mockResolvedValue(MOCK_USER)

        const { container } = render(<App />)

        // Wait for the form to appear
        await waitFor(() => {
            expect(screen.getByText('Track every pottery piece through your workflow.')).toBeInTheDocument()
        })

        // Fill in credentials - get inputs from the form
        const inputs = container.querySelectorAll('input[type="email"], input[type="password"]')
        const emailInput = inputs[0] as HTMLInputElement
        const passwordInput = inputs[1] as HTMLInputElement

        if (emailInput && passwordInput) {
            await userEvent.type(emailInput, 'potter@example.com')
            await userEvent.type(passwordInput, 'password123')
        }

        // Submit the form - find the submit button (inside the form)
        const submitButton = screen.getAllByRole('button').find(btn => btn.textContent === 'Log In' && btn.closest('form'))
        if (submitButton) {
            await userEvent.click(submitButton)
        }

        // Wait for the authenticated view to appear
        await waitFor(() => {
            expect(screen.getByText('Pottery Pieces')).toBeInTheDocument()
        })

        // Verify the authenticated view is shown
        expect(screen.getByText('Current user: Pat Potter')).toBeInTheDocument()
        expect(screen.getByText('Piece List Content')).toBeInTheDocument()
    })
})
