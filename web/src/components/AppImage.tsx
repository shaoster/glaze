/**
 * AppImage — image renderer for R2/CDN-hosted assets.
 *
 * Renders a standard <img> pointing at the stored CDN URL. When an eagerly
 * generated crop exists (`croppedUrl`, materialized by the backend
 * generate_cropped_image task), it is preferred; until the task lands the
 * raw original renders instead. No request-time transforms exist — the URL
 * is served as-is.
 *
 * Context-specific chrome:
 *   thumbnail — 64×64 box, used in image lists and history rows
 *   gallery   — fills the local container, used in the Piece photo gallery grid
 *   lightbox  — fit-content box, for the full-screen viewer
 *   detail    — fills the local container, for the PieceDetail hero image
 *   preview   — 64×64 box, used for the upload preview before saving
 */
import { Box, CircularProgress } from "@mui/material";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ImageCrop } from "../util/types";

const THUMBNAIL_SIZE = 64;

export type AppImageContext =
  | "thumbnail"
  | "gallery"
  | "lightbox"
  | "detail"
  | "preview";

/** Prefer the materialized crop; fall back to the original until it exists. */
function resolveImageUrl(url: string, croppedUrl?: string | null): string {
  return croppedUrl?.trim() || url;
}

const imageLoadQueryOptions = (url: string) => ({
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

function useSuspendedImageLoad(url: string) {
  return useSuspenseQuery(imageLoadQueryOptions(url));
}

export type AppImageProps = {
  /** Original delivery URL — always required as fallback. */
  url: string;
  /** CDN URL of the eagerly generated crop; null until the task completes. */
  croppedUrl?: string | null;
  alt?: string;
  /** Rendering context determines the wrapper chrome. */
  context: AppImageContext;
  /** Crop coordinates — used only for skeleton aspect estimation. */
  crop?: ImageCrop | null;
  style?: React.CSSProperties;
  className?: string;
  onLoad?: React.ReactEventHandler<HTMLImageElement>;
  /** data-testid forwarded to the underlying <img>. */
  "data-testid"?: string;
};

/**
 * Outer component: handles the crop-pending guard without any hooks, so the
 * Rules of Hooks are satisfied — the early return comes before any hook calls.
 */
export default function AppImage(props: AppImageProps) {
  if (props.crop && !props.croppedUrl?.trim()) {
    return <ImageSkeleton context={props.context} crop={props.crop} />;
  }
  return <AppImageRenderer {...props} />;
}

function AppImageRenderer({
  url,
  croppedUrl,
  alt = "",
  context,
  style,
  className,
  onLoad,
  "data-testid": testId,
}: AppImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const resolvedUrl = resolveImageUrl(url, croppedUrl);

  // Reset loading state when the image source changes. Storing the previous key
  // in state (not a ref) is the React-documented pattern for deriving state from
  // props during render — refs must not be read during render.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const currentKey = `${resolvedUrl}__${context}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setIsLoading(true);
  }

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
  context: AppImageContext;
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

function InnerSuspenseAppImage(props: AppImageProps) {
  useSuspendedImageLoad(resolveImageUrl(props.url, props.croppedUrl));

  return <AppImage {...props} />;
}

export type SuspenseAppImageProps = AppImageProps & {
  fallback?: React.ReactNode;
};

export function SuspenseAppImage({ fallback, ...props }: SuspenseAppImageProps) {
  // When a crop is pending, AppImage itself renders the skeleton — no URL to
  // preload yet, so skip the Suspense wrapper entirely.
  if (props.crop && !props.croppedUrl?.trim()) {
    return fallback ?? <ImageSkeleton context={props.context} crop={props.crop} />;
  }

  const defaultFallback = fallback ?? (
    <ImageSkeleton context={props.context} crop={props.crop} />
  );

  return (
    <Suspense fallback={defaultFallback}>
      <InnerSuspenseAppImage {...props} />
    </Suspense>
  );
}
