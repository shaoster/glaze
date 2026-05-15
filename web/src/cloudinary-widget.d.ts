// Type declarations for the Cloudinary Upload Widget loaded from CDN.
// https://cloudinary.com/documentation/upload_widget

export interface CloudinaryUploadWidgetResult {
  event: string;
  info: {
    secure_url: string;
    public_id: string;
    resource_type: string;
    [key: string]: unknown;
  };
}

export interface CloudinaryUploadWidget {
  open: () => void;
  close: () => void;
  destroy: () => void;
}

export interface CloudinaryUploadWidgetOptions {
  cloudName: string;
  apiKey: string;
  uploadSignature: (
    callback: (signature: string) => void,
    paramsToSign: Record<string, unknown>,
  ) => void;
  folder?: string;
  uploadPreset?: string;
  sources?: string[];
  multiple?: boolean;
  resourceType?: string;
  styles?: {
    palette?: Record<string, string>;
    fonts?: Record<string, string>;
  };
  [key: string]: unknown;
}

declare global {
  interface Window {
    cloudinary?: {
      openUploadWidget: (
        options: CloudinaryUploadWidgetOptions,
        callback: (
          error: unknown,
          result: CloudinaryUploadWidgetResult,
        ) => void,
      ) => CloudinaryUploadWidget;
      createUploadWidget: (
        options: CloudinaryUploadWidgetOptions,
        callback: (
          error: unknown,
          result: CloudinaryUploadWidgetResult,
        ) => void,
      ) => CloudinaryUploadWidget;
    };
  }
}

export {};
