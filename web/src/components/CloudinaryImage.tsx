/**
 * CloudinaryImage — optimized image renderer.
 *
 * If a Cloudinary public_id can be resolved (from the explicit prop or by
 * parsing the URL), the component uses @cloudinary/url-gen to request a
 * size-appropriate rendition from Cloudinary's image pipeline (auto format,
 * auto quality, fill gravity). Otherwise it falls back to a plain <img>.
 *
 * Context-specific sizing:
 *   thumbnail — 64×64 fill, used in image lists and history rows
 *   lightbox  — constrained to 90 vw × 80 vh, for the full-screen viewer
 *   preview   — 64×64 fill, used for the upload preview before saving
 */
import { Cloudinary } from '@cloudinary/url-gen'
import { fill, fit } from '@cloudinary/url-gen/actions/resize'
import { format, quality } from '@cloudinary/url-gen/actions/delivery'
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format'
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality'
import { autoGravity } from '@cloudinary/url-gen/qualifiers/gravity'
import { AdvancedImage } from '@cloudinary/react'

const CLOUDINARY_HOSTNAME = 'res.cloudinary.com'

/**
 * Parse cloud_name and public_id from a Cloudinary delivery URL.
 *
 * Cloudinary URL structure:
 *   https://res.cloudinary.com/{cloud_name}/image/upload/[transforms/]{public_id}.ext
 *
 * Transforms look like key_value (e.g. f_auto, w_100, c_fill). We skip
 * contiguous leading path segments that match that pattern and treat the
 * remainder as the public_id (without file extension).
 */
function parseCloudinaryUrl(url: string): { cloudName: string; publicId: string } | null {
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return null
    }
    if (parsed.hostname !== CLOUDINARY_HOSTNAME) return null

    // parts: ['', cloudName, 'image', 'upload', ...rest]
    const parts = parsed.pathname.split('/')
    if (parts.length < 5 || parts[2] !== 'image' || parts[3] !== 'upload') return null

    const cloudName = parts[1]
    const afterUpload = parts.slice(4)

    // Skip transform segments (e.g. f_auto, w_100, c_fill, q_auto)
    const TRANSFORM_RE = /^[a-z][a-z0-9]*_/
    let i = 0
    while (i < afterUpload.length - 1 && TRANSFORM_RE.test(afterUpload[i])) {
        i++
    }
    const publicIdParts = afterUpload.slice(i)
    if (publicIdParts.length === 0) return null

    // Strip file extension from last segment
    const last = publicIdParts[publicIdParts.length - 1].replace(/\.[^.]+$/, '')
    publicIdParts[publicIdParts.length - 1] = last

    return { cloudName, publicId: publicIdParts.join('/') }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type CloudinaryImageContext = 'thumbnail' | 'lightbox' | 'preview'

export type CloudinaryImageProps = {
    /** Full delivery URL — always required as fallback. */
    url: string
    /** Cloudinary public_id stored alongside the URL, if available. */
    cloudinary_public_id?: string | null
    alt?: string
    /** Rendering context determines the requested dimensions. */
    context: CloudinaryImageContext
    style?: React.CSSProperties
    className?: string
    onLoad?: React.ReactEventHandler<HTMLImageElement>
    /** data-testid forwarded to the underlying <img>. */
    'data-testid'?: string
}

export default function CloudinaryImage({
    url,
    cloudinary_public_id,
    alt = '',
    context,
    style,
    className,
    onLoad,
    'data-testid': testId,
}: CloudinaryImageProps) {
    // Resolve cloud_name + publicId. Prefer the stored prop; fall back to URL parse.
    const parsed = parseCloudinaryUrl(url)
    const cloudName = parsed?.cloudName ?? null
    const publicId = (cloudinary_public_id?.trim() || null) ?? parsed?.publicId ?? null

    if (cloudName && publicId) {
        const cld = new Cloudinary({ cloud: { cloudName } })
        const img = cld.image(publicId)

        if (context === 'lightbox') {
            const vw = typeof window !== 'undefined' ? Math.round(window.innerWidth * 0.9) : 1200
            const vh = typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.8) : 900
            img.resize(fit().width(vw).height(vh))
        } else {
            // thumbnail or preview — 64×64 fill with auto gravity
            img.resize(fill().width(64).height(64).gravity(autoGravity()))
        }

        img.delivery(format(autoFormat()))
        img.delivery(quality(autoQuality()))

        return (
            <AdvancedImage
                cldImg={img}
                alt={alt}
                style={style}
                className={className}
                onLoad={onLoad}
                data-testid={testId}
            />
        )
    }

    // No Cloudinary identity available — plain img fallback.
    return (
        <img
            src={url}
            alt={alt}
            style={style}
            className={className}
            onLoad={onLoad}
            data-testid={testId}
        />
    )
}
