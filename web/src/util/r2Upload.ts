/**
 * Direct-to-R2 image upload.
 *
 * Flow: optionally downscale the image client-side (bounding the long edge so
 * phone photos don't ship at full sensor resolution), request a presigned PUT
 * URL from the backend, PUT the bytes straight to R2, and return the public
 * CDN URL plus the pixel dimensions to record on the Image row.
 */
import axios from "axios";
import { fetchR2PresignedUrl } from "./api";

/** Long-edge cap applied before upload; larger images are downscaled. */
export const MAX_UPLOAD_LONG_EDGE = 2560;

const DOWNSCALE_CONTENT_TYPE = "image/jpeg";
const DOWNSCALE_QUALITY = 0.9;

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

/**
 * Decode the file to learn its dimensions and downscale when oversized.
 * Files the browser cannot decode (e.g. HEIC on most non-Safari browsers)
 * are uploaded unchanged with unknown dimensions — the backend records
 * width/height as null and the asset still renders wherever the platform
 * supports the format.
 */
async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { blob: file, contentType: file.type, width: null, height: null };
  }

  try {
    const { width, height } = bitmap;
    const longEdge = Math.max(width, height);
    if (longEdge <= MAX_UPLOAD_LONG_EDGE) {
      return { blob: file, contentType: file.type, width, height };
    }

    const scale = MAX_UPLOAD_LONG_EDGE / longEdge;
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { blob: file, contentType: file.type, width, height };
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const blob = await canvasToBlob(canvas);
    return {
      blob,
      contentType: DOWNSCALE_CONTENT_TYPE,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Upload an image file to R2 via a presigned PUT URL.
 *
 * Uses bare axios (not the API client): the presigned URL is an absolute
 * cross-origin URL and must not carry app auth headers — the signature in
 * the URL is the credential.
 */
export async function uploadImageToR2(file: File): Promise<R2UploadResult> {
  const prepared = await prepareImageForUpload(file);
  if (!prepared.contentType) {
    throw new Error("Could not determine the image type for upload.");
  }
  const presigned = await fetchR2PresignedUrl(prepared.contentType);
  await axios.put(presigned.upload_url, prepared.blob, {
    headers: { "Content-Type": prepared.contentType },
  });
  return {
    url: presigned.public_url,
    width: prepared.width,
    height: prepared.height,
  };
}
