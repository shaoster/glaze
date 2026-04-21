import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../ErrorBoundary'

// A component that throws unconditionally during render — used to exercise
// the error boundary's catch path.
function ThrowingComponent(): never {
    throw new Error('Simulated render error')
}

describe('ErrorBoundary', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders children when no error occurs', () => {
        render(
            <ErrorBoundary>
                <div>safe content</div>
            </ErrorBoundary>
        )
        expect(screen.getByText('safe content')).toBeInTheDocument()
        expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    })

    it('catches a render error and shows the recovery message', () => {
        // Suppress the console.error output that React emits when a boundary
        // catches an error — this is expected in this test.
        vi.spyOn(console, 'error').mockImplementation(() => undefined)

        render(
            <ErrorBoundary>
                <ThrowingComponent />
            </ErrorBoundary>
        )

        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
        expect(screen.queryByText('safe content')).not.toBeInTheDocument()
    })
})
