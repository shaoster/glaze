import {
  fetchCloudinaryWidgetConfig,
  signCloudinaryWidgetParams,
  type CloudinaryWidgetConfig,
} from "./api";
import type {
  CloudinaryUploadWidget,
  CloudinaryUploadWidgetOptions,
  CloudinaryUploadWidgetResult,
} from "../cloudinary-widget";

export type CloudinaryUploadMessages = {
  configError: string;
  unavailableError: string;
  signatureError: string;
  uploadError: string;
};

export type CloudinaryUploadCallbacks = {
  onError: (message: string) => void;
  onDisplayChange?: (state: string) => void;
  onSuccess: (
    result: CloudinaryUploadWidgetResult,
    config: CloudinaryWidgetConfig,
  ) => void | Promise<void>;
};

export type CloudinaryUploadOptions = {
  messages: CloudinaryUploadMessages;
  widgetOptions?: Partial<CloudinaryUploadWidgetOptions>;
  callbacks: CloudinaryUploadCallbacks;
};

function displayStateFrom(result: CloudinaryUploadWidgetResult) {
  if (typeof result.info === "string") {
    return result.info;
  }
  return (result.info as Record<string, unknown>).state;
}

export async function openCloudinaryUploadWidget({
  messages,
  widgetOptions,
  callbacks,
}: CloudinaryUploadOptions): Promise<CloudinaryUploadWidget | null> {
  let config: CloudinaryWidgetConfig;
  try {
    config = await fetchCloudinaryWidgetConfig();
  } catch {
    callbacks.onError(messages.configError);
    return null;
  }

  if (!window.cloudinary?.createUploadWidget) {
    callbacks.onError(messages.unavailableError);
    return null;
  }

  const widget = window.cloudinary.createUploadWidget(
    {
      cloudName: config.cloud_name,
      apiKey: config.api_key,
      uploadSignature: (callback, paramsToSign) => {
        signCloudinaryWidgetParams(paramsToSign as Record<string, unknown>)
          .then(callback)
          .catch(() => callbacks.onError(messages.signatureError));
      },
      ...(config.folder ? { folder: config.folder } : {}),
      ...(config.upload_preset ? { uploadPreset: config.upload_preset } : {}),
      ...widgetOptions,
    },
    (error, result) => {
      if (error) {
        callbacks.onError(messages.uploadError);
        return;
      }
      if (result?.event === "display-changed") {
        const state = displayStateFrom(result);
        if (typeof state === "string") {
          callbacks.onDisplayChange?.(state);
        }
      }
      if (result?.event === "success") {
        void callbacks.onSuccess(result, config);
      }
    },
  );

  widget.open();
  return widget;
}
