import type { CropSquare, LabelRect, OcrRegion } from "./ocrDetection";

export type ParsedFields = {
  name: string;
  kind: "glaze_type" | "glaze_combination";
  first_glaze: string;
  second_glaze: string;
  runs: boolean | null;
  is_food_safe: boolean | null;
};

export type OcrSuggestion = {
  rawText: string;
  suggestedName: string;
  suggestedKind: "glaze_type" | "glaze_combination";
  suggestedFirstGlaze: string;
  suggestedSecondGlaze: string;
  confidence: number | null;
};

export type OcrTuning = {
  labelWhiteThreshold: number;
  textDarkThreshold: number;
};

export type UploadedRecord = {
  id: string;
  file: File | null;
  sourceUrl: string;
  filename: string;
  dimensions: { width: number; height: number };
  crop: CropSquare | null;
  cropped: boolean;
  detectedLabelRect?: LabelRect | null;
  ocrRegion: OcrRegion | null;
  ocrTuning: OcrTuning;
  parsedFields: ParsedFields;
  ocrSuggestion: OcrSuggestion | null;
  reviewed: boolean;
  ocrStatus: "idle" | "running" | "done" | "error";
  ocrError: string | null;
  sourceKind: "local" | "cloudinary";
  cloudinaryPublicId: string | null;
};

export type UploadProgressEntry = {
  id: string;
  filename: string;
  status: "queued" | "processing" | "uploading" | "ready" | "error";
  progress: number;
  error: string | null;
};
