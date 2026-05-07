/**
 * CloudinaryImage — optimized image renderer.
 *
 * When cloud_name and cloudinary_public_id are both provided and non-null,
 * the component uses @cloudinary/url-gen to request a size-appropriate
 * rendition from Cloudinary's image pipeline (auto format, auto quality,
 * fill gravity). Otherwise it falls back to a plain <img> at the original URL.
 *
 * Context-specific sizing:
 *   thumbnail — 64×64 fill, used in image lists and history rows
 *   gallery   — tile-sized fill, used in the Piece photo gallery grid
 *   lightbox  — constrained to 90 vw × 80 vh, for the full-screen viewer
 *   detail    — fills the local container, for the PieceDetail hero image
 *   preview   — 64×64 fill, used for the upload preview before saving
 */
import { Cloudinary } from "@cloudinary/url-gen";
import { crop as cropAction, fill, fit } from "@cloudinary/url-gen/actions/resize";
import { format, quality } from "@cloudinary/url-gen/actions/delivery";
import { auto as autoFormat, jpg } from "@cloudinary/url-gen/qualifiers/format";
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality";
import { autoGravity } from "@cloudinary/url-gen/qualifiers/gravity";
import { relative } from "@cloudinary/url-gen/qualifiers/flag";
import { AdvancedImage } from "@cloudinary/react";
import { Box, CircularProgress } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { ImageCrop } from "../util/types";

const THUMBNAIL_SIZE = 64;
const LIGHTBOX_MAX_WIDTH = "90vw";
const LIGHTBOX_MAX_HEIGHT = "80vh";
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
    pixelRatio: globalThis.window?.devicePixelRatio ?? DEFAULT_DEVICE_PIXEL_RATIO,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type CloudinaryImageContext =
  | "thumbnail"
  | "gallery"
  | "lightbox"
  | "detail"
  | "preview";

export type CloudinaryImageProps = {
  /** Full delivery URL — always required as fallback. */
  url: string;
  /** Cloudinary cloud_name stored on the image record. */
  cloud_name?: string | null;
  /** Cloudinary public_id stored on the image record. */
  cloudinary_public_id?: string | null;
  alt?: string;
  /** Rendering context determines the requested dimensions. */
  context: CloudinaryImageContext;
  crop?: ImageCrop | null;
  requestedWidth?: number;
  requestedHeight?: number;
  style?: React.CSSProperties;
  className?: string;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  /** data-testid forwarded to the underlying <img>. */
  "data-testid"?: string;
};

export default function CloudinaryImage({
  url,
  cloud_name,
  cloudinary_public_id,
  alt = "",
  context,
  crop,
  requestedWidth,
  requestedHeight,
  style,
  className,
  onLoad,
  "data-testid": testId,
}: CloudinaryImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const advancedImageRef = useRef<AdvancedImage | null>(null);

  // Reset loading state when the image source changes. Storing the previous key
  // in state (not a ref) is the React-documented pattern for deriving state from
  // props during render — refs must not be read during render.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const cropKey = crop
    ? `${crop.x}:${crop.y}:${crop.width}:${crop.height}`
    : "";
  const currentKey = `${url}__${cloudinary_public_id}__${context}__${cropKey}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setIsLoading(true);
  }

  useEffect(() => {
    function syncLoadedStateFromDom() {
      const image =
        imageRef.current ?? advancedImageRef.current?.imageRef?.current ?? null;
      if (image?.complete && image.naturalWidth > 0) {
        setIsLoading(false);
      }
    }

    syncLoadedStateFromDom();
    window.addEventListener("pageshow", syncLoadedStateFromDom);
    document.addEventListener("visibilitychange", syncLoadedStateFromDom);
    return () => {
      window.removeEventListener("pageshow", syncLoadedStateFromDom);
      document.removeEventListener("visibilitychange", syncLoadedStateFromDom);
    };
  }, [url, cloudinary_public_id, context, cropKey]);

  function handleLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    setIsLoading(false);
    onLoad?.(event);
  }

  function handleError() {
    setIsLoading(false);
  }

  const wrapperStyle: React.CSSProperties =
    context === "lightbox"
      ? {
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: LIGHTBOX_MAX_WIDTH,
          height: LIGHTBOX_MAX_HEIGHT,
          maxWidth: LIGHTBOX_MAX_WIDTH,
          maxHeight: LIGHTBOX_MAX_HEIGHT,
        }
      : context === "detail"
        ? {
            position: "relative",
            display: "block",
            width: "100%",
            height: "100%",
          }
      : context === "gallery"
        ? {
            position: "relative",
            display: "block",
            width: "100%",
            height: "100%",
          }
      : {
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: THUMBNAIL_SIZE,
          height: THUMBNAIL_SIZE,
          flexShrink: 0,
        };
  const spinnerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  };

  const imageStyle: React.CSSProperties = {
    ...style,
    opacity: isLoading ? 0 : 1,
  };

  const cloudName = cloud_name?.trim() || null;
  const publicId = cloudinary_public_id?.trim() || null;
  const viewport = getViewportSnapshot();

  if (cloudName && publicId) {
    const cld = new Cloudinary({ cloud: { cloudName } });
    const img = cld.image(publicId);

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
      const targetWidth =
        context === "gallery" ? (requestedWidth ?? 320) : THUMBNAIL_SIZE;
      const targetHeight =
        context === "gallery" ? (requestedHeight ?? 240) : THUMBNAIL_SIZE;
      // thumbnail, gallery, or preview — cropped fill with auto gravity
      img.resize(
        fill()
          .width(targetWidth)
          .height(targetHeight)
          .gravity(autoGravity()),
      );
    }

    // Thumbnail and preview contexts request JPG explicitly — consistent
    // format for small fill crops. Lightbox uses auto format so the browser
    // can receive WebP/AVIF for large images.
    img.delivery(format(context === "lightbox" ? autoFormat() : jpg()));
    img.delivery(quality(autoQuality()));

    return (
      <Box style={wrapperStyle}>
        {isLoading && (
          <Box style={spinnerStyle}>
            <CircularProgress size={24} />
          </Box>
        )}
        <AdvancedImage
          ref={advancedImageRef}
          cldImg={img}
          alt={alt}
          style={imageStyle}
          className={className}
          onLoad={handleLoad}
          onError={handleError}
          data-testid={testId}
        />
      </Box>
    );
  }

  // No Cloudinary identity available — plain img fallback.
  return (
    <Box style={wrapperStyle}>
      {isLoading && (
        <Box style={spinnerStyle}>
          <CircularProgress size={24} />
        </Box>
      )}
      <img
        ref={imageRef}
        src={url}
        alt={alt}
        style={imageStyle}
        className={className}
        onLoad={handleLoad}
        onError={handleError}
        data-testid={testId}
        role="img"
      />
    </Box>
  );
}
