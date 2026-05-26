import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress } from "@mui/material";
import { useAsync } from "../util/useAsync";
import { Cloudinary } from "@cloudinary/url-gen";
import { format } from "@cloudinary/url-gen/actions/delivery";
import { auto as autoFormat } from "@cloudinary/url-gen/qualifiers/format";
import type { ImageCrop } from "../util/types";

interface CropOverlayProps {
  cloudinaryPublicId: string;
  cloudName: string;
  initialCrop: ImageCrop | null;
  onSave: (crop: ImageCrop) => Promise<void>;
  onCancel: () => void;
}

type Handle =
  | "nw"
  | "n"
  | "ne"
  | "w"
  | "e"
  | "sw"
  | "s"
  | "se"
  | "move";

function buildUncroppedUrl(publicId: string, cloudName: string): string {
  const cld = new Cloudinary({ cloud: { cloudName } });
  const img = cld.image(publicId);
  img.delivery(format(autoFormat()));
  return img.toURL();
}

function handleCursor(h: Handle): string {
  const map: Record<Handle, string> = {
    nw: "nwse-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    se: "nwse-resize",
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    move: "move",
  };
  return map[h];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function applyCropDelta(
  base: ImageCrop,
  handle: Handle,
  dx: number,
  dy: number,
): ImageCrop {
  let { x, y, width: w, height: h } = base;
  const MIN = 0.02;
  switch (handle) {
    case "move":
      x = clamp(x + dx, 0, 1 - w);
      y = clamp(y + dy, 0, 1 - h);
      break;
    case "nw": {
      const nx = clamp(x + dx, 0, x + w - MIN);
      const ny = clamp(y + dy, 0, y + h - MIN);
      w += x - nx;
      h += y - ny;
      x = nx;
      y = ny;
      break;
    }
    case "ne": {
      w = clamp(w + dx, MIN, 1 - x);
      const ny = clamp(y + dy, 0, y + h - MIN);
      h += y - ny;
      y = ny;
      break;
    }
    case "sw": {
      const nx = clamp(x + dx, 0, x + w - MIN);
      w += x - nx;
      x = nx;
      h = clamp(h + dy, MIN, 1 - y);
      break;
    }
    case "se":
      w = clamp(w + dx, MIN, 1 - x);
      h = clamp(h + dy, MIN, 1 - y);
      break;
    case "n": {
      const ny = clamp(y + dy, 0, y + h - MIN);
      h += y - ny;
      y = ny;
      break;
    }
    case "s":
      h = clamp(h + dy, MIN, 1 - y);
      break;
    case "w": {
      const nx = clamp(x + dx, 0, x + w - MIN);
      w += x - nx;
      x = nx;
      break;
    }
    case "e":
      w = clamp(w + dx, MIN, 1 - x);
      break;
  }
  return { x, y, width: w, height: h };
}

export default function CropOverlay({
  cloudinaryPublicId,
  cloudName,
  initialCrop,
  onSave,
  onCancel,
}: CropOverlayProps) {
  const defaultCrop: ImageCrop = initialCrop ?? {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
  const [crop, setCrop] = useState<ImageCrop>(defaultCrop);
  const [imgRect, setImgRect] = useState<DOMRect | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    handle: Handle;
    startX: number;
    startY: number;
    startCrop: ImageCrop;
  } | null>(null);

  const url = useMemo(
    () => buildUncroppedUrl(cloudinaryPublicId, cloudName),
    [cloudinaryPublicId, cloudName],
  );

  const { loading: imageLoading } = useAsync<void>(
    useCallback(
      () =>
        new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load image"));
          img.src = url;
        }),
      [url],
    ),
  );

  const updateRect = useCallback(() => {
    if (imgRef.current) setImgRect(imgRef.current.getBoundingClientRect());
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect]);

  function toPx(n: ImageCrop, rect: DOMRect) {
    return {
      x: rect.left + n.x * rect.width,
      y: rect.top + n.y * rect.height,
      w: n.width * rect.width,
      h: n.height * rect.height,
    };
  }

  useEffect(() => {
    function applyMove(clientX: number, clientY: number) {
      if (!dragRef.current || !imgRect) return;
      const { handle, startX, startY, startCrop } = dragRef.current;
      const dx = (clientX - startX) / imgRect.width;
      const dy = (clientY - startY) / imgRect.height;
      setCrop(applyCropDelta(startCrop, handle, dx, dy));
    }
    function onMouseMove(e: MouseEvent) { applyMove(e.clientX, e.clientY); }
    function onMouseUp() { dragRef.current = null; }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      applyMove(e.touches[0].clientX, e.touches[0].clientY);
    }
    function onTouchEnd() { dragRef.current = null; }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [imgRect]);

  function startDrag(handle: Handle, e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragRef.current = { handle, startX: clientX, startY: clientY, startCrop: crop };
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(crop);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const HANDLE_R = 6;
  const overlay = imgRect
    ? (() => {
        const { x: px, y: py, w: pw, h: ph } = toPx(crop, imgRect);
        const handles: { id: Handle; cx: number; cy: number }[] = [
          { id: "nw", cx: px, cy: py },
          { id: "n", cx: px + pw / 2, cy: py },
          { id: "ne", cx: px + pw, cy: py },
          { id: "w", cx: px, cy: py + ph / 2 },
          { id: "e", cx: px + pw, cy: py + ph / 2 },
          { id: "sw", cx: px, cy: py + ph },
          { id: "s", cx: px + pw / 2, cy: py + ph },
          { id: "se", cx: px + pw, cy: py + ph },
        ];
        const MASK_ALPHA = 0.55;
        const W = window.innerWidth;
        const H = window.innerHeight;
        return (
          <svg
            style={{
              position: "fixed",
              inset: 0,
              width: "100vw",
              height: "100vh",
              pointerEvents: "none",
              zIndex: 1,
            }}
            viewBox={`0 0 ${W} ${H}`}
          >
            <rect
              x={0}
              y={0}
              width={W}
              height={H}
              fill={`rgba(0,0,0,${MASK_ALPHA})`}
            />
            <rect x={px} y={py} width={pw} height={ph} fill="transparent" />
            <rect
              x={px}
              y={py}
              width={pw}
              height={ph}
              fill="none"
              stroke="white"
              strokeWidth={1.5}
            />
            <rect
              x={px}
              y={py}
              width={pw}
              height={ph}
              fill="transparent"
              style={{ pointerEvents: "all", cursor: "move" }}
              onMouseDown={(e) => startDrag("move", e)}
              onTouchStart={(e) => startDrag("move", e)}
            />
            {handles.map(({ id, cx, cy }) => (
              <circle
                key={id}
                cx={cx}
                cy={cy}
                r={HANDLE_R * 2}
                fill="white"
                stroke="#555"
                strokeWidth={1}
                style={{ pointerEvents: "all", cursor: handleCursor(id) }}
                onMouseDown={(e) => startDrag(id, e)}
                onTouchStart={(e) => startDrag(id, e)}
              />
            ))}
          </svg>
        );
      })()
    : null;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Box sx={{ position: "relative" }}>
        {imageLoading ? (
          <Box
            sx={{
              width: "90vw",
              maxWidth: 800,
              height: "60vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress sx={{ color: "white" }} />
          </Box>
        ) : (
          <>
            <img
              ref={imgRef}
              src={url}
              onLoad={updateRect}
              style={{
                maxWidth: "90vw",
                maxHeight: "70vh",
                objectFit: "contain",
                display: "block",
              }}
              alt="Crop editor"
            />
            {overlay}
          </>
        )}
      </Box>
      {saveError && (
        <Alert severity="error" sx={{ maxWidth: "90vw", position: "relative", zIndex: 2 }}>
          {saveError}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 1, mt: 1, position: "relative", zIndex: 2 }}>
        <Button
          variant="outlined"
          onClick={onCancel}
          disabled={saving}
          sx={{ color: "white", borderColor: "rgba(255,255,255,0.5)" }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving || imageLoading}
        >
          {saving ? <CircularProgress size={18} /> : "Save Crop"}
        </Button>
      </Box>
    </Box>
  );
}
