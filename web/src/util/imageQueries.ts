import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { Cloudinary } from "@cloudinary/url-gen";
import {
  crop as cropAction,
  fill,
  fit,
  scale,
} from "@cloudinary/url-gen/actions/resize";
import { format, quality } from "@cloudinary/url-gen/actions/delivery";
import { auto as autoFormat, jpg } from "@cloudinary/url-gen/qualifiers/format";
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality";
import { relative } from "@cloudinary/url-gen/qualifiers/flag";
import type { ImageCrop } from "./types";

export type CloudinaryImageContext =
  | "thumbnail"
  | "gallery"
  | "lightbox"
  | "detail"
  | "preview";

const THUMBNAIL_SIZE = 64;
const DEFAULT_VIEWPORT_WIDTH = 1200;
const DEFAULT_VIEWPORT_HEIGHT = 900;
const DEFAULT_DEVICE_PIXEL_RATIO = 1;

type ViewportSnapshot = {
  width: number;
  height: number;
  pixelRatio: number;
};

function getViewportSnapshot(): ViewportSnapshot {
  return {
    width: globalThis.window?.innerWidth ?? DEFAULT_VIEWPORT_WIDTH,
    height: globalThis.window?.innerHeight ?? DEFAULT_VIEWPORT_HEIGHT,
    pixelRatio:
      globalThis.window?.devicePixelRatio ?? DEFAULT_DEVICE_PIXEL_RATIO,
  };
}

export function getCloudinaryUrl({
  url,
  cloud_name,
  cloudinary_public_id,
  context,
  crop,
  requestedWidth,
  requestedHeight,
}: {
  url: string;
  cloud_name?: string | null;
  cloudinary_public_id?: string | null;
  context: CloudinaryImageContext;
  crop?: ImageCrop | null;
  requestedWidth?: number;
  requestedHeight?: number;
}): string {
  const cloudName = cloud_name?.trim() || null;
  const publicId = cloudinary_public_id?.trim() || null;

  if (cloudName && publicId) {
    const cld = new Cloudinary({ cloud: { cloudName } });
    const img = cld.image(publicId);
    const viewport = getViewportSnapshot();

    if (crop) {
      img.resize(
        cropAction()
          .width(crop.width)
          .height(crop.height)
          .x(crop.x)
          .y(crop.y)
          .addFlag(relative()),
      );
    }

    if (context === "lightbox") {
      const vw = Math.round(viewport.width * viewport.pixelRatio * 0.9);
      const vh = Math.round(viewport.height * viewport.pixelRatio * 0.8);
      img.resize(fit().width(vw).height(vh));
    } else if (context === "detail") {
      const vw = Math.round(viewport.width * viewport.pixelRatio);
      const vh = Math.round(viewport.height * viewport.pixelRatio * 0.65);
      img.resize(fit().width(vw).height(vh));
    } else {
      const targetWidth = Math.round(
        context === "gallery" ? (requestedWidth ?? 320) : THUMBNAIL_SIZE,
      );

      if (crop) {
        img.resize(scale().width(targetWidth));
      } else {
        const targetHeight = Math.round(
          context === "gallery" ? (requestedHeight ?? 240) : THUMBNAIL_SIZE,
        );
        img.resize(fill().width(targetWidth).height(targetHeight));
      }
    }

    img.delivery(format(context === "lightbox" ? autoFormat() : jpg()));
    img.delivery(quality(autoQuality()));

    return img.toURL();
  }

  return url;
}

export const imageLoadQueryOptions = (url: string) => ({
  queryKey: ["image-load", url],
  queryFn: () =>
    new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    }),
  staleTime: Infinity,
});

export function useSuspendedImageLoad(url: string) {
  return useSuspenseQuery(imageLoadQueryOptions(url));
}

export function prefetchCloudinaryImage(
  queryClient: QueryClient,
  image: {
    url: string;
    cloud_name?: string | null;
    cloudinary_public_id?: string | null;
    crop?: ImageCrop | null;
  },
  context: CloudinaryImageContext
) {
  const url = getCloudinaryUrl({
    url: image.url,
    cloud_name: image.cloud_name,
    cloudinary_public_id: image.cloudinary_public_id,
    crop: image.crop,
    context,
  });

  queryClient.prefetchQuery(imageLoadQueryOptions(url));
}
