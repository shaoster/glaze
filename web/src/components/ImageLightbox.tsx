import { useRef, useState } from 'react'
import { Box, IconButton, Modal, Typography } from '@mui/material'
import type { CaptionedImage } from '@common/types'
import CloudinaryImage from './CloudinaryImage'

type ImageLightboxProps = {
    images: CaptionedImage[]
    initialIndex: number
    onClose: () => void
}

export default function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
    const [index, setIndex] = useState(initialIndex)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const touchStartX = useRef<number | null>(null)

    function prev() { setIndex((i) => (i > 0 ? i - 1 : i)) }
    function next() { setIndex((i) => (i < images.length - 1 ? i + 1 : i)) }

    function handleTouchStart(e: React.TouchEvent) {
        touchStartX.current = e.touches[0].clientX
    }
    function handleTouchEnd(e: React.TouchEvent) {
        if (touchStartX.current === null) return
        const delta = e.changedTouches[0].clientX - touchStartX.current
        if (delta > 50) prev()
        else if (delta < -50) next()
        touchStartX.current = null
    }

    const image = images[index]

    return (
        <Modal
            open
            onClose={onClose}
            slotProps={{ backdrop: { sx: { backgroundColor: 'rgba(0,0,0,0.92)' } } }}
        >
            <Box
                onClick={onClose}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                sx={{
                    position: 'fixed', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 2, outline: 'none',
                }}
            >
                <CloudinaryImage
                    url={image.url}
                    cloudinary_public_id={image.cloudinary_public_id}
                    alt={image.caption || 'Pottery image'}
                    context="lightbox"
                    style={{
                        maxWidth: '90vw', maxHeight: '80vh',
                        objectFit: 'contain', borderRadius: 4,
                        userSelect: 'none',
                    }}
                />
                {image.caption && (
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                        {image.caption}
                    </Typography>
                )}
                {!isTouchDevice && images.length > 1 && (
                    <Box
                        onClick={(e) => e.stopPropagation()}
                        sx={{ display: 'flex', gap: 2 }}
                    >
                        <IconButton
                            onClick={prev}
                            disabled={index === 0}
                            sx={{ color: 'white', fontSize: '1.5rem' }}
                            aria-label="previous image"
                        >
                            ←
                        </IconButton>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', alignSelf: 'center' }}>
                            {index + 1} / {images.length}
                        </Typography>
                        <IconButton
                            onClick={next}
                            disabled={index === images.length - 1}
                            sx={{ color: 'white', fontSize: '1.5rem' }}
                            aria-label="next image"
                        >
                            →
                        </IconButton>
                    </Box>
                )}
            </Box>
        </Modal>
    )
}
