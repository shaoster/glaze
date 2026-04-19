import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CloudinaryImage from '../CloudinaryImage'

vi.mock('@cloudinary/react', () => ({
    AdvancedImage: ({ alt, className, 'data-testid': testId, onError, onLoad, style }: {
        alt?: string
        className?: string
        'data-testid'?: string
        onError?: React.ReactEventHandler<HTMLImageElement>
        onLoad?: React.ReactEventHandler<HTMLImageElement>
        style?: React.CSSProperties
    }) => (
        <img
            alt={alt}
            className={className}
            data-testid={testId}
            onError={onError}
            onLoad={onLoad}
            style={style}
        />
    ),
}))

vi.mock('@cloudinary/url-gen', () => ({
    Cloudinary: class {
        image(publicId: string) {
            return {
                publicId,
                resize() { return this },
                delivery() { return this },
            }
        }
    },
}))

vi.mock('@cloudinary/url-gen/actions/resize', () => ({
    fill: () => ({
        width() { return this },
        height() { return this },
        gravity() { return this },
    }),
    fit: () => ({
        width() { return this },
        height() { return this },
    }),
}))

vi.mock('@cloudinary/url-gen/actions/delivery', () => ({
    format: vi.fn(),
    quality: vi.fn(),
}))

vi.mock('@cloudinary/url-gen/qualifiers/format', () => ({
    auto: vi.fn(),
    jpg: vi.fn(),
}))

vi.mock('@cloudinary/url-gen/qualifiers/quality', () => ({
    auto: vi.fn(),
}))

vi.mock('@cloudinary/url-gen/qualifiers/gravity', () => ({
    autoGravity: vi.fn(),
}))

describe('CloudinaryImage', () => {
    it('shows a spinner until a fallback image loads', () => {
        render(<CloudinaryImage url="https://example.com/pot.jpg" alt="Pot" context="thumbnail" />)

        const image = screen.getByAltText('Pot')
        expect(screen.getByRole('progressbar')).toBeInTheDocument()
        expect(image).toHaveStyle({ opacity: '0' })

        fireEvent.load(image)

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
        expect(image).toHaveStyle({ opacity: '1' })
    })

    it('shows the spinner again when the image source changes', () => {
        const { rerender } = render(<CloudinaryImage url="https://example.com/first.jpg" alt="Pot" context="thumbnail" />)

        const image = screen.getByAltText('Pot')
        fireEvent.load(image)
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

        rerender(<CloudinaryImage url="https://example.com/second.jpg" alt="Pot" context="thumbnail" />)

        expect(screen.getByRole('progressbar')).toBeInTheDocument()
        expect(screen.getByAltText('Pot')).toHaveStyle({ opacity: '0' })
    })

    it('shows a spinner for Cloudinary-backed images until they load', () => {
        render(
            <CloudinaryImage
                url="https://res.cloudinary.com/demo/image/upload/v1/pottery/sample.jpg"
                cloudinary_public_id="pottery/sample"
                alt="Cloudinary pot"
                context="preview"
            />
        )

        const image = screen.getByAltText('Cloudinary pot')
        expect(screen.getByRole('progressbar')).toBeInTheDocument()

        fireEvent.load(image)

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })
})
