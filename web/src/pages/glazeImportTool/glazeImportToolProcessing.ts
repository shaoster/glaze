import { createWorker } from "tesseract.js";
import {
  clampOcrRegion,
  defaultOcrRegion,
  detectLabelRectFromData,
  ocrRegionFromLabelData,
  DETECT_OCR_ANALYSIS_SIZE,
  DETECT_OCR_LABEL_WHITE_THRESHOLD,
  DETECT_OCR_TEXT_ANALYSIS_SIZE,
  DETECT_OCR_TEXT_DARK_THRESHOLD,
  type CropSquare,
  type LabelRect,
  type OcrRegion,
} from "../ocrDetection";
import type { UploadedRecord } from "./glazeImportToolTypes";
import { clampCrop } from "./glazeImportToolGeometry";

export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

function renderCropToCanvas(
  image: HTMLImageElement,
  crop: CropSquare,
  outputSize: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable.");
  const cx = crop.x + crop.size / 2;
  const cy = crop.y + crop.size / 2;
  const scale = outputSize / crop.size;
  ctx.save();
  ctx.translate(outputSize / 2, outputSize / 2);
  ctx.rotate((-crop.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.drawImage(image, -cx, -cy);
  ctx.restore();
  return canvas;
}

async function detectLabelRect(
  image: HTMLImageElement,
  crop: CropSquare,
  labelWhiteThreshold = DETECT_OCR_LABEL_WHITE_THRESHOLD,
): Promise<{ labelRect: LabelRect | null }> {
  const canvas = renderCropToCanvas(image, crop, DETECT_OCR_ANALYSIS_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { labelRect: null };
  const { data } = ctx.getImageData(0, 0, DETECT_OCR_ANALYSIS_SIZE, DETECT_OCR_ANALYSIS_SIZE);
  return {
    labelRect: detectLabelRectFromData(
      data,
      DETECT_OCR_ANALYSIS_SIZE,
      labelWhiteThreshold,
    ),
  };
}

async function ocrRegionFromLabel(
  image: HTMLImageElement,
  crop: CropSquare,
  labelRect: LabelRect,
  textDarkThreshold = DETECT_OCR_TEXT_DARK_THRESHOLD,
): Promise<OcrRegion> {
  const canvas = renderCropToCanvas(image, crop, DETECT_OCR_TEXT_ANALYSIS_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const upscale = DETECT_OCR_TEXT_ANALYSIS_SIZE / DETECT_OCR_ANALYSIS_SIZE;
    const lc1 = Math.floor(labelRect.c1 * upscale);
    const lc2 = Math.ceil((labelRect.c2 + 1) * upscale) - 1;
    const lr1 = Math.floor(labelRect.r1 * upscale);
    const lr2 = Math.ceil((labelRect.r2 + 1) * upscale) - 1;
    const s = crop.size / DETECT_OCR_TEXT_ANALYSIS_SIZE;
    return clampOcrRegion(crop.size, {
      x: Math.round(lc1 * s),
      y: Math.round(lr1 * s),
      width: Math.round((lc2 - lc1 + 1) * s),
      height: Math.round((lr2 - lr1 + 1) * s),
      rotation: 0,
    });
  }
  const { data } = ctx.getImageData(
    0,
    0,
    DETECT_OCR_TEXT_ANALYSIS_SIZE,
    DETECT_OCR_TEXT_ANALYSIS_SIZE,
  );
  return ocrRegionFromLabelData(
    data,
    DETECT_OCR_ANALYSIS_SIZE,
    DETECT_OCR_TEXT_ANALYSIS_SIZE,
    labelRect,
    crop.size,
    textDarkThreshold,
  );
}

export async function detectOcrRegion(
  image: HTMLImageElement,
  crop: CropSquare,
  labelWhiteThreshold = DETECT_OCR_LABEL_WHITE_THRESHOLD,
  textDarkThreshold = DETECT_OCR_TEXT_DARK_THRESHOLD,
): Promise<{ ocrRegion: OcrRegion; labelRect: LabelRect | null }> {
  try {
    const { labelRect } = await detectLabelRect(
      image,
      crop,
      labelWhiteThreshold,
    );
    const ocrRegion = labelRect
      ? await ocrRegionFromLabel(image, crop, labelRect, textDarkThreshold)
      : defaultOcrRegion(crop.size);
    return { ocrRegion, labelRect };
  } catch {
    return { ocrRegion: defaultOcrRegion(crop.size), labelRect: null };
  }
}

export async function autoDetectOcrRegionForRecord(record: UploadedRecord) {
  if (!record.crop) throw new Error("Record is not cropped yet.");
  const image = await loadImageElement(record.sourceUrl);
  const crop = clampCrop(record.dimensions, record.crop);
  return detectOcrRegion(
    image,
    crop,
    record.ocrTuning.labelWhiteThreshold,
    record.ocrTuning.textDarkThreshold,
  );
}

export async function buildCropFile(record: UploadedRecord): Promise<File> {
  if (!record.crop) throw new Error("Record is not cropped yet.");
  const image = await loadImageElement(record.sourceUrl);
  const crop = clampCrop(record.dimensions, record.crop);
  const outputSize = Math.min(crop.size, 2000);
  const canvas = renderCropToCanvas(image, crop, outputSize);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to render crop image."));
      },
      "image/webp",
      0.85,
    );
  });
  const safeStem = record.filename.replace(/\.[^.]+$/, "") || "crop";
  return new File([blob], `${safeStem}.webp`, { type: "image/webp" });
}

const TESSERACT_USER_WORDS = [
  "RUNS",
  "Runs",
  "runs",
  "CAUTION",
  "Caution",
  "FOOD",
  "Food",
  "SAFE",
  "Safe",
  "NOT",
  "Not",
  "1st",
  "2nd",
  "3rd",
  "GLAZE",
  "Glaze",
  ";",
  ":",
].join("\n");

const OCR_ROTATION_OFFSETS = [0, 1, 2, -1, -2];

function rotateCanvasBy(
  canvas: HTMLCanvasElement,
  angleDeg: number,
): HTMLCanvasElement {
  if (angleDeg === 0) return canvas;
  const rotated = document.createElement("canvas");
  rotated.width = canvas.width;
  rotated.height = canvas.height;
  const ctx = rotated.getContext("2d");
  if (!ctx) return canvas;
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  ctx.restore();
  return rotated;
}

export async function runOcrOnRecord(
  record: UploadedRecord,
): Promise<{ text: string; confidence: number }> {
  if (!record.crop) throw new Error("Record is not cropped yet.");
  const image = await loadImageElement(record.sourceUrl);
  const crop = clampCrop(record.dimensions, record.crop);
  const cropCanvas = renderCropToCanvas(image, crop, crop.size);

  let ocrCanvas: HTMLCanvasElement;
  if (record.ocrRegion) {
    const region = record.ocrRegion;
    ocrCanvas = document.createElement("canvas");
    ocrCanvas.width = Math.max(1, region.width);
    ocrCanvas.height = Math.max(1, region.height);
    const ctx = ocrCanvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable.");
    const rcx = region.x + region.width / 2;
    const rcy = region.y + region.height / 2;
    ctx.save();
    ctx.translate(region.width / 2, region.height / 2);
    ctx.rotate((-region.rotation * Math.PI) / 180);
    ctx.drawImage(cropCanvas, -rcx, -rcy);
    ctx.restore();
  } else {
    ocrCanvas = cropCanvas;
  }

  const worker = await createWorker("eng");
  await worker.writeText("user-words.txt", TESSERACT_USER_WORDS);
  await worker.setParameters({ user_words: "user-words.txt" });
  let bestText = "";
  let bestConfidence = -1;
  for (const offset of OCR_ROTATION_OFFSETS) {
    const rotated = rotateCanvasBy(ocrCanvas, offset);
    const result = await worker.recognize(rotated);
    if (result.data.confidence > bestConfidence) {
      bestConfidence = result.data.confidence;
      bestText = result.data.text;
    }
  }
  await worker.terminate();
  return { text: bestText, confidence: bestConfidence };
}
