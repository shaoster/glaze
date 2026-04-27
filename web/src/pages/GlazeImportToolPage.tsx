import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Slider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import CropFreeIcon from "@mui/icons-material/CropFree";
import TextSnippetIcon from "@mui/icons-material/TextSnippet";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import MergeIcon from "@mui/icons-material/MergeType";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { createWorker } from "tesseract.js";
import {
  fetchCloudinaryWidgetConfig,
  importManualSquareCropRecords,
  signCloudinaryWidgetParams,
  type CloudinaryWidgetConfig,
  type ManualSquareCropImportResponse,
} from "../util/api";
import {
  clampOcrRegion,
  defaultOcrRegion,
  detectLabelRectFromData,
  ocrRegionFromLabelData,
  DETECT_OCR_ANALYSIS_SIZE,
  DETECT_OCR_TEXT_ANALYSIS_SIZE,
  DETECT_OCR_LABEL_WHITE_THRESHOLD,
  DETECT_OCR_TEXT_DARK_THRESHOLD,
  MIN_OCR_REGION_SIZE,
  type CropSquare,
  type OcrRegion,
  type LabelRect,
} from "./ocrDetection";

type ParsedFields = {
  name: string;
  kind: "glaze_type" | "glaze_combination";
  first_glaze: string;
  second_glaze: string;
  runs: boolean | null;
  is_food_safe: boolean | null;
};

type OcrSuggestion = {
  rawText: string;
  suggestedName: string;
  suggestedKind: "glaze_type" | "glaze_combination";
  suggestedFirstGlaze: string;
  suggestedSecondGlaze: string;
  confidence: number | null;
};

type UploadedRecord = {
  id: string;
  file: File | null;
  sourceUrl: string;
  filename: string;
  dimensions: { width: number; height: number };
  crop: CropSquare | null;
  detectedLabelRect?: LabelRect | null;
  ocrRegion: OcrRegion | null;
  parsedFields: ParsedFields;
  ocrSuggestion: OcrSuggestion | null;
  reviewed: boolean;
  ocrStatus: "idle" | "running" | "done" | "error";
  ocrError: string | null;
  sourceKind: "local" | "cloudinary";
  cloudinaryPublicId: string | null;
};

type CropDragState = {
  handle: "move" | "nw" | "ne" | "sw" | "se" | "rotate";
  startCrop: CropSquare;
  // move: pointer offset from box top-left in source coords
  // rotate: box center in source coords (fixed during rotation)
  // resize: unused (recomputed each frame from startCrop)
  anchorX: number;
  anchorY: number;
  startAngle: number; // rotate only: atan2 angle from center to pointer at drag start
};

type OcrDragState = {
  handle: "move" | "nw" | "ne" | "sw" | "se" | "rotate";
  startRegion: OcrRegion;
  anchorX: number;
  anchorY: number;
  startAngle: number;
};

type UploadProgressEntry = {
  id: string;
  filename: string;
  status: "queued" | "processing" | "uploading" | "ready" | "error";
  progress: number;
  error: string | null;
};

const MIN_CROP_SIZE = 96;
const COMBO_NAME_SEPARATOR = "!";
const TAB_UPLOAD = 0;
const TAB_CROP = 1;
const TAB_OCR = 2;
const TAB_REVIEW = 3;
const TAB_IMPORT = 4;
const TAB_RECONCILE = 5;

function createRecordId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

function buildCloudinaryJpgUrl(
  config: CloudinaryWidgetConfig,
  publicId: string,
) {
  return `https://res.cloudinary.com/${config.cloud_name}/image/upload/f_jpg/${publicId}.jpg`;
}

function defaultCrop(dimensions: {
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

// Canvas wrapper for phase 1: render the crop at analysis resolution and run
// detectLabelRectFromData on the resulting pixels.
async function detectLabelRect(
  image: HTMLImageElement,
  crop: CropSquare,
  labelWhiteThreshold = DETECT_OCR_LABEL_WHITE_THRESHOLD,
): Promise<{ labelRect: LabelRect | null }> {
  const N = DETECT_OCR_ANALYSIS_SIZE;
  const canvas = renderCropToCanvas(image, crop, N);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { labelRect: null };
  const { data } = ctx.getImageData(0, 0, N, N);
  return { labelRect: detectLabelRectFromData(data, N, labelWhiteThreshold) };
}

// Canvas wrapper for phase 2: render the crop at high resolution and run
// ocrRegionFromLabelData on the resulting pixels.
async function ocrRegionFromLabel(
  image: HTMLImageElement,
  crop: CropSquare,
  labelRect: LabelRect,
  textDarkThreshold = DETECT_OCR_TEXT_DARK_THRESHOLD,
): Promise<OcrRegion> {
  const N1 = DETECT_OCR_ANALYSIS_SIZE;
  const N2 = DETECT_OCR_TEXT_ANALYSIS_SIZE;
  const canvas = renderCropToCanvas(image, crop, N2);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Fallback: return full label rect mapped to crop coords.
    const upscale = N2 / N1;
    const lc1 = Math.floor(labelRect.c1 * upscale);
    const lc2 = Math.ceil((labelRect.c2 + 1) * upscale) - 1;
    const lr1 = Math.floor(labelRect.r1 * upscale);
    const lr2 = Math.ceil((labelRect.r2 + 1) * upscale) - 1;
    const s = crop.size / N2;
    return clampOcrRegion(crop.size, {
      x: Math.round(lc1 * s),
      y: Math.round(lr1 * s),
      width: Math.round((lc2 - lc1 + 1) * s),
      height: Math.round((lr2 - lr1 + 1) * s),
      rotation: 0,
    });
  }
  const { data } = ctx.getImageData(0, 0, N2, N2);
  return ocrRegionFromLabelData(
    data,
    N1,
    N2,
    labelRect,
    crop.size,
    textDarkThreshold,
  );
}

// Convenience wrapper: run both phases and return the OCR region.
async function detectOcrRegion(
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

function getOverflowPadding(dimensions: { width: number; height: number }) {
  return Math.max(dimensions.width, dimensions.height);
}

function getViewportPadding(dimensions: { width: number; height: number }) {
  return Math.min(
    180,
    Math.max(
      56,
      Math.round(Math.max(dimensions.width, dimensions.height) * 0.06),
    ),
  );
}

function clampCrop(
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

function rotatePt(x: number, y: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [
    x * Math.cos(rad) - y * Math.sin(rad),
    x * Math.sin(rad) + y * Math.cos(rad),
  ];
}

function titleCaseWords(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function sanitizeOcrText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Words fed to Tesseract's user_words file so the language model prefers
// these over visually similar alternatives (e.g. "1st" over "Ist").
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

const RUNS_RE = /caution\W{0,10}runs/i;
const NOT_FOOD_SAFE_RE = /not\s+food[\s-]?safe/i;

function detectRunsFromOcrText(text: string): true | null {
  return RUNS_RE.test(text) ? true : null;
}

function detectFoodSafeFromOcrText(text: string): false | null {
  return NOT_FOOD_SAFE_RE.test(text) ? false : null;
}

// Matches "1st Glaze: ..." lines, tolerating OCR confusions: I/1 and :/;
// Also matches spaceless forms like "IstGlaze:" that OCR sometimes produces.
const STRUCTURED_FIRST_RE = /^[I1l]st\s*[Gg]laze\s*[:;]\s*(.+)/;
// Matches "2nd Glaze: ..." lines, tolerating OCR confusions: 2/= and :/;
// Also matches spaceless forms like "2ndGlaze:" that OCR sometimes produces.
const STRUCTURED_SECOND_RE = /^[2=Z]nd\s*[Gg]laze\s*[:;]\s*(.+)/;

function parseOcrSuggestion(
  text: string,
  fallbackKind: ParsedFields["kind"],
): OcrSuggestion {
  const cleaned = sanitizeOcrText(text);
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /[A-Za-z]/.test(line));

  // Structured label detection takes priority: if the OCR output contains
  // labeled lines like "1st Glaze: Celadon" / "2nd Glaze: Shino", extract
  // them directly rather than relying on the token-split heuristic below.
  let structuredFirst: string | null = null;
  let structuredSecond: string | null = null;
  for (const line of lines) {
    const firstMatch = STRUCTURED_FIRST_RE.exec(line);
    if (firstMatch) structuredFirst = titleCaseWords(firstMatch[1].trim());
    const secondMatch = STRUCTURED_SECOND_RE.exec(line);
    if (secondMatch) structuredSecond = titleCaseWords(secondMatch[1].trim());
  }
  if (structuredFirst !== null || structuredSecond !== null) {
    const first = structuredFirst ?? "";
    const second = structuredSecond ?? "";
    const isCombo = structuredFirst !== null && structuredSecond !== null;
    return {
      rawText: cleaned,
      suggestedName: isCombo
        ? `${first}${COMBO_NAME_SEPARATOR}${second}`
        : first || second,
      suggestedKind: isCombo ? "glaze_combination" : fallbackKind,
      suggestedFirstGlaze: first,
      suggestedSecondGlaze: second,
      confidence: null,
    };
  }

  // Fallback: token-split heuristic for unlabeled combo lines.

  // Strip lines that carry property annotations (runs, food-safe warnings) so
  // they don't bleed into the glaze name.
  const nameLines = lines.filter(
    (line) => !RUNS_RE.test(line) && !NOT_FOOD_SAFE_RE.test(line),
  );

  // Use the longest line to detect combo separators (most likely to be the label).
  const bestLine =
    [...nameLines].sort(
      (a, b) =>
        b.replace(/[^A-Za-z]/g, "").length - a.replace(/[^A-Za-z]/g, "").length,
    )[0] || "";
  const normalized = bestLine
    .replace(/[_]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*!\s*/g, "!")
    .replace(/\s*\/\s*/g, " / ")
    .trim();
  const comboTokens = normalized
    .split(/!|\/|&|\+|\bover\b/gi)
    .map((token) =>
      titleCaseWords(
        token
          .replace(/[^A-Za-z\s-]/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      ),
    )
    .filter(Boolean);
  const isCombo = comboTokens.length >= 2;

  // For combinations: join title-cased tokens so each component is capitalized.
  // For glaze types: concatenate all non-annotation lines so multi-line labels
  // (e.g. brand on one line, name on the next) aren't truncated.
  const suggestedName = isCombo
    ? comboTokens.join("!")
    : titleCaseWords(
        nameLines
          .join(" ")
          .replace(/[^A-Za-z0-9!\s/-]/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim(),
      );

  return {
    rawText: cleaned,
    suggestedName,
    suggestedKind: isCombo ? "glaze_combination" : fallbackKind,
    suggestedFirstGlaze: comboTokens[0] || "",
    suggestedSecondGlaze: comboTokens[1] || "",
    confidence: null,
  };
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

async function buildCropFile(record: UploadedRecord): Promise<File> {
  if (!record.crop) throw new Error("Record is not cropped yet.");
  const image = await loadImageElement(record.sourceUrl);
  const crop = clampCrop(record.dimensions, record.crop);
  // Cap at 2000px to stay within Cloudinary's upload size limit.
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

// Rotation offsets (degrees) tried in order; the attempt with the highest
// Tesseract confidence score wins.
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

async function runOcrOnRecord(
  record: UploadedRecord,
): Promise<{ text: string; confidence: number }> {
  if (!record.crop) throw new Error("Record is not cropped yet.");
  const image = await loadImageElement(record.sourceUrl);
  const crop = clampCrop(record.dimensions, record.crop);
  // Full-resolution crop canvas (uncompressed) for accurate OCR.
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

  // Try each rotation offset and keep the result with the highest confidence.
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

function RecordList({
  records,
  selectedId,
  onSelect,
  onDelete,
  showReviewed,
  hideCropChip,
  showOcrRegionChip,
}: {
  records: UploadedRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  showReviewed?: boolean;
  hideCropChip?: boolean;
  showOcrRegionChip?: boolean;
}) {
  return (
    <List
      sx={{
        border: (theme) => `1px solid ${theme.palette.divider}`,
        borderRadius: 3,
        overflow: "auto",
      }}
    >
      {records.map((record) => (
        <ListItemButton
          key={record.id}
          selected={record.id === selectedId}
          onClick={() => onSelect(record.id)}
          sx={{ alignItems: "center", gap: 1 }}
        >
          <ListItemText
            primary={record.parsedFields.name || record.filename}
            slotProps={{ primary: { noWrap: true } }}
          />
          <Stack direction="row" spacing={0.5} flexShrink={0}>
            {!hideCropChip ? (
              <Chip
                label={record.crop ? "cropped" : "uncropped"}
                color={record.crop ? "success" : "error"}
                size="small"
              />
            ) : null}
            {showOcrRegionChip ? (
              <Chip
                label={record.ocrRegion ? "region set" : "no region"}
                color={record.ocrRegion ? "success" : "error"}
                size="small"
              />
            ) : null}
            {record.ocrStatus !== "idle" ? (
              <Chip
                label={
                  record.ocrStatus === "done" ? "ocr ready" : record.ocrStatus
                }
                color={
                  record.ocrStatus === "done"
                    ? "success"
                    : record.ocrStatus === "error"
                      ? "error"
                      : "default"
                }
                size="small"
              />
            ) : null}
            {showReviewed ? (
              <Chip
                label={record.reviewed ? "reviewed" : "unreviewed"}
                color={record.reviewed ? "success" : "default"}
                size="small"
              />
            ) : null}
          </Stack>
          <Button
            color="error"
            size="small"
            onClick={(event) => {
              event.stopPropagation();
              onDelete(record.id);
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </Button>
        </ListItemButton>
      ))}
    </List>
  );
}

export default function GlazeImportToolPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const ocrStageRef = useRef<HTMLDivElement | null>(null);
  const recordsRef = useRef<UploadedRecord[]>([]);

  const [activeTab, setActiveTab] = useState(TAB_UPLOAD);
  const [records, setRecords] = useState<UploadedRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [cropDragState, setCropDragState] = useState<CropDragState | null>(
    null,
  );
  const [ocrDragState, setOcrDragState] = useState<OcrDragState | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const [cropPreviewLoading, setCropPreviewLoading] = useState(false);
  // Debounced snapshot of the record used to generate the crop preview.
  // Only updated after 200ms of no crop changes so dragging stays snappy.
  const [previewRecord, setPreviewRecord] = useState<UploadedRecord | null>(
    null,
  );
  const [ocrRunning, setOcrRunning] = useState(false);
  const [labelWhiteThreshold, setLabelWhiteThreshold] = useState(
    DETECT_OCR_LABEL_WHITE_THRESHOLD,
  );
  const [textDarkThreshold, setTextDarkThreshold] = useState(
    DETECT_OCR_TEXT_DARK_THRESHOLD,
  );
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] =
    useState<ManualSquareCropImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressEntry[]>(
    [],
  );
  const [uploading, setUploading] = useState(false);
  const [widgetUploading, setWidgetUploading] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [importBuildProgress, setImportBuildProgress] = useState<
    UploadProgressEntry[]
  >([]);
  const [reconciledIds, setReconciledIds] = useState<Set<string>>(new Set());

  const selectedRecord =
    records.find((record) => record.id === selectedRecordId) ?? null;
  const allCropped =
    records.length > 0 && records.every((record) => record.crop);
  const allOcrDone =
    records.length > 0 &&
    records.every((record) => record.ocrStatus === "done");
  const allReviewed =
    records.length > 0 && records.every((record) => record.reviewed);
  const duplicateResults =
    importResult?.results.filter((r) => r.status === "skipped_duplicate") ?? [];
  const hasDuplicates = duplicateResults.length > 0;

  const selectedCrop = selectedRecord?.crop
    ? clampCrop(selectedRecord.dimensions, selectedRecord.crop)
    : null;
  const selectedOcrRegion =
    selectedRecord?.ocrRegion && selectedCrop
      ? clampOcrRegion(selectedCrop.size, selectedRecord.ocrRegion)
      : null;

  const selectedPadding = selectedRecord
    ? getViewportPadding(selectedRecord.dimensions)
    : 0;
  const selectedStageWidth = selectedRecord
    ? selectedRecord.dimensions.width + selectedPadding * 2
    : 1;
  const selectedStageHeight = selectedRecord
    ? selectedRecord.dimensions.height + selectedPadding * 2
    : 1;
  const selectedStageScale = selectedRecord
    ? Math.min(1, 760 / Math.max(selectedStageWidth, selectedStageHeight))
    : 1;

  // OCR stage display: the crop preview is a square of selectedCrop.size pixels
  const ocrStageDisplaySize = 360;
  const ocrStageScale = selectedCrop
    ? Math.min(1, ocrStageDisplaySize / selectedCrop.size)
    : 1;

  useEffect(() => {
    recordsRef.current = records;
  }, [records]);

  useEffect(() => {
    if (!window.cloudinary?.createUploadWidget) return;
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-cloudinary-widget="true"]',
    );
    if (existing) return;
    const script = document.createElement("script");
    script.src = "https://upload-widget.cloudinary.com/global/all.js";
    script.async = true;
    script.dataset.cloudinaryWidget = "true";
    document.body.appendChild(script);
  }, []);

  // Stable string key that only changes when the crop geometry changes.
  // Adjusting the OCR region leaves this key unchanged, so the preview is
  // not re-rendered (or even re-debounced) when only ocrRegion moves.
  const cropKey = selectedRecord
    ? `${selectedRecord.id}:${selectedRecord.crop ? `${selectedRecord.crop.x},${selectedRecord.crop.y},${selectedRecord.crop.size},${selectedRecord.crop.rotation}` : ""}`
    : "";
  const selectedRecordRef = useRef(selectedRecord);
  selectedRecordRef.current = selectedRecord;

  // Show the spinner immediately when the crop changes, then debounce the
  // actual preview render so rapid drag moves don't queue up buildCropFile calls.
  useEffect(() => {
    if (!selectedRecordRef.current?.crop) {
      setCropPreviewLoading(false);
      setPreviewRecord(selectedRecordRef.current);
      return;
    }
    setCropPreviewLoading(true);
    const timer = setTimeout(
      () => setPreviewRecord(selectedRecordRef.current),
      200,
    );
    return () => clearTimeout(timer);
    // cropKey is intentionally used as the sole dependency: only the crop
    // geometry (not ocrRegion or other fields) should trigger a preview rebuild.
  }, [cropKey]);

  useEffect(() => {
    let revokedUrl: string | null = null;
    async function refreshPreview() {
      if (!previewRecord || !previewRecord.crop) {
        setCropPreviewUrl(null);
        setCropPreviewLoading(false);
        return;
      }
      try {
        const file = await buildCropFile(previewRecord);
        const objectUrl = URL.createObjectURL(file);
        revokedUrl = objectUrl;
        setCropPreviewUrl(objectUrl);
      } catch {
        setCropPreviewUrl(null);
      } finally {
        setCropPreviewLoading(false);
      }
    }
    void refreshPreview();
    return () => {
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [previewRecord]);

  // Crop drag handling
  useEffect(() => {
    if (!cropDragState || !selectedRecord || !selectedRecord.crop) return;
    const currentDrag = cropDragState;

    function handlePointerMove(event: PointerEvent) {
      if (!cropStageRef.current || !selectedRecord) return;
      const rect = cropStageRef.current.getBoundingClientRect();
      const padding = getViewportPadding(selectedRecord.dimensions);
      const stageScale =
        rect.width / (selectedRecord.dimensions.width + padding * 2);
      const sourceX = (event.clientX - rect.left) / stageScale - padding;
      const sourceY = (event.clientY - rect.top) / stageScale - padding;

      const start = currentDrag.startCrop;
      let nextCrop: CropSquare = { ...start };
      if (currentDrag.handle === "rotate") {
        const currentAngle = Math.atan2(
          sourceY - currentDrag.anchorY,
          sourceX - currentDrag.anchorX,
        );
        const delta = ((currentAngle - currentDrag.startAngle) * 180) / Math.PI;
        nextCrop = { ...start, rotation: start.rotation + delta };
      } else if (currentDrag.handle === "move") {
        nextCrop = {
          ...start,
          x: sourceX - currentDrag.anchorX,
          y: sourceY - currentDrag.anchorY,
        };
      } else {
        // Rotation-aware resize: fix the opposite corner and scale the box.
        // fixedSign is +1 when the fixed corner is on the positive side of that axis.
        const fixedSignX =
          currentDrag.handle === "nw" || currentDrag.handle === "sw" ? 1 : -1;
        const fixedSignY =
          currentDrag.handle === "nw" || currentDrag.handle === "ne" ? 1 : -1;
        const cx = start.x + start.size / 2;
        const cy = start.y + start.size / 2;
        const [fRotX, fRotY] = rotatePt(
          (fixedSignX * start.size) / 2,
          (fixedSignY * start.size) / 2,
          start.rotation,
        );
        const fixedX = cx + fRotX;
        const fixedY = cy + fRotY;
        const [localDx, localDy] = rotatePt(
          sourceX - fixedX,
          sourceY - fixedY,
          -start.rotation,
        );
        const size = Math.max(
          Math.abs(localDx),
          Math.abs(localDy),
          MIN_CROP_SIZE,
        );
        const [newRotFx, newRotFy] = rotatePt(
          (fixedSignX * size) / 2,
          (fixedSignY * size) / 2,
          start.rotation,
        );
        const newCx = fixedX - newRotFx;
        const newCy = fixedY - newRotFy;
        nextCrop = { ...start, x: newCx - size / 2, y: newCy - size / 2, size };
      }

      setRecords((current) =>
        current.map((record) =>
          record.id === selectedRecord.id
            ? {
                ...record,
                crop: clampCrop(record.dimensions, nextCrop),
                reviewed: false,
              }
            : record,
        ),
      );
    }

    function handlePointerUp() {
      setCropDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [cropDragState, selectedRecord]);

  // OCR region drag handling
  useEffect(() => {
    if (!ocrDragState || !selectedRecord || !selectedCrop) return;
    const currentDrag = ocrDragState;
    const cropSize = selectedCrop.size;

    function handlePointerMove(event: PointerEvent) {
      if (!ocrStageRef.current || !selectedRecord) return;
      const rect = ocrStageRef.current.getBoundingClientRect();
      const scale = rect.width / cropSize;
      const sourceX = (event.clientX - rect.left) / scale;
      const sourceY = (event.clientY - rect.top) / scale;

      const start = currentDrag.startRegion;
      let next: OcrRegion = { ...start };

      if (currentDrag.handle === "rotate") {
        const currentAngle = Math.atan2(
          sourceY - currentDrag.anchorY,
          sourceX - currentDrag.anchorX,
        );
        const delta = ((currentAngle - currentDrag.startAngle) * 180) / Math.PI;
        next = { ...start, rotation: start.rotation + delta };
      } else if (currentDrag.handle === "move") {
        next = {
          ...start,
          x: sourceX - currentDrag.anchorX,
          y: sourceY - currentDrag.anchorY,
        };
      } else {
        // Rotation-aware resize: fix the opposite corner.
        const fixedSignX =
          currentDrag.handle === "nw" || currentDrag.handle === "sw" ? 1 : -1;
        const fixedSignY =
          currentDrag.handle === "nw" || currentDrag.handle === "ne" ? 1 : -1;
        const cx = start.x + start.width / 2;
        const cy = start.y + start.height / 2;
        const [fRotX, fRotY] = rotatePt(
          (fixedSignX * start.width) / 2,
          (fixedSignY * start.height) / 2,
          start.rotation,
        );
        const fixedX = cx + fRotX;
        const fixedY = cy + fRotY;
        const [localDx, localDy] = rotatePt(
          sourceX - fixedX,
          sourceY - fixedY,
          -start.rotation,
        );
        const width = Math.max(Math.abs(localDx), MIN_OCR_REGION_SIZE);
        const height = Math.max(Math.abs(localDy), MIN_OCR_REGION_SIZE);
        const [newRotFx, newRotFy] = rotatePt(
          (fixedSignX * width) / 2,
          (fixedSignY * height) / 2,
          start.rotation,
        );
        const newCx = fixedX - newRotFx;
        const newCy = fixedY - newRotFy;
        next = {
          ...start,
          x: newCx - width / 2,
          y: newCy - height / 2,
          width,
          height,
        };
      }

      setRecords((current) =>
        current.map((record) =>
          record.id === selectedRecord.id
            ? {
                ...record,
                ocrRegion: clampOcrRegion(cropSize, next),
                reviewed: false,
              }
            : record,
        ),
      );
    }

    function handlePointerUp() {
      setOcrDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [ocrDragState, selectedRecord, selectedCrop]);

  useEffect(
    () => () => {
      for (const record of recordsRef.current) {
        if (record.sourceKind === "local") {
          URL.revokeObjectURL(record.sourceUrl);
        }
      }
    },
    [],
  );

  async function handleFileSelection(fileList: FileList | null) {
    if (!fileList?.length) return;
    const files = Array.from(fileList);
    setUploading(true);
    setUploadProgress(
      files.map((file) => ({
        id: createRecordId(),
        filename: file.name,
        status: "queued",
        progress: 5,
        error: null,
      })),
    );
    const nextRecords: UploadedRecord[] = [];
    for (const [index, file] of files.entries()) {
      setUploadProgress((current) =>
        current.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, status: "processing", progress: 35, error: null }
            : entry,
        ),
      );
      const objectUrl = URL.createObjectURL(file);
      try {
        const image = await loadImageElement(objectUrl);
        nextRecords.push({
          id: createRecordId(),
          file,
          sourceUrl: objectUrl,
          filename: file.name,
          dimensions: {
            width: image.naturalWidth,
            height: image.naturalHeight,
          },
          crop: clampCrop(
            { width: image.naturalWidth, height: image.naturalHeight },
            defaultCrop({
              width: image.naturalWidth,
              height: image.naturalHeight,
            }),
          ),
          ...(await detectOcrRegion(
            image,
            clampCrop(
              { width: image.naturalWidth, height: image.naturalHeight },
              defaultCrop({
                width: image.naturalWidth,
                height: image.naturalHeight,
              }),
            ),
          )),
          parsedFields: {
            name: "",
            kind: "glaze_type",
            first_glaze: "",
            second_glaze: "",
            runs: null,
            is_food_safe: null,
          },
          ocrSuggestion: null,
          reviewed: false,
          ocrStatus: "idle",
          ocrError: null,
          sourceKind: "local",
          cloudinaryPublicId: null,
        });
        setUploadProgress((current) =>
          current.map((entry, entryIndex) =>
            entryIndex === index
              ? { ...entry, status: "ready", progress: 100, error: null }
              : entry,
          ),
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        setUploadProgress((current) =>
          current.map((entry, entryIndex) =>
            entryIndex === index
              ? {
                  ...entry,
                  status: "error",
                  progress: 100,
                  error: "This file could not be decoded in the browser.",
                }
              : entry,
          ),
        );
      }
    }
    setUploading(false);
    if (!nextRecords.length) return;
    setRecords((current) => [...current, ...nextRecords]);
    setSelectedRecordId(null);
    setImportResult(null);
    setActiveTab(TAB_CROP);
  }

  async function startCloudinaryUpload() {
    setWidgetError(null);
    setWidgetUploading(true);
    let config: CloudinaryWidgetConfig;
    try {
      config = await fetchCloudinaryWidgetConfig();
    } catch {
      setWidgetUploading(false);
      setWidgetError("Failed to load Cloudinary upload configuration.");
      return;
    }

    if (!window.cloudinary?.createUploadWidget) {
      setWidgetUploading(false);
      setWidgetError(
        "Cloudinary upload widget is not available in this browser.",
      );
      return;
    }

    const widget = window.cloudinary.createUploadWidget(
      {
        cloudName: config.cloud_name,
        apiKey: config.api_key,
        uploadSignature: (callback, paramsToSign) => {
          signCloudinaryWidgetParams(paramsToSign as Record<string, unknown>)
            .then(callback)
            .catch(() => setWidgetError("Failed to sign Cloudinary upload."));
        },
        ...(config.folder ? { folder: config.folder } : {}),
        sources: ["local"],
        multiple: true,
        resourceType: "image",
      },
      async (error, result) => {
        if (error) {
          setWidgetUploading(false);
          setWidgetError("Cloudinary upload failed.");
          return;
        }
        if (result?.event === "display-changed") {
          const displayState =
            typeof result.info === "string"
              ? result.info
              : (result.info as Record<string, unknown>)?.state;
          if (displayState === "shown") {
            setWidgetUploading(false);
          }
        }
        if (result?.event === "success") {
          const publicId = String(result.info.public_id || "");
          const originalFilename = String(
            result.info.original_filename || publicId || "upload",
          );
          const format = String(result.info.format || "");
          const filename = format
            ? `${originalFilename}.${format}`
            : originalFilename;
          const progressId = createRecordId();
          setUploadProgress((current) => [
            {
              id: progressId,
              filename,
              status: "uploading",
              progress: 70,
              error: null,
            },
            ...current,
          ]);
          try {
            const jpgUrl = buildCloudinaryJpgUrl(config, publicId);
            const image = await loadImageElement(jpgUrl);
            const cloudinaryDimensions = {
              width: image.naturalWidth,
              height: image.naturalHeight,
            };
            const cloudinaryCrop = clampCrop(
              cloudinaryDimensions,
              defaultCrop(cloudinaryDimensions),
            );
            const record: UploadedRecord = {
              id: createRecordId(),
              file: null,
              sourceUrl: jpgUrl,
              filename,
              dimensions: cloudinaryDimensions,
              crop: cloudinaryCrop,
              ...(await detectOcrRegion(image, cloudinaryCrop)),
              parsedFields: {
                name: "",
                kind: "glaze_type",
                first_glaze: "",
                second_glaze: "",
                runs: null,
                is_food_safe: null,
              },
              ocrSuggestion: null,
              reviewed: false,
              ocrStatus: "idle",
              ocrError: null,
              sourceKind: "cloudinary",
              cloudinaryPublicId: publicId,
            };
            setRecords((current) => [record, ...current]);
            setSelectedRecordId(null);
            setUploadProgress((current) =>
              current.map((entry) =>
                entry.id === progressId
                  ? { ...entry, status: "ready", progress: 100, error: null }
                  : entry,
              ),
            );
            setImportResult(null);
            setActiveTab(TAB_CROP);
          } catch {
            setUploadProgress((current) =>
              current.map((entry) =>
                entry.id === progressId
                  ? {
                      ...entry,
                      status: "error",
                      progress: 100,
                      error:
                        "Cloudinary upload succeeded, but the converted JPG could not be loaded.",
                    }
                  : entry,
              ),
            );
          }
        }
      },
    );

    widget.open();
  }

  function confirmDeleteRecord(id: string) {
    setDeleteConfirmId(id);
  }

  function executeDeleteRecord() {
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    if (!id) return;
    const record = records.find((item) => item.id === id);
    if (!record) return;
    if (record.sourceKind === "local") {
      URL.revokeObjectURL(record.sourceUrl);
    }
    const remaining = records.filter((item) => item.id !== id);
    setRecords(remaining);
    setSelectedRecordId((current) => {
      if (current !== id) return current;
      return remaining[0]?.id ?? null;
    });
  }

  function updateSelectedRecord(
    updater: (record: UploadedRecord) => UploadedRecord,
  ) {
    if (!selectedRecord) return;
    setRecords((current) =>
      current.map((record) =>
        record.id === selectedRecord.id ? updater(record) : record,
      ),
    );
  }

  function resetCropForSelected() {
    if (!selectedRecord) return;
    updateSelectedRecord((record) => {
      const crop = clampCrop(record.dimensions, defaultCrop(record.dimensions));
      return {
        ...record,
        crop,
        ocrRegion: defaultOcrRegion(crop.size),
        detectedLabelRect: null,
        reviewed: false,
        ocrSuggestion: null,
        ocrStatus: "idle",
        ocrError: null,
      };
    });
  }

  function resetOcrRegionForSelected() {
    if (!selectedRecord || !selectedRecord.crop) return;
    updateSelectedRecord((record) => ({
      ...record,
      ocrRegion: defaultOcrRegion(record.crop!.size),
      detectedLabelRect: null,
    }));
  }

  function startCropDrag(
    handle: CropDragState["handle"],
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!selectedRecord?.crop || !cropStageRef.current) return;
    const rect = cropStageRef.current.getBoundingClientRect();
    const padding = getViewportPadding(selectedRecord.dimensions);
    const stageScale =
      rect.width / (selectedRecord.dimensions.width + padding * 2);
    const sourceX = (event.clientX - rect.left) / stageScale - padding;
    const sourceY = (event.clientY - rect.top) / stageScale - padding;
    const crop = selectedRecord.crop;
    const cx = crop.x + crop.size / 2;
    const cy = crop.y + crop.size / 2;
    setCropDragState({
      handle,
      startCrop: crop,
      anchorX: handle === "move" ? sourceX - crop.x : cx,
      anchorY: handle === "move" ? sourceY - crop.y : cy,
      startAngle:
        handle === "rotate" ? Math.atan2(sourceY - cy, sourceX - cx) : 0,
    });
  }

  function startOcrDrag(
    handle: OcrDragState["handle"],
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!selectedRecord?.ocrRegion || !selectedCrop || !ocrStageRef.current)
      return;
    const rect = ocrStageRef.current.getBoundingClientRect();
    const scale = rect.width / selectedCrop.size;
    const sourceX = (event.clientX - rect.left) / scale;
    const sourceY = (event.clientY - rect.top) / scale;
    const region = selectedRecord.ocrRegion;
    const cx = region.x + region.width / 2;
    const cy = region.y + region.height / 2;
    setOcrDragState({
      handle,
      startRegion: region,
      anchorX: handle === "move" ? sourceX - region.x : cx,
      anchorY: handle === "move" ? sourceY - region.y : cy,
      startAngle:
        handle === "rotate" ? Math.atan2(sourceY - cy, sourceX - cx) : 0,
    });
  }

  async function runOcrForAllRecords() {
    if (!allCropped) return;
    setOcrRunning(true);
    setImportResult(null);
    for (const record of records) {
      setRecords((current) =>
        current.map((item) =>
          item.id === record.id
            ? { ...item, ocrStatus: "running", ocrError: null }
            : item,
        ),
      );
      try {
        const result = await runOcrOnRecord(record);
        const suggestion = parseOcrSuggestion(
          result.text || "",
          record.parsedFields.kind,
        );
        suggestion.confidence = Number.isFinite(result.confidence)
          ? result.confidence
          : null;
        setRecords((current) =>
          current.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  ocrSuggestion: suggestion,
                  ocrStatus: "done",
                  reviewed: false,
                  parsedFields: {
                    name: suggestion.suggestedName,
                    kind: suggestion.suggestedKind,
                    first_glaze: suggestion.suggestedFirstGlaze,
                    second_glaze: suggestion.suggestedSecondGlaze,
                    runs:
                      detectRunsFromOcrText(suggestion.rawText) ??
                      item.parsedFields.runs,
                    is_food_safe:
                      detectFoodSafeFromOcrText(suggestion.rawText) ??
                      item.parsedFields.is_food_safe,
                  },
                }
              : item,
          ),
        );
      } catch (error) {
        setRecords((current) =>
          current.map((item) =>
            item.id === record.id
              ? {
                  ...item,
                  ocrStatus: "error",
                  ocrError:
                    error instanceof Error ? error.message : String(error),
                  reviewed: false,
                }
              : item,
          ),
        );
      }
    }
    setOcrRunning(false);
    setSelectedRecordId(null);
    setActiveTab(TAB_REVIEW);
  }

  // Slider 1 callback: re-run Kadane 2D (phase 1) then clamp text (phase 2).
  const redetectLabelRects = useCallback(async () => {
    for (const record of recordsRef.current) {
      if (!record.crop) continue;
      const image = await loadImageElement(record.sourceUrl);
      const crop = clampCrop(record.dimensions, record.crop);
      const { ocrRegion, labelRect } = await detectOcrRegion(
        image,
        crop,
        labelWhiteThreshold,
        textDarkThreshold,
      );
      setRecords((current) =>
        current.map((item) =>
          item.id === record.id
            ? { ...item, ocrRegion, detectedLabelRect: labelRect }
            : item,
        ),
      );
    }
  }, [labelWhiteThreshold, textDarkThreshold]);

  // Slider 2 callback: skip Kadane 2D, re-clamp text within the cached label rect.
  const redetectTextRegions = useCallback(async () => {
    for (const record of recordsRef.current) {
      if (!record.crop || !record.detectedLabelRect) continue;
      const image = await loadImageElement(record.sourceUrl);
      const crop = clampCrop(record.dimensions, record.crop);
      const ocrRegion = await ocrRegionFromLabel(
        image,
        crop,
        record.detectedLabelRect,
        textDarkThreshold,
      );
      setRecords((current) =>
        current.map((item) =>
          item.id === record.id ? { ...item, ocrRegion } : item,
        ),
      );
    }
  }, [textDarkThreshold]);

  // Debounced auto-redetect: slider 1 re-runs both phases.
  useEffect(() => {
    if (activeTab !== TAB_OCR || recordsRef.current.length === 0) return;
    const timer = setTimeout(() => void redetectLabelRects(), 400);
    return () => clearTimeout(timer);
  }, [activeTab, redetectLabelRects]);

  // Debounced auto-redetect: slider 2 re-runs only phase 2.
  useEffect(() => {
    if (activeTab !== TAB_OCR || recordsRef.current.length === 0) return;
    const timer = setTimeout(() => void redetectTextRegions(), 400);
    return () => clearTimeout(timer);
  }, [activeTab, redetectTextRegions]);

  async function runImport() {
    if (!allReviewed) return;
    setImportRunning(true);
    setImportError(null);
    setImportResult(null);
    setReconciledIds(new Set());
    setImportBuildProgress(
      records.map((record) => ({
        id: record.id,
        filename: record.parsedFields.name || record.filename,
        status: "queued",
        progress: 0,
        error: null,
      })),
    );
    try {
      const cropFiles: Record<string, File> = {};
      for (const record of records) {
        setImportBuildProgress((current) =>
          current.map((entry) =>
            entry.id === record.id
              ? { ...entry, status: "processing", progress: 40 }
              : entry,
          ),
        );
        cropFiles[record.id] = await buildCropFile(record);
        setImportBuildProgress((current) =>
          current.map((entry) =>
            entry.id === record.id
              ? { ...entry, status: "uploading", progress: 80 }
              : entry,
          ),
        );
      }
      const result = await importManualSquareCropRecords(
        records.map((record) => ({
          client_id: record.id,
          filename: record.filename,
          reviewed: record.reviewed,
          parsed_fields: record.parsedFields,
        })),
        cropFiles,
      );
      setImportBuildProgress((current) =>
        current.map((entry) => ({ ...entry, status: "ready", progress: 100 })),
      );
      setImportResult(result);
      setActiveTab(TAB_IMPORT);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
      setImportBuildProgress((current) =>
        current.map((entry) =>
          entry.status !== "ready"
            ? { ...entry, status: "error", progress: 100 }
            : entry,
        ),
      );
    } finally {
      setImportRunning(false);
    }
  }

  const deleteConfirmRecord =
    records.find((r) => r.id === deleteConfirmId) ?? null;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Glaze Import Tool
        </Typography>
        <Typography color="text.secondary">
          Bulk upload source images, crop each record into a transparency-safe
          square, run OCR on the cropped result, review the parsed fields, then
          import new public glaze records while skipping duplicates.
        </Typography>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={(_event, nextValue) => {
          if (
            nextValue === TAB_CROP ||
            nextValue === TAB_OCR ||
            nextValue === TAB_REVIEW
          ) {
            setSelectedRecordId(null);
          }
          setActiveTab(nextValue);
        }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab
          icon={<UploadFileIcon />}
          iconPosition="start"
          label="1. Upload"
          value={TAB_UPLOAD}
        />
        <Tab
          icon={<CropFreeIcon />}
          iconPosition="start"
          label="2. Crop"
          value={TAB_CROP}
          disabled={records.length === 0}
        />
        <Tab
          icon={<TextSnippetIcon />}
          iconPosition="start"
          label="3. OCR"
          value={TAB_OCR}
          disabled={!allCropped}
        />
        <Tab
          icon={<FactCheckIcon />}
          iconPosition="start"
          label="4. Review"
          value={TAB_REVIEW}
          disabled={!allOcrDone}
        />
        <Tab
          icon={<CloudUploadIcon />}
          iconPosition="start"
          label="5. Import"
          value={TAB_IMPORT}
          disabled={!allReviewed && !importResult}
        />
        {hasDuplicates ? (
          <Tab
            icon={<MergeIcon />}
            iconPosition="start"
            label="6. Reconcile"
            value={TAB_RECONCILE}
          />
        ) : null}
      </Tabs>

      {activeTab === TAB_UPLOAD ? (
        <Stack spacing={2}>
          <Alert severity="info">
            Start by bulk uploading the source images. Each uploaded image
            becomes its own record and starts uncropped.
          </Alert>
          <Alert severity="warning">
            Browser-side upload works best for JPG and PNG. For `.heic` and
            `.heif`, use `Upload Via Cloudinary` so Cloudinary can convert the
            source before the crop tool loads it.
          </Alert>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            hidden
            onChange={(event) => {
              void handleFileSelection(event.target.files);
              event.target.value = "";
            }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              variant="contained"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Processing Images…" : "Bulk Upload Images"}
            </Button>
            <Button
              variant="outlined"
              onClick={() => void startCloudinaryUpload()}
              disabled={widgetUploading}
            >
              {widgetUploading
                ? "Opening Cloudinary…"
                : "Upload Via Cloudinary"}
            </Button>
            {records.length > 0 ? (
              <Button variant="outlined" onClick={() => setActiveTab(TAB_CROP)}>
                Continue To Crop
              </Button>
            ) : null}
          </Stack>
          {widgetError ? <Alert severity="error">{widgetError}</Alert> : null}
          {uploadProgress.length > 0 ? (
            <Stack spacing={1.5}>
              <Typography variant="subtitle1">Upload Progress</Typography>
              <List
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 3,
                }}
              >
                {uploadProgress.map((entry) => (
                  <Box key={entry.id} sx={{ px: 2, py: 1.5 }}>
                    <Stack spacing={0.75}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        spacing={2}
                      >
                        <Typography variant="body2">
                          {entry.filename}
                        </Typography>
                        <Typography
                          variant="body2"
                          color={
                            entry.status === "error"
                              ? "error"
                              : "text.secondary"
                          }
                        >
                          {entry.status === "queued" ? "Queued" : null}
                          {entry.status === "processing"
                            ? "Reading metadata…"
                            : null}
                          {entry.status === "uploading"
                            ? "Converting via Cloudinary…"
                            : null}
                          {entry.status === "ready" ? "Ready" : null}
                          {entry.status === "error" ? "Error" : null}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={entry.progress}
                        color={
                          entry.status === "error"
                            ? "error"
                            : entry.status === "ready"
                              ? "success"
                              : "primary"
                        }
                      />
                      {entry.error ? (
                        <Typography variant="body2" color="error">
                          {entry.error}
                        </Typography>
                      ) : null}
                    </Stack>
                  </Box>
                ))}
              </List>
            </Stack>
          ) : null}
          {records.length > 0 ? (
            <>
              <Typography variant="subtitle1">Uploaded Records</Typography>
              <RecordList
                records={records}
                selectedId={selectedRecordId}
                onSelect={setSelectedRecordId}
                onDelete={confirmDeleteRecord}
                showReviewed
              />
            </>
          ) : (
            <Typography color="text.secondary">
              No records uploaded yet.
            </Typography>
          )}
        </Stack>
      ) : null}

      {activeTab === TAB_CROP ? (
        <Stack spacing={2}>
          <Alert severity="info">
            Each image starts with a default crop covering the full image. Drag
            the white box to adjust the crop region. The crop square can extend
            beyond the image bounds; any overflow becomes transparent in the
            final crop.
          </Alert>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 320px" },
            }}
          >
            {selectedRecordId == null ? (
              <RecordList
                records={records}
                selectedId={selectedRecordId}
                onSelect={setSelectedRecordId}
                onDelete={confirmDeleteRecord}
              />
            ) : (
              <Stack spacing={2}>
                {selectedRecord ? (
                  <>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button
                        onClick={(evt) => {
                          setSelectedRecordId(null);
                          evt.stopPropagation();
                        }}
                      >
                        ← Back to Records
                      </Button>
                      <Chip label={selectedRecord.filename} />
                      <Chip
                        label={selectedRecord.crop ? "cropped" : "uncropped"}
                        color={selectedRecord.crop ? "success" : "default"}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Button
                        variant="outlined"
                        onClick={resetCropForSelected}
                        disabled={!selectedRecord.crop}
                      >
                        Reset Crop
                      </Button>
                      {allCropped ? (
                        <Button
                          variant="outlined"
                          onClick={() => setActiveTab(TAB_OCR)}
                        >
                          Continue To OCR
                        </Button>
                      ) : null}
                    </Stack>
                    <Box
                      sx={{
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        borderRadius: 3,
                        overflow: "auto",
                        p: 2,
                        bgcolor: "#181511",
                      }}
                    >
                      <Box
                        ref={cropStageRef}
                        sx={{
                          position: "relative",
                          width: selectedStageWidth * selectedStageScale,
                          height: selectedStageHeight * selectedStageScale,
                          mx: "auto",
                          touchAction: "none",
                          backgroundImage:
                            "linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.04) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.04) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.04) 75%)",
                          backgroundSize: "24px 24px",
                          backgroundPosition:
                            "0 0, 0 12px, 12px -12px, -12px 0px",
                        }}
                      >
                        <Box
                          component="img"
                          src={selectedRecord.sourceUrl}
                          alt={selectedRecord.filename}
                          sx={{
                            position: "absolute",
                            left: selectedPadding * selectedStageScale,
                            top: selectedPadding * selectedStageScale,
                            width:
                              selectedRecord.dimensions.width *
                              selectedStageScale,
                            height:
                              selectedRecord.dimensions.height *
                              selectedStageScale,
                            userSelect: "none",
                            WebkitUserDrag: "none",
                          }}
                        />
                        {selectedCrop ? (
                          <Box
                            onPointerDown={(
                              event: ReactPointerEvent<HTMLDivElement>,
                            ) => startCropDrag("move", event)}
                            sx={{
                              position: "absolute",
                              left:
                                (selectedCrop.x + selectedPadding) *
                                selectedStageScale,
                              top:
                                (selectedCrop.y + selectedPadding) *
                                selectedStageScale,
                              width: selectedCrop.size * selectedStageScale,
                              height: selectedCrop.size * selectedStageScale,
                              transform: `rotate(${selectedCrop.rotation}deg)`,
                              transformOrigin: "center",
                              border: "2px solid white",
                              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.42)",
                              cursor: "move",
                              bgcolor: "rgba(255,255,255,0.08)",
                              "&::before, &::after": {
                                content: '""',
                                position: "absolute",
                                bgcolor: "rgba(255,255,255,0.72)",
                              },
                              "&::before": {
                                left: "50%",
                                top: 0,
                                width: "1px",
                                height: "100%",
                                transform: "translateX(-50%)",
                              },
                              "&::after": {
                                top: "50%",
                                left: 0,
                                width: "100%",
                                height: "1px",
                                transform: "translateY(-50%)",
                              },
                            }}
                          >
                            {/* Rotation handle — above the top-center edge, rotates with the box */}
                            <Box
                              onPointerDown={(
                                event: ReactPointerEvent<HTMLDivElement>,
                              ) => {
                                event.stopPropagation();
                                startCropDrag("rotate", event);
                              }}
                              sx={{
                                position: "absolute",
                                left: "50%",
                                top: -30,
                                transform: "translateX(-50%)",
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                bgcolor: "#2196f3",
                                border: "2px solid white",
                                cursor: "grab",
                                "&:active": { cursor: "grabbing" },
                              }}
                            />
                            {(["nw", "ne", "sw", "se"] as const).map(
                              (handle) => (
                                <Box
                                  key={handle}
                                  onPointerDown={(
                                    event: ReactPointerEvent<HTMLDivElement>,
                                  ) => {
                                    event.stopPropagation();
                                    startCropDrag(handle, event);
                                  }}
                                  sx={{
                                    position: "absolute",
                                    width: 16,
                                    height: 16,
                                    borderRadius: "50%",
                                    bgcolor: "white",
                                    border: "2px solid #8f4e21",
                                    ...(handle === "nw"
                                      ? {
                                          left: -8,
                                          top: -8,
                                          cursor: "nwse-resize",
                                        }
                                      : {}),
                                    ...(handle === "ne"
                                      ? {
                                          right: -8,
                                          top: -8,
                                          cursor: "nesw-resize",
                                        }
                                      : {}),
                                    ...(handle === "sw"
                                      ? {
                                          left: -8,
                                          bottom: -8,
                                          cursor: "nesw-resize",
                                        }
                                      : {}),
                                    ...(handle === "se"
                                      ? {
                                          right: -8,
                                          bottom: -8,
                                          cursor: "nwse-resize",
                                        }
                                      : {}),
                                  }}
                                />
                              ),
                            )}
                          </Box>
                        ) : null}
                      </Box>
                    </Box>
                  </>
                ) : (
                  <Typography color="text.secondary">
                    Select a record to crop it.
                  </Typography>
                )}
              </Stack>
            )}
            <Stack spacing={2}>
              <Typography variant="subtitle1">Crop Preview</Typography>
              <Box
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 3,
                  aspectRatio: "1 / 1",
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: "rgba(255,255,255,0.06)",
                }}
              >
                {cropPreviewLoading ? (
                  <CircularProgress size={32} />
                ) : cropPreviewUrl ? (
                  <Box
                    component="img"
                    src={cropPreviewUrl}
                    alt="Crop preview"
                    sx={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <Typography
                    color="text.secondary"
                    sx={{ p: 2, textAlign: "center" }}
                  >
                    Create a crop to preview the transparency-safe square
                    result.
                  </Typography>
                )}
              </Box>
              {selectedRecord ? (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Source: {selectedRecord.dimensions.width} ×{" "}
                    {selectedRecord.dimensions.height}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Crop:{" "}
                    {selectedCrop
                      ? `${selectedCrop.x}, ${selectedCrop.y}, ${selectedCrop.size}`
                      : "not set"}
                  </Typography>
                </>
              ) : null}
            </Stack>
          </Box>
        </Stack>
      ) : null}

      {activeTab === TAB_OCR ? (
        <Stack spacing={2}>
          <Alert severity="info">
            Each record starts with a default OCR region covering the center of
            the crop. Drag the yellow box to adjust the region containing the
            text label. OCR runs only on the selected region.
          </Alert>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={3}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" gutterBottom>
                Label sensitivity: {labelWhiteThreshold.toFixed(2)}
              </Typography>
              <Slider
                min={0.5}
                max={0.98}
                step={0.01}
                value={labelWhiteThreshold}
                onChange={(_, v) => setLabelWhiteThreshold(v as number)}
                size="small"
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" gutterBottom>
                Text sensitivity: {(0.2 + 0.85 - textDarkThreshold).toFixed(2)}
              </Typography>
              <Slider
                min={0.2}
                max={0.85}
                step={0.01}
                value={0.2 + 0.85 - textDarkThreshold}
                onChange={(_, v) =>
                  setTextDarkThreshold(0.2 + 0.85 - (v as number))
                }
                size="small"
              />
            </Box>
            <Box sx={{ display: "flex", alignItems: "flex-end", pb: 0.5 }}>
              <Button
                variant="outlined"
                size="small"
                disabled={!allCropped || ocrRunning}
                onClick={() => void redetectLabelRects()}
              >
                Re-detect All Regions
              </Button>
            </Box>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "320px minmax(0, 1fr)" },
            }}
          >
            <RecordList
              records={records}
              selectedId={selectedRecordId}
              onSelect={setSelectedRecordId}
              onDelete={confirmDeleteRecord}
              hideCropChip
              showOcrRegionChip
            />
            <Stack spacing={2}>
              {selectedRecord ? (
                <>
                  <Stack
                    direction="row"
                    spacing={1}
                    flexWrap="wrap"
                    alignItems="center"
                  >
                    <Chip label={selectedRecord.filename} />
                    <Chip
                      label={
                        selectedRecord.ocrRegion
                          ? "region set"
                          : "no region (full crop)"
                      }
                      color={selectedRecord.ocrRegion ? "primary" : "default"}
                    />
                    {selectedRecord.ocrStatus === "running" ? (
                      <CircularProgress size={18} />
                    ) : null}
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={resetOcrRegionForSelected}
                      disabled={!selectedRecord.ocrRegion}
                    >
                      Reset OCR Region
                    </Button>
                  </Stack>
                  {cropPreviewLoading ? (
                    <CircularProgress
                      size={32}
                      sx={{ alignSelf: "flex-start", m: 1 }}
                    />
                  ) : cropPreviewUrl && selectedCrop ? (
                    <Box
                      sx={{
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        borderRadius: 3,
                        overflow: "hidden",
                        display: "inline-block",
                        bgcolor: "rgba(255,255,255,0.06)",
                        touchAction: "none",
                        alignSelf: "flex-start",
                      }}
                    >
                      <Box
                        ref={ocrStageRef}
                        sx={{
                          position: "relative",
                          width: selectedCrop.size * ocrStageScale,
                          height: selectedCrop.size * ocrStageScale,
                        }}
                      >
                        <Box
                          component="img"
                          src={cropPreviewUrl}
                          alt="OCR region selector"
                          sx={{
                            display: "block",
                            width: "100%",
                            height: "100%",
                            userSelect: "none",
                            WebkitUserDrag: "none",
                          }}
                        />
                        {selectedOcrRegion ? (
                          <Box
                            onPointerDown={(
                              event: ReactPointerEvent<HTMLDivElement>,
                            ) => startOcrDrag("move", event)}
                            sx={{
                              position: "absolute",
                              left: selectedOcrRegion.x * ocrStageScale,
                              top: selectedOcrRegion.y * ocrStageScale,
                              width: selectedOcrRegion.width * ocrStageScale,
                              height: selectedOcrRegion.height * ocrStageScale,
                              transform: `rotate(${selectedOcrRegion.rotation}deg)`,
                              transformOrigin: "center",
                              border: "2px solid #f0c040",
                              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.38)",
                              cursor: "move",
                              bgcolor: "rgba(240, 192, 64, 0.08)",
                            }}
                          >
                            {/* Rotation handle — above the top-center edge, rotates with the box */}
                            <Box
                              onPointerDown={(
                                event: ReactPointerEvent<HTMLDivElement>,
                              ) => {
                                event.stopPropagation();
                                startOcrDrag("rotate", event);
                              }}
                              sx={{
                                position: "absolute",
                                left: "50%",
                                top: -26,
                                transform: "translateX(-50%)",
                                width: 14,
                                height: 14,
                                borderRadius: "50%",
                                bgcolor: "#2196f3",
                                border: "2px solid #7a6010",
                                cursor: "grab",
                                "&:active": { cursor: "grabbing" },
                              }}
                            />
                            {(["nw", "ne", "sw", "se"] as const).map(
                              (handle) => (
                                <Box
                                  key={handle}
                                  onPointerDown={(
                                    event: ReactPointerEvent<HTMLDivElement>,
                                  ) => {
                                    event.stopPropagation();
                                    startOcrDrag(handle, event);
                                  }}
                                  sx={{
                                    position: "absolute",
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    bgcolor: "#f0c040",
                                    border: "2px solid #7a6010",
                                    ...(handle === "nw"
                                      ? {
                                          left: -7,
                                          top: -7,
                                          cursor: "nwse-resize",
                                        }
                                      : {}),
                                    ...(handle === "ne"
                                      ? {
                                          right: -7,
                                          top: -7,
                                          cursor: "nesw-resize",
                                        }
                                      : {}),
                                    ...(handle === "sw"
                                      ? {
                                          left: -7,
                                          bottom: -7,
                                          cursor: "nesw-resize",
                                        }
                                      : {}),
                                    ...(handle === "se"
                                      ? {
                                          right: -7,
                                          bottom: -7,
                                          cursor: "nwse-resize",
                                        }
                                      : {}),
                                  }}
                                />
                              ),
                            )}
                          </Box>
                        ) : null}
                      </Box>
                    </Box>
                  ) : (
                    <Typography color="text.secondary">
                      Crop this record first to set an OCR region.
                    </Typography>
                  )}
                  {selectedRecord.ocrSuggestion ? (
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">
                        Last OCR result
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Confidence:{" "}
                        {selectedRecord.ocrSuggestion.confidence != null
                          ? `${Math.round(selectedRecord.ocrSuggestion.confidence)}%`
                          : "n/a"}
                      </Typography>
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: "rgba(255,255,255,0.05)",
                          whiteSpace: "pre-wrap",
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                        }}
                      >
                        {selectedRecord.ocrSuggestion.rawText ||
                          "No text found."}
                      </Box>
                    </Stack>
                  ) : null}
                  {selectedRecord.ocrError ? (
                    <Alert severity="error">{selectedRecord.ocrError}</Alert>
                  ) : null}
                </>
              ) : (
                <Typography color="text.secondary">
                  Select a record to set its OCR region.
                </Typography>
              )}
            </Stack>
          </Box>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ sm: "center" }}
          >
            <Button
              variant="contained"
              onClick={() => void runOcrForAllRecords()}
              disabled={!allCropped || ocrRunning}
            >
              {ocrRunning ? "Running OCR…" : "Run OCR For All Records"}
            </Button>
            {ocrRunning ? <CircularProgress size={22} /> : null}
            {allOcrDone ? (
              <Button
                variant="outlined"
                onClick={() => setActiveTab(TAB_REVIEW)}
              >
                Continue To Review
              </Button>
            ) : null}
          </Stack>
        </Stack>
      ) : null}

      {activeTab === TAB_REVIEW ? (
        <Stack spacing={2}>
          <Alert severity="info">
            Every record starts unreviewed after OCR. Fix any parsing issues,
            then check the review box for each record.
          </Alert>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "320px minmax(0, 1fr)" },
            }}
          >
            <RecordList
              records={records}
              selectedId={selectedRecordId}
              onSelect={setSelectedRecordId}
              onDelete={confirmDeleteRecord}
              showReviewed
            />
            {selectedRecord ? (
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" gutterBottom>
                      Cropped Preview
                    </Typography>
                    <Box
                      sx={{
                        border: (theme) => `1px solid ${theme.palette.divider}`,
                        borderRadius: 3,
                        aspectRatio: "1 / 1",
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: "rgba(255,255,255,0.06)",
                      }}
                    >
                      {cropPreviewLoading ? (
                        <CircularProgress size={32} />
                      ) : cropPreviewUrl ? (
                        <Box
                          component="img"
                          src={cropPreviewUrl}
                          alt="Reviewed crop preview"
                          sx={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                          }}
                        />
                      ) : null}
                    </Box>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Stack
                      direction="row"
                      alignItems="baseline"
                      spacing={1}
                      sx={{ mb: 1 }}
                    >
                      <Typography variant="subtitle1">OCR Raw Text</Typography>
                      {selectedRecord.ocrSuggestion?.confidence != null ? (
                        <Typography variant="body2" color="text.secondary">
                          confidence:{" "}
                          {Math.round(selectedRecord.ocrSuggestion.confidence)}%
                        </Typography>
                      ) : null}
                    </Stack>
                    <Box
                      sx={{
                        p: 2,
                        borderRadius: 2,
                        minHeight: 220,
                        bgcolor: "rgba(255,255,255,0.05)",
                        whiteSpace: "pre-wrap",
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      {selectedRecord.ocrSuggestion?.rawText ||
                        selectedRecord.ocrError ||
                        "No OCR output."}
                    </Box>
                  </Box>
                </Stack>
                <Divider />
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField
                    label="Parsed name"
                    fullWidth
                    value={selectedRecord.parsedFields.name}
                    disabled={
                      selectedRecord.parsedFields.kind === "glaze_combination"
                    }
                    helperText={
                      selectedRecord.parsedFields.kind === "glaze_combination"
                        ? "Auto-computed from glaze fields"
                        : undefined
                    }
                    onChange={(event) =>
                      updateSelectedRecord((record) => ({
                        ...record,
                        parsedFields: {
                          ...record.parsedFields,
                          name: event.target.value,
                        },
                        reviewed: false,
                      }))
                    }
                  />
                  <TextField
                    label="Parsed kind"
                    select
                    fullWidth
                    slotProps={{ select: { native: true } }}
                    value={selectedRecord.parsedFields.kind}
                    onChange={(event) =>
                      updateSelectedRecord((record) => {
                        const kind = event.target.value as ParsedFields["kind"];
                        const name =
                          kind === "glaze_combination"
                            ? `${record.parsedFields.first_glaze}${COMBO_NAME_SEPARATOR}${record.parsedFields.second_glaze}`
                            : record.parsedFields.name;
                        return {
                          ...record,
                          parsedFields: { ...record.parsedFields, kind, name },
                          reviewed: false,
                        };
                      })
                    }
                  >
                    <option value="glaze_type">glaze_type</option>
                    <option value="glaze_combination">glaze_combination</option>
                  </TextField>
                </Stack>
                {selectedRecord.parsedFields.kind === "glaze_combination" ? (
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="Parsed 1st glaze"
                      fullWidth
                      value={selectedRecord.parsedFields.first_glaze}
                      onChange={(event) =>
                        updateSelectedRecord((record) => {
                          const first_glaze = event.target.value;
                          const name = `${first_glaze}${COMBO_NAME_SEPARATOR}${record.parsedFields.second_glaze}`;
                          return {
                            ...record,
                            parsedFields: {
                              ...record.parsedFields,
                              first_glaze,
                              name,
                            },
                            reviewed: false,
                          };
                        })
                      }
                    />
                    <TextField
                      label="Parsed 2nd glaze"
                      fullWidth
                      value={selectedRecord.parsedFields.second_glaze}
                      onChange={(event) =>
                        updateSelectedRecord((record) => {
                          const second_glaze = event.target.value;
                          const name = `${record.parsedFields.first_glaze}${COMBO_NAME_SEPARATOR}${second_glaze}`;
                          return {
                            ...record,
                            parsedFields: {
                              ...record.parsedFields,
                              second_glaze,
                              name,
                            },
                            reviewed: false,
                          };
                        })
                      }
                    />
                  </Stack>
                ) : null}
                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <TextField
                    label="Runs?"
                    select
                    fullWidth
                    slotProps={{
                      select: { native: true },
                      inputLabel: { shrink: true },
                    }}
                    value={
                      selectedRecord.parsedFields.runs === null
                        ? ""
                        : String(selectedRecord.parsedFields.runs)
                    }
                    helperText={
                      selectedRecord.parsedFields.runs === null
                        ? "Not specified"
                        : undefined
                    }
                    onChange={(event) =>
                      updateSelectedRecord((record) => ({
                        ...record,
                        parsedFields: {
                          ...record.parsedFields,
                          runs:
                            event.target.value === ""
                              ? null
                              : event.target.value === "true",
                        },
                        reviewed: false,
                      }))
                    }
                  >
                    <option value="" />
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </TextField>
                  <TextField
                    label="Food safe?"
                    select
                    fullWidth
                    slotProps={{
                      select: { native: true },
                      inputLabel: { shrink: true },
                    }}
                    value={
                      selectedRecord.parsedFields.is_food_safe === null
                        ? ""
                        : String(selectedRecord.parsedFields.is_food_safe)
                    }
                    helperText={
                      selectedRecord.parsedFields.is_food_safe === null
                        ? "Not specified"
                        : undefined
                    }
                    onChange={(event) =>
                      updateSelectedRecord((record) => ({
                        ...record,
                        parsedFields: {
                          ...record.parsedFields,
                          is_food_safe:
                            event.target.value === ""
                              ? null
                              : event.target.value === "true",
                        },
                        reviewed: false,
                      }))
                    }
                  >
                    <option value="" />
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </TextField>
                </Stack>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={selectedRecord.reviewed}
                      onChange={(event) =>
                        updateSelectedRecord((record) => ({
                          ...record,
                          reviewed: event.target.checked,
                        }))
                      }
                    />
                  }
                  label="This record has been reviewed and is ready for import."
                />
                {allReviewed ? (
                  <Button
                    variant="contained"
                    onClick={() => setActiveTab(TAB_IMPORT)}
                  >
                    Continue To Import
                  </Button>
                ) : null}
              </Stack>
            ) : (
              <Typography color="text.secondary">
                Select a record to review it.
              </Typography>
            )}
          </Box>
        </Stack>
      ) : null}

      {activeTab === TAB_IMPORT ? (
        <Stack spacing={2}>
          <Alert severity="info">
            Import creates new public glaze types and glaze combinations and
            skips duplicates that already exist in the public library.
          </Alert>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ sm: "center" }}
          >
            <Button
              variant="contained"
              onClick={() => void runImport()}
              disabled={!allReviewed || importRunning}
            >
              {importRunning ? "Importing…" : "Run Bulk Import"}
            </Button>
            {!allReviewed ? (
              <Typography color="text.secondary">
                Review every record before importing.
              </Typography>
            ) : null}
            {importRunning ? <CircularProgress size={22} /> : null}
          </Stack>
          {importError ? <Alert severity="error">{importError}</Alert> : null}
          {importBuildProgress.length > 0 ? (
            <Stack spacing={1.5}>
              <Typography variant="subtitle1">Build Progress</Typography>
              <List
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 3,
                }}
              >
                {importBuildProgress.map((entry) => (
                  <Box key={entry.id} sx={{ px: 2, py: 1.5 }}>
                    <Stack spacing={0.75}>
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        spacing={2}
                      >
                        <Typography variant="body2">
                          {entry.filename}
                        </Typography>
                        <Typography
                          variant="body2"
                          color={
                            entry.status === "error"
                              ? "error"
                              : "text.secondary"
                          }
                        >
                          {entry.status === "queued" ? "Queued" : null}
                          {entry.status === "processing"
                            ? "Building crop…"
                            : null}
                          {entry.status === "uploading" ? "Uploading…" : null}
                          {entry.status === "ready" ? "Done" : null}
                          {entry.status === "error" ? "Error" : null}
                        </Typography>
                      </Stack>
                      <LinearProgress
                        variant="determinate"
                        value={entry.progress}
                        color={
                          entry.status === "error"
                            ? "error"
                            : entry.status === "ready"
                              ? "success"
                              : "primary"
                        }
                      />
                      {entry.error ? (
                        <Typography variant="body2" color="error">
                          {entry.error}
                        </Typography>
                      ) : null}
                    </Stack>
                  </Box>
                ))}
              </List>
            </Stack>
          ) : null}
          {importResult ? (
            <Stack spacing={2}>
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                alignItems="center"
              >
                <Chip
                  color="success"
                  label={`${importResult.summary.created_glaze_types} glaze types created`}
                />
                <Chip
                  color="success"
                  label={`${importResult.summary.created_glaze_combinations} combinations created`}
                />
                <Chip
                  label={`${importResult.summary.skipped_duplicates} duplicates skipped`}
                  color={hasDuplicates ? "warning" : "default"}
                />
                <Chip
                  color={importResult.summary.errors ? "error" : "default"}
                  label={`${importResult.summary.errors} errors`}
                />
                {hasDuplicates ? (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setActiveTab(TAB_RECONCILE)}
                  >
                    Reconcile Duplicates →
                  </Button>
                ) : null}
              </Stack>
              <List
                sx={{
                  border: (theme) => `1px solid ${theme.palette.divider}`,
                  borderRadius: 3,
                }}
              >
                {importResult.results.map((result) => {
                  const adminPath = result.object_id
                    ? `/admin/api/${result.kind.replace("_", "")}/${result.object_id}/change/`
                    : null;
                  return (
                    <ListItemButton
                      key={result.client_id}
                      {...(adminPath
                        ? {
                            component: "a",
                            href: adminPath,
                            target: "_blank",
                            rel: "noopener noreferrer",
                          }
                        : { disabled: true })}
                    >
                      <ListItemText
                        primary={`${result.name || result.filename} — ${result.status}`}
                        secondary={result.reason || result.kind}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      {activeTab === TAB_RECONCILE ? (
        <Stack spacing={2}>
          <Alert severity="info">
            These records were skipped because an entry with the same name
            already exists in the public library. Review the scraped data below,
            open the existing record in the admin, and update it manually if
            needed. Check each record as resolved when done.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            {reconciledIds.size} / {duplicateResults.length} resolved
          </Typography>
          <Stack spacing={2}>
            {duplicateResults.map((result) => {
              const sourceRecord = records.find(
                (r) => r.id === result.client_id,
              );
              const adminPath = result.object_id
                ? `/admin/api/${result.kind.replace("_", "")}/${result.object_id}/change/`
                : null;
              const isResolved = reconciledIds.has(result.client_id);
              return (
                <Box
                  key={result.client_id}
                  sx={{
                    border: (theme) =>
                      `1px solid ${isResolved ? theme.palette.success.main : theme.palette.divider}`,
                    borderRadius: 2,
                    p: 2,
                    opacity: isResolved ? 0.6 : 1,
                    transition: "opacity 0.15s, border-color 0.15s",
                  }}
                >
                  <Stack spacing={1.5}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <Typography variant="subtitle1" sx={{ flex: 1 }}>
                        {result.name || result.filename}
                      </Typography>
                      <Chip label={result.kind} size="small" />
                      {adminPath ? (
                        <Button
                          size="small"
                          variant="outlined"
                          href={adminPath}
                          target="_blank"
                          rel="noopener noreferrer"
                          component="a"
                          endIcon={<OpenInNewIcon fontSize="small" />}
                        >
                          Open in Admin
                        </Button>
                      ) : null}
                    </Stack>
                    {sourceRecord ? (
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fill, minmax(160px, 1fr))",
                          gap: 1,
                        }}
                      >
                        {Object.entries(sourceRecord.parsedFields).map(
                          ([key, value]) => (
                            <Box key={key}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                              >
                                {key.replace(/_/g, " ")}
                              </Typography>
                              <Typography variant="body2">
                                {value === null ? "—" : String(value)}
                              </Typography>
                            </Box>
                          ),
                        )}
                      </Box>
                    ) : null}
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={isResolved}
                          onChange={(event) =>
                            setReconciledIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked)
                                next.add(result.client_id);
                              else next.delete(result.client_id);
                              return next;
                            })
                          }
                        />
                      }
                      label="Resolved"
                    />
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Stack>
      ) : null}

      <Dialog
        open={deleteConfirmId != null}
        onClose={() => setDeleteConfirmId(null)}
      >
        <DialogTitle>Delete record?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteConfirmRecord?.filename} will be removed from this session.
            This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={executeDeleteRecord}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
