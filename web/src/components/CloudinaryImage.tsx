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
 *   gallery   — tile-sized fill, used in the Piece photo gallery grid
 *   lightbox  — constrained to 90 vw × 80 vh, for the full-screen viewer
 *   detail    — fills the local container, for the PieceDetail hero image
 *   preview   — 64×64 fill, used for the upload preview before saving
 */
import { Cloudinary } from "@cloudinary/url-gen";
import { fill, fit } from "@cloudinary/url-gen/actions/resize";
import { format, quality } from "@cloudinary/url-gen/actions/delivery";
import { auto as autoFormat, jpg } from "@cloudinary/url-gen/qualifiers/format";
import { auto as autoQuality } from "@cloudinary/url-gen/qualifiers/quality";
import { autoGravity } from "@cloudinary/url-gen/qualifiers/gravity";
import { AdvancedImage } from "@cloudinary/react";
import { Box, CircularProgress } from "@mui/material";
import { useEffect, useRef, useState } from "react";

const CLOUDINARY_HOSTNAME = "res.cloudinary.com";
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

/**
 * Parse cloud_name and public_id from a Cloudinary delivery URL.
 *
 * Cloudinary URL structure:
 *   https://res.cloudinary.com/{cloud_name}/image/upload/[transforms/]{public_id}.ext
 *
 * Transforms look like key_value (e.g. f_auto, w_100, c_fill). We skip
 * contiguous leading path segments that match that pattern and treat the
 * remainder as the public_id (without file extension).
 *
 * TODO: This parsing exists for backwards compatibility with images that
 * predate explicit cloudinary_public_id storage. For new uploads the
 * public_id is stored directly, so the URL is only parsed as a fallback.
 * If this heuristic ever becomes a problem (custom domains, CDN prefixes,
 * etc.), two cleaner alternatives are:
 *   1. Frontend config — read cloud_name from VITE_CLOUDINARY_CLOUD_NAME
 *      at module load time; zero schema changes, works for a single cloud.
 *   2. Per-image storage — add cloudinary_cloud_name to CaptionedImage
 *      alongside cloudinary_public_id; fully self-contained records but
 *      redundant data across all rows.
 */
function parseCloudinaryUrl(
  url: string,
): { cloudName: string; publicId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== CLOUDINARY_HOSTNAME) return null;

  // parts: ['', cloudName, 'image', 'upload', ...rest]
  const parts = parsed.pathname.split("/");
  if (parts.length < 5 || parts[2] !== "image" || parts[3] !== "upload")
    return null;

  const cloudName = parts[1];
  const afterUpload = parts.slice(4);

  // Skip transform segments (e.g. f_auto, w_100, c_fill, q_auto)
  const TRANSFORM_RE = /^[a-z][a-z0-9]*_/;
  let i = 0;
  while (i < afterUpload.length - 1 && TRANSFORM_RE.test(afterUpload[i])) {
    i++;
  }
  const publicIdParts = afterUpload.slice(i);
  if (publicIdParts.length === 0) return null;

  // Strip file extension from last segment
  const last = publicIdParts[publicIdParts.length - 1].replace(/\.[^.]+$/, "");
  publicIdParts[publicIdParts.length - 1] = last;

  return { cloudName, publicId: publicIdParts.join("/") };
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
  /** Cloudinary public_id stored alongside the URL, if available. */
  cloudinary_public_id?: string | null;
  alt?: string;
  /** Rendering context determines the requested dimensions. */
  context: CloudinaryImageContext;
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
  cloudinary_public_id,
  alt = "",
  context,
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
  const currentKey = `${url}__${cloudinary_public_id}__${context}`;
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
  }, [url, cloudinary_public_id, context]);

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

  // Resolve cloud_name + publicId. Prefer the stored prop; fall back to URL parse.
  const parsed = parseCloudinaryUrl(url);
  const cloudName = parsed?.cloudName ?? null;
  const publicId =
    (cloudinary_public_id?.trim() || null) ?? parsed?.publicId ?? null;
  const viewport = getViewportSnapshot();

  if (cloudName && publicId) {
    const cld = new Cloudinary({ cloud: { cloudName } });
    const img = cld.image(publicId);

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
