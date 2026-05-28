/**
 * CloudinaryImage — optimized image renderer.
 *
 * Renders a standard <img> using the size-appropriate delivery URL computed via
 * getCloudinaryUrl (backed by Cloudinary transforms if identity is present,
 * otherwise falling back to standard URLs).
 *
 * Context-specific sizing:
 *   thumbnail — 64×64 fill, used in image lists and history rows
 *   gallery   — tile-sized fill, used in the Piece photo gallery grid
 *   lightbox  — constrained to 90 vw × 80 vh, for the full-screen viewer
 *   detail    — fills the local container, for the PieceDetail hero image
 *   preview   — 64×64 fill, used for the upload preview before saving
 */
import { Box, CircularProgress } from "@mui/material";
import { useEffect, useRef, useState, Suspense } from "react";
import type { ImageCrop } from "../util/types";
import { useSuspendedImageLoad } from "../util/imageQueries";
import { getCloudinaryUrl, type CloudinaryImageContext } from "../util/cloudinary";

const THUMBNAIL_SIZE = 64;

export type { CloudinaryImageContext };

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

  const resolvedUrl = getCloudinaryUrl({
    url,
    cloud_name,
    cloudinary_public_id,
    context,
    crop,
    requestedWidth,
    requestedHeight,
  });

  useEffect(() => {
    function syncLoadedStateFromDom() {
      const image = imageRef.current;
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
  }, [resolvedUrl]);

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
          width: "fit-content",
          height: "fit-content",
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

  return (
    <Box style={wrapperStyle}>
      {isLoading && (
        <Box style={spinnerStyle}>
          <CircularProgress size={24} />
        </Box>
      )}
      <img
        ref={imageRef}
        src={resolvedUrl}
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

export function ImageSkeleton({
  context,
  crop,
  aspectRatio,
}: {
  context: CloudinaryImageContext;
  crop?: ImageCrop | null;
  aspectRatio?: number | null;
}) {
  const aspect = aspectRatio ?? (crop ? crop.width / crop.height : 4 / 3);

  if (context === "lightbox") {
    return (
      <Box
        sx={{
          aspectRatio: aspect,
          maxWidth: "90vw",
          maxHeight: "80vh",
          width: "90vw",
          borderRadius: "4px",
          bgcolor: "rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress sx={{ color: "white" }} />
      </Box>
    );
  }

  if (context === "detail") {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
          minHeight: { xs: 200, sm: 260 },
          aspectRatio: { md: "4 / 3" },
          bgcolor: "rgba(255,255,255,0.06)",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  // Fallback for gallery/thumbnail/preview
  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        aspectRatio: aspect,
        bgcolor: "rgba(255,255,255,0.06)",
        borderRadius: "4px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <CircularProgress size={16} />
    </Box>
  );
}

function InnerSuspenseCloudinaryImage(props: CloudinaryImageProps) {
  const url = getCloudinaryUrl({
    url: props.url,
    cloud_name: props.cloud_name,
    cloudinary_public_id: props.cloudinary_public_id,
    crop: props.crop,
    context: props.context,
    requestedWidth: props.requestedWidth,
    requestedHeight: props.requestedHeight,
  });

  useSuspendedImageLoad(url);

  return <CloudinaryImage {...props} />;
}

export type SuspenseCloudinaryImageProps = CloudinaryImageProps & {
  fallback?: React.ReactNode;
};

export function SuspenseCloudinaryImage({
  fallback,
  ...props
}: SuspenseCloudinaryImageProps) {
  const defaultFallback = fallback ?? (
    <ImageSkeleton context={props.context} crop={props.crop} />
  );

  return (
    <Suspense fallback={defaultFallback}>
      <InnerSuspenseCloudinaryImage {...props} />
    </Suspense>
  );
}
