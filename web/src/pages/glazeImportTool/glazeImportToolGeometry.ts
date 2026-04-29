import { clampOcrRegion, defaultOcrRegion, type CropSquare, type OcrRegion } from "../ocrDetection";

export const MIN_CROP_SIZE = 96;

export function defaultCrop(dimensions: {
  width: number;
  height: number;
}): CropSquare {
  const size = Math.max(dimensions.width, dimensions.height);
  return {
    x: Math.round((dimensions.width - size) / 2),
    y: Math.round((dimensions.height - size) / 2),
    size,
    rotation: 0,
  };
}

function getOverflowPadding(dimensions: { width: number; height: number }) {
  return Math.max(dimensions.width, dimensions.height);
}

export function getViewportPadding(dimensions: { width: number; height: number }) {
  return Math.min(
    180,
    Math.max(
      56,
      Math.round(Math.max(dimensions.width, dimensions.height) * 0.06),
    ),
  );
}

export function clampCrop(
  dimensions: { width: number; height: number },
  crop: CropSquare,
): CropSquare {
  const padding = getOverflowPadding(dimensions);
  const stageWidth = dimensions.width + padding * 2;
  const stageHeight = dimensions.height + padding * 2;
  const maxSize = Math.min(stageWidth, stageHeight);
  const size = Math.max(
    MIN_CROP_SIZE,
    Math.min(Math.round(crop.size), maxSize),
  );
  const minX = -padding;
  const minY = -padding;
  const maxX = dimensions.width + padding - size;
  const maxY = dimensions.height + padding - size;
  return {
    ...crop,
    x: Math.max(minX, Math.min(Math.round(crop.x), maxX)),
    y: Math.max(minY, Math.min(Math.round(crop.y), maxY)),
    size,
  };
}

export function clampSelectedOcrRegion(
  selectedCrop: CropSquare | null,
  region: OcrRegion | null | undefined,
): OcrRegion | null {
  if (!selectedCrop || !region) return null;
  return clampOcrRegion(selectedCrop.size, region);
}

export function defaultCropOcrRegion(crop: CropSquare) {
  return defaultOcrRegion(crop.size);
}

export function rotatePt(x: number, y: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [
    x * Math.cos(rad) - y * Math.sin(rad),
    x * Math.sin(rad) + y * Math.cos(rad),
  ];
}
