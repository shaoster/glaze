// Type declarations for the Cloudinary Upload Widget loaded from CDN.
// https://cloudinary.com/documentation/upload_widget

interface CloudinaryUploadWidgetResult {
    event: string
    info: {
        secure_url: string
        public_id: string
        resource_type: string
        [key: string]: unknown
    }
}

interface CloudinaryUploadWidget {
    open: () => void
    close: () => void
    destroy: () => void
}

interface CloudinaryUploadWidgetOptions {
    cloudName: string
    apiKey: string
    uploadSignature: (
        callback: (signature: string) => void,
        paramsToSign: Record<string, unknown>
    ) => void
    folder?: string
    sources?: string[]
    multiple?: boolean
    resourceType?: string
    [key: string]: unknown
}

declare global {
    interface Window {
        cloudinary?: {
            openUploadWidget: (
                options: CloudinaryUploadWidgetOptions,
                callback: (error: unknown, result: CloudinaryUploadWidgetResult) => void
            ) => CloudinaryUploadWidget
        }
    }
}

export {}
