/**
 * Direct-to-R2 image upload with server-side JPEG normalization.
 *
 * Flow:
 * 1. For browser-decodable formats: optionally downscale client-side (long
 *    edge ≤ 2560 px) and re-encode as JPEG before upload — the presigned PUT
 *    lands a JPEG directly, so no conversion task is needed.
 * 2. For browser-opaque formats (HEIC/HEIF, AVIF, GIF, WebP, PNG, etc.) or
 *    whenever canvas encoding is unavailable: upload the raw bytes to R2, then
 *    enqueue a server-side `convert_image_to_jpeg` task and poll until it
 *    completes. The returned URL always points at the resulting JPEG.
 */
import axios from "axios";
import {
  fetchR2PresignedUrl,
  getR2ConversionStatus,
  triggerR2ImageConversion,
} from "./api";

/** Long-edge cap applied before upload; larger images are downscaled. */
export const MAX_UPLOAD_LONG_EDGE = 2560;

const DOWNSCALE_CONTENT_TYPE = "image/jpeg";
const DOWNSCALE_QUALITY = 0.9;

/** Interval between conversion-task polls, in ms. */
const CONVERSION_POLL_INTERVAL_MS = 1500;
/** Maximum total wait for a conversion task before giving up, in ms. */
const CONVERSION_POLL_TIMEOUT_MS = 120_000;

export type R2UploadResult = {
  url: string;
  width: number | null;
  height: number | null;
};

type PreparedImage = {
  blob: Blob;
  contentType: string;
  width: number | null;
  height: number | null;
  /** True when the blob was already canvas-encoded as JPEG and is final. */
  isJpeg: boolean;
};

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Failed to encode resized image.")),
      DOWNSCALE_CONTENT_TYPE,
      DOWNSCALE_QUALITY,
    );
  });
}

/** Extension → MIME type fallback for browsers that leave File.type blank. */
const EXTENSION_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
};

function inferMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[ext] ?? "application/octet-stream";
}

/**
 * Decode the file client-side when possible.
 *
 * - JPEG files within the size cap are returned as-is (already final).
 * - Other browser-decodable formats and oversized JPEGs are canvas-encoded to
 *   JPEG so the presigned PUT lands a final JPEG (no server conversion needed).
 * - Files the browser cannot decode (HEIC on non-Safari, etc.) are returned
 *   as raw bytes; the server will convert them via the async task.
 */
async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const mimeType = inferMimeType(file);
  const originalIsJpeg =
    mimeType === "image/jpeg" || mimeType === "image/jpg";

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Browser cannot decode this format (e.g. HEIC on Firefox/Chrome).
    // Upload raw; server will convert via convert_image_to_jpeg task.
    return {
      blob: file,
      contentType: mimeType,
      width: null,
      height: null,
      isJpeg: false,
    };
  }

  try {
    const { width, height } = bitmap;
    const longEdge = Math.max(width, height);

    // Already a correctly-sized JPEG — nothing to do.
    if (originalIsJpeg && longEdge <= MAX_UPLOAD_LONG_EDGE) {
      return { blob: file, contentType: mimeType, width, height, isJpeg: true };
    }

    // Re-encode via canvas: either oversized JPEG or a non-JPEG format the
    // browser can decode (PNG, WebP, AVIF, GIF…).
    const scale =
      longEdge > MAX_UPLOAD_LONG_EDGE ? MAX_UPLOAD_LONG_EDGE / longEdge : 1;
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      // Canvas unavailable — fall back to server conversion.
      return {
        blob: file,
        contentType: mimeType,
        width,
        height,
        isJpeg: false,
      };
    }
    // Flatten transparency onto white before JPEG encoding (JPEG has no alpha).
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const blob = await canvasToBlob(canvas);
    return {
      blob,
      contentType: DOWNSCALE_CONTENT_TYPE,
      width: targetWidth,
      height: targetHeight,
      isJpeg: true,
    };
  } finally {
    bitmap.close();
  }
}

/** Poll a conversion task until it succeeds, fails, or times out. */
async function waitForConversion(taskId: string): Promise<R2UploadResult> {
  const deadline = Date.now() + CONVERSION_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, CONVERSION_POLL_INTERVAL_MS));
    const status = await getR2ConversionStatus(taskId);
    if (status.status === "success" && status.result) {
      return {
        url: status.result.url,
        width: status.result.width,
        height: status.result.height,
      };
    }
    if (status.status === "failure") {
      throw new Error(
        `Image conversion failed: ${status.error ?? "unknown error"}`,
      );
    }
  }
  throw new Error("Image conversion timed out.");
}

/**
 * Upload an image file to R2 and return a JPEG public URL.
 *
 * Uses bare axios for the PUT (the presigned URL is absolute and cross-origin;
 * app auth headers must not be sent — the URL signature is the credential).
 *
 * When `imageId` is provided it is forwarded to the conversion task so the
 * Image model row is rewritten automatically on completion.
 */
export async function uploadImageToR2(
  file: File,
  imageId?: string | null,
): Promise<R2UploadResult> {
  const prepared = await prepareImageForUpload(file);
  if (!prepared.contentType) {
    throw new Error("Could not determine the image type for upload.");
  }

  const presigned = await fetchR2PresignedUrl(prepared.contentType);

  // Use multipart POST so R2 enforces the server-signed content-length-range
  // condition. The 'file' field must come last per the S3 presigned POST spec.
  const form = new FormData();
  Object.entries(presigned.fields).forEach(([k, v]) => form.append(k, v));
  form.append("file", prepared.blob);
  await axios.post(presigned.upload_url, form);

  // Already a JPEG — return immediately, no server conversion needed.
  if (prepared.isJpeg) {
    return {
      url: presigned.public_url,
      width: prepared.width,
      height: prepared.height,
    };
  }

  // Non-JPEG: enqueue server-side conversion and poll until the JPEG is ready.
  const { task_id, needs_conversion } = await triggerR2ImageConversion(
    presigned.key,
    imageId,
  );
  if (!needs_conversion || !task_id) {
    // Server decided no conversion is necessary (shouldn't happen often).
    return {
      url: presigned.public_url,
      width: prepared.width,
      height: prepared.height,
    };
  }

  return waitForConversion(task_id);
}
